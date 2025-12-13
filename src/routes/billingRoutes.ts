import { Router, Request, Response } from 'express';
import { getPlanByCode } from '../models/planService';
import { createSubscription } from '../models/subscriptionService';
import { createInvoice, updateInvoice } from '../models/invoiceService';
import { createPayment } from '../integrations/nowpaymentsClient';
import { getInvoiceById } from '../models/invoiceService';
import { createError } from '../middlewares/errorHandler';
import { CreateSubscriptionRequest } from '../types/api';
import { validateInviteCodeOrThrow } from '../services/inviteCodeService';
import type { ReceiptEmailData } from '../services/email/templates/receipt';
import prisma from '../db/prisma';

const router = Router();

/**
 * POST /api/billing/create-subscription
 * Create a subscription + invoice and forward to NOWPayments
 */
router.post('/create-subscription', async (req: Request, res: Response, next) => {
  try {
    const body: CreateSubscriptionRequest = req.body;
    const { planCode, userEmail, productCode, inviteCode, successRedirectUrl, cancelRedirectUrl } = body;

    // Validate input
    if (!planCode || !userEmail || !productCode) {
      throw createError('Missing required fields: planCode, userEmail, productCode', 400);
    }

    // Validate invite code (required)
    if (!inviteCode || typeof inviteCode !== 'string') {
      throw createError('Invite / referral code is required', 400);
    }

    // Validate and get invite code entity
    let inviteCodeEntity;
    try {
      inviteCodeEntity = await validateInviteCodeOrThrow(inviteCode);
    } catch (validationError: any) {
      if (validationError.code) {
        throw createError(
          validationError.message || 'Invite code is invalid or expired',
          400
        );
      }
      throw validationError;
    }

    // Validate email format (basic check)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail)) {
      throw createError('Invalid email format', 400);
    }

    // Validate redirect URLs if provided
    if (successRedirectUrl && !successRedirectUrl.startsWith('http')) {
      throw createError('successRedirectUrl must be a valid HTTP(S) URL', 400);
    }
    if (cancelRedirectUrl && !cancelRedirectUrl.startsWith('http')) {
      throw createError('cancelRedirectUrl must be a valid HTTP(S) URL', 400);
    }

    // Find the plan
    const plan = await getPlanByCode(planCode);
    if (!plan) {
      throw createError(`Plan not found: ${planCode}`, 404);
    }

    // Create subscription with invite code
    const subscription = await createSubscription({
      userEmail,
      productCode,
      planId: plan.id,
      inviteCodeId: inviteCodeEntity.id,
    });

    // Create invoice
    const invoice = await createInvoice({
      subscriptionId: subscription.id,
      planId: plan.id,
      amountUsd: plan.priceUsd,
    });

    // Create payment on NOWPayments
    let paymentProvider: string = '';
    let providerPaymentId: string = '';
    let providerInvoiceUrl: string = '';

    try {
      // Build redirect URLs (use defaults if not provided)
      const baseSuccessUrl = successRedirectUrl || 'https://shadowintern.xyz/billing/success';
      const baseCancelUrl = cancelRedirectUrl || 'https://shadowintern.xyz/billing/cancel';

      // Enrich URLs with subscriptionId and email query parameters
      const successUrl = new URL(baseSuccessUrl);
      successUrl.searchParams.set('subscriptionId', subscription.id);
      successUrl.searchParams.set('email', subscription.userEmail);

      const cancelUrl = new URL(baseCancelUrl);
      cancelUrl.searchParams.set('subscriptionId', subscription.id);
      cancelUrl.searchParams.set('email', subscription.userEmail);

      // Build NOWPayments payload
      const nowPayload = {
        amountUsd: plan.priceUsd,
        orderId: subscription.id,
        successUrl: successUrl.toString(),
        cancelUrl: cancelUrl.toString(),
        customerEmail: userEmail,
      };

      // Debug log to verify URLs being sent to NOWPayments
      console.log('[billing] NOWPayments success_url:', successUrl.toString());
      console.log('[billing] NOWPayments cancel_url:', cancelUrl.toString());

      const nowpaymentsResponse = await createPayment(nowPayload);

      paymentProvider = 'nowpayments';
      providerPaymentId = nowpaymentsResponse.paymentId;
      providerInvoiceUrl = nowpaymentsResponse.paymentUrl;

      // Update invoice with NOWPayments info
      await updateInvoice(invoice.id, {
        paymentProvider,
        providerPaymentId,
        providerInvoiceUrl,
      });
    } catch (nowpaymentsError) {
      console.error('[Billing] Failed to create NOWPayments payment:', nowpaymentsError);
      // Still return the invoice, but without payment provider info
      // The invoice can be updated later when NOWPayments is available
    }

    // Return response
    res.status(201).json({
      subscriptionId: subscription.id,
      invoiceId: invoice.id,
      plan: {
        code: plan.code,
        name: plan.name,
        priceUsd: plan.priceUsd,
        durationDays: plan.durationDays,
      },
      payment: {
        provider: paymentProvider || null,
        paymentId: providerPaymentId || null,
        paymentUrl: providerInvoiceUrl || null,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/billing/subscription-status
 * Get subscription status and licenseKey by subscriptionId and email
 */
router.get('/subscription-status', async (req: Request, res: Response) => {
  try {
    const subscriptionId = req.query.subscriptionId as string | undefined;
    const email = req.query.email as string | undefined;

    // Debug log
    console.log(
      '[GET /api/billing/subscription-status] subscriptionId:',
      req.query.subscriptionId,
      'email:',
      req.query.email,
    );

    if (!subscriptionId || !email) {
      return res.status(400).json({
        error: 'Missing subscriptionId or email',
      });
    }

    // Fetch subscription from DB with plan relation
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    if (!subscription) {
      return res.status(404).json({
        error: 'Subscription not found',
      });
    }

    // Verify email to avoid leaking data to random callers
    if (subscription.userEmail.toLowerCase() !== email.toLowerCase()) {
      return res.status(403).json({
        error: 'Email does not match subscription',
      });
    }

    // Return subscription status with all relevant fields
    return res.status(200).json({
      id: subscription.id,
      status: subscription.status,
      planCode: subscription.plan.code,
      licenseKey: subscription.licenseKey ?? null,
      expiresAt: subscription.expiresAt?.toISOString() ?? null,
      userEmail: subscription.userEmail,
    });
  } catch (err) {
    console.error('[GET /api/billing/subscription-status] Error:', err);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/billing/invoice/:id
 * Get invoice details
 */
router.get('/invoice/:id', async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;

    const invoice = await getInvoiceById(id);
    if (!invoice) {
      throw createError(`Invoice not found: ${id}`, 404);
    }

    res.json({
      invoiceId: invoice.id,
      status: invoice.status,
      amountUsd: invoice.amountUsd,
      planCode: invoice.plan.code,
      subscriptionId: invoice.subscriptionId,
      payment: {
        provider: invoice.paymentProvider || null,
        paymentId: invoice.providerPaymentId || null,
        paymentUrl: invoice.providerInvoiceUrl || null,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/billing/receipt/:invoiceId?token=...
 * Download receipt PDF (requires signed token)
 */
router.get('/receipt/:invoiceId', async (req: Request, res: Response, next) => {
  try {
    const { invoiceId } = req.params;
    const token = req.query.token as string | undefined;

    if (!token) {
      throw createError('Missing token parameter', 401);
    }

    // Verify token
    const { verifyReceiptToken } = await import('../utils/receiptToken');
    let payload;
    try {
      payload = verifyReceiptToken(token);
    } catch (error: any) {
      console.warn('[Receipt Download] Invalid token:', error.message);
      throw createError('Invalid or expired token', 401);
    }

    // Verify invoiceId matches
    if (payload.invoiceId !== invoiceId) {
      throw createError('Token invoice ID mismatch', 401);
    }

    // Load invoice
    const invoice = await getInvoiceById(invoiceId);
    if (!invoice) {
      throw createError(`Invoice not found: ${invoiceId}`, 404);
    }

    // Verify email matches
    if (invoice.subscription.userEmail.toLowerCase() !== payload.email.toLowerCase()) {
      throw createError('Token email mismatch', 401);
    }

    // Only allow download for paid invoices
    if (invoice.status !== 'paid') {
      throw createError('Invoice is not paid', 400);
    }

    // Generate PDF
    const { generateReceiptPdf } = await import('../services/receipt/receiptPdf');

    const emailData: ReceiptEmailData = {
      userEmail: invoice.subscription.userEmail,
      receiptNumber: invoice.receiptNumber || 'N/A',
      invoiceId: invoice.id,
      subscriptionId: invoice.subscriptionId,
      planCode: invoice.plan.code,
      planName: invoice.plan.name,
      amountUsd: invoice.amountUsd,
      providerPaymentId: invoice.providerPaymentId,
      orderId: invoice.subscriptionId,
      paidAt: invoice.paidAt || invoice.updatedAt,
      licenseKey: invoice.subscription.licenseKey,
    };

    const pdfBuffer = await generateReceiptPdf(emailData);

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="receipt-${invoice.receiptNumber || invoice.id}.pdf"`
    );
    res.setHeader('Content-Length', pdfBuffer.length.toString());

    res.send(pdfBuffer);
  } catch (error: any) {
    if (error.statusCode) {
      next(error);
    } else {
      console.error('[Receipt Download] Error:', error);
      next(createError('Internal server error', 500));
    }
  }
});

export default router;

