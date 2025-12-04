// src/integrations/keagateClient.ts
import crypto from 'crypto';
import { config } from '../config/env';
import { convertUsdToCrypto, type KeagateCurrency } from '../services/rateService';

type CreateInvoiceParams = {
  priceUsd: number;
  currency: KeagateCurrency;
  metadata: {
    invoiceId: string;  // our internal invoice ID
    planCode: string;
    productCode: string;
    userEmail: string;
  };
};

type KeagateCreatePaymentResponse = {
  id: string; // payment/invoice ID from Keagate
  invoiceUrl: string; // path to invoice (e.g., "/invoice/abc123")
  amount?: number;
  currency?: string;
  status?: string;
};

/**
 * Creates an invoice on Keagate using the Invoice Client Method
 */
export async function createInvoice(params: CreateInvoiceParams) {
  const { priceUsd, currency, metadata } = params;

  // Validate configuration
  if (!config.keagate.baseUrl || !config.keagate.apiKey) {
    throw new Error('Keagate configuration is missing: KEAGATE_BASE_URL and KEAGATE_API_KEY must be set');
  }

  // Convert USD to crypto amount
  const amountCrypto = await convertUsdToCrypto(priceUsd, currency);

  // Build the base URL (remove trailing slash)
  const baseUrl = config.keagate.baseUrl.replace(/\/$/, '');
  const apiUrl = `${baseUrl}/createPayment`;

  // Build IPN callback URL
  const billingBaseUrl = config.billing.publicBaseUrl.replace(/\/$/, '');
  const ipnCallbackUrl = `${billingBaseUrl}/api/webhooks/keagate`;

  // Build invoice callback URL (thank you page)
  const invoiceCallbackUrl = config.keagate.invoiceCallbackUrl;

  // Build request body according to Keagate API
  const requestBody = {
    amount: amountCrypto,
    currency: currency.toUpperCase(), // Ensure uppercase
    invoiceCallbackUrl: invoiceCallbackUrl,
    ipnCallbackUrl: ipnCallbackUrl,
    extraId: metadata.invoiceId, // Use our internal invoice ID for correlation
  };

  console.log('[Keagate] Creating invoice:', {
    priceUsd,
    amountCrypto,
    currency: currency.toUpperCase(),
    invoiceId: metadata.invoiceId,
    extraId: metadata.invoiceId,
    ipnCallbackUrl,
    invoiceCallbackUrl,
  });

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'keagate-api-key': config.keagate.apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(
        `Keagate API error: ${response.status} ${response.statusText} - ${errorText}`
      );
      console.error('[Keagate] Failed to create invoice:', error);
      throw error;
    }

    const data = await response.json() as KeagateCreatePaymentResponse;

    // Extract payment ID and invoice URL
    const keagateInvoiceId = data.id;
    const invoiceUrlPath = data.invoiceUrl || `/invoice/${keagateInvoiceId}`;

    // Build full invoice URL
    const fullInvoiceUrl = `${baseUrl}${invoiceUrlPath.startsWith('/') ? invoiceUrlPath : `/${invoiceUrlPath}`}`;

    console.log('[Keagate] Invoice created successfully:', {
      keagateInvoiceId,
      invoiceUrl: fullInvoiceUrl,
    });

    return {
      keagateInvoiceId,
      keagateInvoiceUrl: fullInvoiceUrl,
    };
  } catch (error) {
    console.error('[Keagate] Error creating invoice:', error);
    throw error;
  }
}

/**
 * Verifies the HMAC signature of a Keagate webhook request
 * @param rawBody - The raw request body as string or Buffer
 * @param signatureHeader - The value of the 'x-keagate-sig' header
 * @returns true if signature is valid, false otherwise
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined
): boolean {
  const ipnSecret = config.keagate.ipnHmacSecret;

  if (!ipnSecret) {
    console.warn('[Keagate] KEAGATE_IPN_HMAC_SECRET is not set, rejecting webhook');
    return false;
  }

  if (!signatureHeader) {
    console.warn('[Keagate] Missing x-keagate-sig header');
    return false;
  }

  try {
    // Compute HMAC-SHA256 over the raw body
    const hmac = crypto.createHmac('sha256', ipnSecret);
    hmac.update(rawBody);
    const computedSignature = hmac.digest('hex');

    // Compare signatures in a timing-safe way
    const providedSignature = signatureHeader.trim().toLowerCase();
    const computedSignatureLower = computedSignature.toLowerCase();

    // Ensure both signatures are the same length for timing-safe comparison
    if (computedSignatureLower.length !== providedSignature.length) {
      console.warn('[Keagate] Signature length mismatch');
      return false;
    }

    // Convert hex strings to buffers for timing-safe comparison
    const computedBuffer = Buffer.from(computedSignatureLower, 'hex');
    const providedBuffer = Buffer.from(providedSignature, 'hex');

    // If buffers have different lengths, comparison will fail
    if (computedBuffer.length !== providedBuffer.length) {
      console.warn('[Keagate] Signature buffer length mismatch');
      return false;
    }

    const isValid = crypto.timingSafeEqual(computedBuffer, providedBuffer);

    if (!isValid) {
      console.warn('[Keagate] Invalid webhook signature');
    }

    return isValid;
  } catch (error) {
    console.error('[Keagate] Error verifying webhook signature:', error);
    return false;
  }
}
