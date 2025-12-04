import { Router, Request, Response } from 'express';
import { KeagateWebhookPayload } from '../types/api';
import { getInvoiceByKeagateId, updateInvoice, getInvoiceByIdInternal } from '../models/invoiceService';
import { getSubscriptionById, updateSubscription, computeSubscriptionExpiration } from '../models/subscriptionService';
import { createPayment } from '../models/paymentService';
import { createOrExtendLicense } from '../integrations/shadowInternClient';
import { verifyWebhookSignature } from '../integrations/keagateClient';
import { createError } from '../middlewares/errorHandler';

const router = Router();

/**
 * POST /api/webhooks/keagate
 * Keagate webhook / IPN endpoint
 * 
 * Note: This route uses express.raw() middleware to preserve the raw body
 * for HMAC signature verification. The body is available as a Buffer.
 */
router.post('/keagate', async (req: Request, res: Response, next) => {
  try {
    // Get raw body as Buffer (from express.raw() middleware)
    const rawBody = req.body as Buffer;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      console.error('[Keagate Webhook] Raw body is not available as Buffer');
      return res.status(400).json({ error: 'Invalid request body' });
    }

    // Get signature header
    const signatureHeader = req.headers['x-keagate-sig'] as string | undefined;

    // Verify webhook signature
    const isValid = verifyWebhookSignature(rawBody, signatureHeader);
    if (!isValid) {
      console.warn('[Keagate Webhook] Invalid signature, rejecting request');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse JSON payload
    let payload: KeagateWebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch (parseError) {
      console.error('[Keagate Webhook] Failed to parse JSON payload:', parseError);
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    console.log('[Keagate Webhook] Received IPN:', {
      event: payload.event,
      status: payload.status,
      id: payload.id || payload.invoiceId || payload.paymentId,
      extraId: payload.extraId,
      currency: payload.currency,
      amount: payload.amount,
    });

    // Determine payment status from event or status field
    const paymentStatus = payload.status || payload.event || '';
    const isConfirmed = paymentStatus === 'CONFIRMED' || 
                       paymentStatus === 'PAID' || 
                       payload.event === 'payment_confirmed';

    // Only process confirmed/paid payments
    if (!isConfirmed) {
      console.log(`[Keagate Webhook] Ignoring non-confirmed status: ${paymentStatus}`);
      return res.status(200).json({ received: true, message: 'Status not confirmed' });
    }

    // Extract identifiers
    const keagatePaymentId = payload.id || payload.invoiceId || payload.paymentId;
    const extraId = payload.extraId; // Our internal invoice ID
    const txHash = payload.txHash;
    const currency = payload.currency;
    const network = payload.network;
    const amount = payload.amount;

    if (!currency || !amount) {
      console.error('[Keagate Webhook] Missing required fields:', payload);
      return res.status(400).json({ error: 'Missing required fields: currency, amount' });
    }

    // Find invoice by extraId (preferred) or by Keagate payment ID
    let invoice = null;
    if (extraId) {
      invoice = await getInvoiceByIdInternal(extraId);
      if (invoice) {
        console.log(`[Keagate Webhook] Found invoice by extraId: ${extraId}`);
      }
    }

    if (!invoice && keagatePaymentId) {
      invoice = await getInvoiceByKeagateId(keagatePaymentId);
      if (invoice) {
        console.log(`[Keagate Webhook] Found invoice by Keagate ID: ${keagatePaymentId}`);
      }
    }

    if (!invoice) {
      console.warn(`[Keagate Webhook] Invoice not found for extraId: ${extraId}, keagateId: ${keagatePaymentId}`);
      // Return 200 to avoid webhook retry loops
      return res.status(200).json({ received: true, message: 'Invoice not found' });
    }

    // Check if invoice is already paid (idempotency)
    if (invoice.status === 'paid') {
      console.log(`[Keagate Webhook] Invoice ${invoice.id} is already paid, skipping (idempotency)`);
      return res.status(200).json({ received: true, message: 'Already processed' });
    }

    // Create payment record (only if txHash is provided)
    if (txHash) {
      await createPayment({
        invoiceId: invoice.id,
        txHash,
        chain: network || currency, // Use network if available, fallback to currency
        tokenSymbol: currency,
        amountToken: amount,
        status: 'confirmed',
      });
      console.log(`[Keagate Webhook] Created payment record for invoice ${invoice.id}`);
    }

    // Update invoice
    await updateInvoice(invoice.id, {
      status: 'paid',
      paidAt: new Date(),
    });
    console.log(`[Keagate Webhook] Updated invoice ${invoice.id} to paid status`);

    // Get subscription with plan
    const subscription = await getSubscriptionById(invoice.subscriptionId);
    if (!subscription) {
      console.error(`[Keagate Webhook] Subscription not found: ${invoice.subscriptionId}`);
      return res.status(500).json({ error: 'Subscription not found' });
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
    console.log(`[Keagate Webhook] Updated subscription ${subscription.id} to ${subscriptionStatus}`);

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

      console.log(`[Keagate Webhook] Successfully created/extended license for subscription ${subscription.id}`);
    } catch (licenseError) {
      console.error('[Keagate Webhook] Failed to create/extend license:', licenseError);
      // Mark subscription with special status
      await updateSubscription(subscription.id, {
        status: 'payment_received_but_license_failed',
      });
      // Still return 200 to acknowledge webhook, but log the error
    }

    res.status(200).json({ received: true, processed: true });
  } catch (error) {
    console.error('[Keagate Webhook] Error processing webhook:', error);
    next(error);
  }
});

export default router;
