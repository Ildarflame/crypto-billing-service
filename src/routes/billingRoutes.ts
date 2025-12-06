import { Router, Request, Response } from 'express';
import { getPlanByCode } from '../models/planService';
import { createSubscription } from '../models/subscriptionService';
import { createInvoice, updateInvoice } from '../models/invoiceService';
import { createPayment } from '../integrations/nowpaymentsClient';
import { getInvoiceById } from '../models/invoiceService';
import { createError } from '../middlewares/errorHandler';
import { CreateSubscriptionRequest } from '../types/api';

const router = Router();

/**
 * POST /api/billing/create-subscription
 * Create a subscription + invoice and forward to NOWPayments
 */
router.post('/create-subscription', async (req: Request, res: Response, next) => {
  try {
    const body: CreateSubscriptionRequest = req.body;
    const { planCode, userEmail, productCode, currency, successRedirectUrl, cancelRedirectUrl } = body;

    // Validate input
    if (!planCode || !userEmail || !productCode) {
      throw createError('Missing required fields: planCode, userEmail, productCode', 400);
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

    // Create subscription
    const subscription = await createSubscription({
      userEmail,
      productCode,
      planId: plan.id,
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
      const successUrl = successRedirectUrl || 'https://shadowintern.xyz/billing/success';
      const cancelUrl = cancelRedirectUrl || 'https://shadowintern.xyz/billing/cancel';

      const nowpaymentsResponse = await createPayment({
        amountUsd: plan.priceUsd,
        orderId: invoice.id,
        successUrl,
        cancelUrl,
        customerEmail: userEmail,
        payCurrency: currency ? currency.toUpperCase() : undefined, // Optional: let user choose if not provided
      });

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

export default router;

