import { Router, Request, Response } from 'express';
import { NowpaymentsWebhookPayload } from '../types/api';
import { updateInvoice, getInvoiceByIdInternal, getInvoiceByProviderPaymentId } from '../models/invoiceService';
import { getSubscriptionById, updateSubscription, computeSubscriptionExpiration } from '../models/subscriptionService';
import { createOrExtendLicense } from '../integrations/shadowInternClient';
import { verifyWebhookSignature as verifyNowpaymentsWebhookSignature } from '../integrations/nowpaymentsClient';
import { createError } from '../middlewares/errorHandler';

const router = Router();

/**
 * POST /api/webhooks/nowpayments
 * NOWPayments webhook / IPN endpoint
 * 
 * Note: This route uses express.raw() middleware to preserve the raw body
 * for HMAC signature verification. The body is available as a Buffer.
 */
router.post('/nowpayments', async (req: Request, res: Response, next) => {
  try {
    // Get raw body as Buffer (from express.raw() middleware)
    const rawBody = req.body as Buffer;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      console.error('[NOWPayments Webhook] Raw body is not available as Buffer');
      return res.status(400).json({ error: 'Invalid request body' });
    }

    // Verify webhook signature
    const isValid = verifyNowpaymentsWebhookSignature(rawBody, req.headers);
    if (!isValid) {
      console.warn('[NOWPayments Webhook] Invalid signature, rejecting request');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse JSON payload
    let payload: NowpaymentsWebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch (parseError) {
      console.error('[NOWPayments Webhook] Failed to parse JSON payload:', parseError);
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    console.log('[NOWPayments Webhook] Received IPN:', {
      payment_id: payload.payment_id,
      payment_status: payload.payment_status,
      order_id: payload.order_id,
      price_amount: payload.price_amount,
      price_currency: payload.price_currency,
    });

    // Convert payment_id to string (NOWPayments sends it as a number, but our DB stores it as string)
    const paymentIdRaw = payload.payment_id;
    const providerPaymentId = paymentIdRaw != null ? String(paymentIdRaw) : null;
    const paymentStatus = payload.payment_status;
    const orderId = payload.order_id; // Our internal invoice ID

    if (!providerPaymentId || !paymentStatus) {
      console.error('[NOWPayments Webhook] Missing required fields:', payload);
      return res.status(400).json({ error: 'Missing required fields: payment_id, payment_status' });
    }

    // Debug log to verify we're using a string
    console.log(
      '[NOWPayments Webhook] Using providerPaymentId for lookup:',
      providerPaymentId,
      'type=',
      typeof providerPaymentId,
    );

    // Find invoice by order_id (preferred) or by payment_id
    let invoice = null;
    if (orderId) {
      invoice = await getInvoiceByIdInternal(orderId);
      if (invoice) {
        console.log(`[NOWPayments Webhook] Found invoice by order_id: ${orderId}`);
      }
    }

    if (!invoice && providerPaymentId) {
      invoice = await getInvoiceByProviderPaymentId(providerPaymentId);
      if (invoice) {
        console.log(`[NOWPayments Webhook] Found invoice by payment_id: ${providerPaymentId}`);
      }
    }

    if (!invoice) {
      console.warn(`[NOWPayments Webhook] Invoice not found for order_id: ${orderId}, payment_id: ${providerPaymentId}`);
      // Return 200 to avoid webhook retry loops
      return res.status(200).json({ status: 'ok', message: 'Invoice not found' });
    }

    // Determine if payment is successful
    // 'finished' is the final success status, 'confirmed' is also acceptable
    const isSuccessful = paymentStatus === 'finished' || paymentStatus === 'confirmed';
    const isFinalFailure = paymentStatus === 'failed' || paymentStatus === 'expired' || paymentStatus === 'refunded';

    // Check if invoice is already paid (idempotency)
    if (invoice.status === 'paid' && isSuccessful) {
      console.log(`[NOWPayments Webhook] Invoice ${invoice.id} is already paid, skipping (idempotency)`);
      return res.status(200).json({ status: 'ok', message: 'Already processed' });
    }

    // Update invoice status based on payment status
    if (isSuccessful) {
      // Update invoice to paid
      await updateInvoice(invoice.id, {
        status: 'paid',
        paidAt: new Date(),
      });
      console.log(`[NOWPayments Webhook] Updated invoice ${invoice.id} to paid status`);
    } else if (isFinalFailure) {
      // Update invoice to failed/expired
      await updateInvoice(invoice.id, {
        status: paymentStatus === 'expired' ? 'expired' : 'canceled',
      });
      console.log(`[NOWPayments Webhook] Updated invoice ${invoice.id} to ${paymentStatus} status`);
      // Return early for failures - no need to process license
      return res.status(200).json({ status: 'ok', message: 'Payment failed' });
    } else {
      // Intermediate status (waiting, confirming, etc.) - just log and return
      console.log(`[NOWPayments Webhook] Payment ${providerPaymentId} is in intermediate status: ${paymentStatus}`);
      return res.status(200).json({ status: 'ok', message: `Status: ${paymentStatus}` });
    }

    // Only process license creation for successful payments (isSuccessful is true at this point)

    // Get subscription with plan
    const subscription = await getSubscriptionById(invoice.subscriptionId);
    if (!subscription) {
      console.error(`[NOWPayments Webhook] Subscription not found: ${invoice.subscriptionId}`);
      return res.status(500).json({ error: 'Subscription not found' });
    }

    // Check if subscription is already active (idempotency)
    if (subscription.status === 'active' && invoice.status === 'paid') {
      console.log(`[NOWPayments Webhook] Subscription ${subscription.id} is already active, skipping license creation (idempotency)`);
      return res.status(200).json({ status: 'ok', message: 'Already processed' });
    }

    // Compute new expiration dates
    const expiration = computeSubscriptionExpiration({
      plan: subscription.plan,
      currentStartsAt: subscription.startsAt,
      currentExpiresAt: subscription.expiresAt,
    });

    // Determine subscription status
    let subscriptionStatus = 'active';
    if (subscription.status === 'pending_payment') {
      subscriptionStatus = 'active';
    } else if (subscription.status === 'active') {
      subscriptionStatus = 'active'; // Renewal
    }

    // Update subscription
    await updateSubscription(subscription.id, {
      status: subscriptionStatus,
      startsAt: expiration.startsAt,
      expiresAt: expiration.expiresAt,
    });
    console.log(`[NOWPayments Webhook] Updated subscription ${subscription.id} to ${subscriptionStatus}`);

    // Call Shadow Intern admin API to create/extend license
    try {
      const licenseResponse = await createOrExtendLicense({
        userEmail: subscription.userEmail,
        planCode: subscription.plan.code,
        startsAt: expiration.startsAt,
        expiresAt: expiration.expiresAt,
        maxRequestsPerDay: subscription.plan.maxRequestsPerDay,
      });

      // Update subscription with license key
      await updateSubscription(subscription.id, {
        licenseKey: licenseResponse.licenseKey,
      });

      console.log(`[NOWPayments Webhook] Successfully created/extended license for subscription ${subscription.id}`);
    } catch (licenseError) {
      console.error('[NOWPayments Webhook] Failed to create/extend license:', licenseError);
      // Mark subscription with special status
      await updateSubscription(subscription.id, {
        status: 'payment_received_but_license_failed',
      });
      // Still return 200 to acknowledge webhook, but log the error
    }

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('[NOWPayments Webhook] Error processing webhook:', error);
    next(error);
  }
});

export default router;
