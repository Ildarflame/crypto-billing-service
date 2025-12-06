// src/integrations/nowpaymentsClient.ts
import crypto from 'crypto';
import { config } from '../config/env';

export interface CreatePaymentArgs {
  amountUsd: number;
  orderId: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  payCurrency?: string; // optional
}

type NowpaymentsCreatePaymentResponse = {
  payment_id: string;
  payment_status: string;
  invoice_url: string;
  pay_address?: string;
  price_amount?: number;
  price_currency?: string;
  pay_amount?: number;
  pay_currency?: string;
  order_id?: string;
  [key: string]: any; // Allow other fields from NOWPayments response
};

export interface CreatePaymentResult {
  paymentId: string;
  paymentUrl: string;
  raw: any;
}

/**
 * Creates a payment on NOWPayments
 */
export async function createPayment(args: CreatePaymentArgs): Promise<CreatePaymentResult> {
  const { amountUsd, orderId, successUrl, cancelUrl, customerEmail, payCurrency } = args;

  // Validate configuration
  if (!config.nowpayments.apiKey) {
    throw new Error('NOWPayments configuration is missing: NOWPAYMENTS_API_KEY must be set');
  }

  // Build the base URL (remove trailing slash)
  const baseUrl = config.nowpayments.baseUrl.replace(/\/$/, '');
  const apiUrl = `${baseUrl}/payment`;

  // Build IPN callback URL
  const billingBaseUrl = config.billing.publicBaseUrl.replace(/\/$/, '');
  const ipnCallbackUrl = `${billingBaseUrl}/api/webhooks/nowpayments`;

  // Build request body according to NOWPayments API
  const requestBody: Record<string, any> = {
    price_amount: amountUsd,
    price_currency: 'usd',
    order_id: orderId,
    ipn_callback_url: ipnCallbackUrl,
    success_url: successUrl,
    cancel_url: cancelUrl,
  };

  // Add optional fields
  if (payCurrency) {
    requestBody.pay_currency = payCurrency;
  }

  if (customerEmail) {
    requestBody.customer_email = customerEmail;
  }

  console.log('[NOWPayments] Creating payment:', {
    amountUsd,
    orderId,
    payCurrency: payCurrency || '(customer chooses)',
    ipnCallbackUrl,
    successUrl,
    cancelUrl,
  });

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.nowpayments.apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(
        `NOWPayments API error: ${response.status} ${response.statusText} - ${errorText}`
      );
      console.error('[NOWPayments] Failed to create payment:', error);
      throw error;
    }

    const data = await response.json() as NowpaymentsCreatePaymentResponse;

    // Extract payment ID and invoice URL
    const paymentId = data.payment_id;
    const paymentUrl = data.invoice_url;

    if (!paymentId || !paymentUrl) {
      throw new Error(
        `NOWPayments response missing required fields: payment_id=${paymentId}, invoice_url=${paymentUrl}`
      );
    }

    console.log('[NOWPayments] Payment created successfully:', {
      paymentId,
      paymentUrl,
      paymentStatus: data.payment_status,
    });

    return {
      paymentId,
      paymentUrl,
      raw: data,
    };
  } catch (error) {
    console.error('[NOWPayments] Error creating payment:', error);
    throw error;
  }
}

/**
 * Verifies the HMAC-SHA512 signature of a NOWPayments webhook request
 * 
 * NOWPayments signs the webhook by:
 * 1. Sorting the JSON object keys alphabetically
 * 2. Stringifying the sorted JSON
 * 3. Computing HMAC-SHA512 of the stringified JSON using the IPN secret
 * 
 * @param rawBody - The raw request body as string or Buffer
 * @param headers - The request headers object
 * @returns true if signature is valid, false otherwise
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  headers: Record<string, string | string[] | undefined>
): boolean {
  const ipnSecret = config.nowpayments.ipnSecret;

  if (!ipnSecret) {
    console.warn('[NOWPayments] NOWPAYMENTS_IPN_SECRET is not set, rejecting webhook');
    return false;
  }

  // Extract signature header (case-insensitive lookup)
  const signatureHeader = headers['x-nowpayments-sig'] || headers['X-Nowpayments-Sig'];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

  if (!signature) {
    console.warn('[NOWPayments] Missing x-nowpayments-sig header');
    return false;
  }

  try {
    // Parse the JSON body
    const bodyString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const bodyObject = JSON.parse(bodyString);

    // Sort keys alphabetically and stringify
    const sortedKeys = Object.keys(bodyObject).sort();
    const sortedBody: Record<string, any> = {};
    for (const key of sortedKeys) {
      sortedBody[key] = bodyObject[key];
    }
    const sortedBodyString = JSON.stringify(sortedBody);

    // Compute HMAC-SHA512 over the sorted JSON string
    const hmac = crypto.createHmac('sha512', ipnSecret);
    hmac.update(sortedBodyString);
    const computedSignature = hmac.digest('hex');

    // Compare signatures in a timing-safe way
    const providedSignature = signature.trim().toLowerCase();
    const computedSignatureLower = computedSignature.toLowerCase();

    // Ensure both signatures are the same length for timing-safe comparison
    if (computedSignatureLower.length !== providedSignature.length) {
      console.warn('[NOWPayments] Signature length mismatch');
      return false;
    }

    // Convert hex strings to buffers for timing-safe comparison
    const computedBuffer = Buffer.from(computedSignatureLower, 'hex');
    const providedBuffer = Buffer.from(providedSignature, 'hex');

    // If buffers have different lengths, comparison will fail
    if (computedBuffer.length !== providedBuffer.length) {
      console.warn('[NOWPayments] Signature buffer length mismatch');
      return false;
    }

    const isValid = crypto.timingSafeEqual(computedBuffer, providedBuffer);

    if (!isValid) {
      console.warn('[NOWPayments] Invalid webhook signature');
    }

    return isValid;
  } catch (error) {
    console.error('[NOWPayments] Error verifying webhook signature:', error);
    return false;
  }
}

