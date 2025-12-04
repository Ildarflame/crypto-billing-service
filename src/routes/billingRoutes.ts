import { Router, Request, Response } from 'express';
import { getPlanByCode } from '../models/planService';
import { createSubscription } from '../models/subscriptionService';
import { createInvoice, updateInvoice } from '../models/invoiceService';
import { createInvoice as createKeagateInvoice } from '../integrations/keagateClient';
import { getInvoiceById } from '../models/invoiceService';
import { createError } from '../middlewares/errorHandler';
import { CreateSubscriptionRequest } from '../types/api';
import type { KeagateCurrency } from '../services/rateService';

const router = Router();

/**
 * POST /api/billing/create-subscription
 * Create a subscription + invoice and forward to Keagate
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

    // Validate currency (if provided) or default to BTC
    const allowedCurrencies: KeagateCurrency[] = ['BTC', 'ETH', 'SOL', 'MATIC', 'DOGE', 'LTC'];
    const requestedCurrency = (currency ?? 'BTC').toUpperCase() as KeagateCurrency;
    
    if (!allowedCurrencies.includes(requestedCurrency)) {
      throw createError('Currency not supported by Keagate. Allowed values: BTC, ETH, SOL, MATIC, DOGE, LTC', 400);
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

    // Create invoice on Keagate
    let keagateInvoiceId: string = '';
    let keagateInvoiceUrl: string = '';

    try {
      const keagateResponse = await createKeagateInvoice({
        priceUsd: plan.priceUsd,
        currency: requestedCurrency,
        metadata: {
          invoiceId: invoice.id,
          planCode: plan.code,
          productCode,
          userEmail,
        },
      });

      keagateInvoiceId = keagateResponse.keagateInvoiceId;
      keagateInvoiceUrl = keagateResponse.keagateInvoiceUrl || '';

      // Update invoice with Keagate info
      await updateInvoice(invoice.id, {
        keagateInvoiceId,
        keagateInvoiceUrl,
      });
    } catch (keagateError) {
      console.error('[Billing] Failed to create Keagate invoice:', keagateError);
      // Still return the invoice, but without Keagate info
      // The invoice can be updated later when Keagate is available
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
      keagate: {
        invoiceId: keagateInvoiceId || '',
        invoiceUrl: keagateInvoiceUrl || '',
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
      keagate: {
        invoiceId: invoice.keagateInvoiceId || '',
        invoiceUrl: invoice.keagateInvoiceUrl || '',
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;

