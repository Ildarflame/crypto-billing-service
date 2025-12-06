/**
 * @deprecated Keagate integration has been removed. This type is kept for backward compatibility only.
 */
export interface KeagateWebhookPayload {
  event?: string; // e.g. 'payment_confirmed', 'CONFIRMED', 'PAID'
  status?: string; // Payment status: 'CONFIRMED', 'PAID', 'PENDING', etc.
  id?: string; // Keagate's payment/invoice ID
  invoiceId?: string; // Keagate's invoice ID (alternative field name)
  paymentId?: string; // Keagate's payment ID (alternative field name)
  txHash?: string;
  currency: string; // 'BTC', 'ETH', 'USDT', etc.
  network?: string; // 'ERC20', 'TRC20', 'BEP20', etc.
  amount: number;
  extraId?: string; // Our internal invoice/subscription ID for correlation
}

export interface NowpaymentsWebhookPayload {
  payment_id: string;
  payment_status: string; // 'waiting', 'confirming', 'confirmed', 'sending', 'partially_paid', 'finished', 'failed', 'refunded', 'expired'
  order_id?: string; // Our internal invoice ID (we set this when creating payment)
  price_amount: number;
  price_currency: string; // 'usd'
  pay_amount?: number;
  pay_currency?: string;
  actually_paid?: number;
  outcome_amount?: number;
  outcome_currency?: string;
  pay_address?: string;
  payin_extra_id?: string;
  smart_contract?: string;
  network?: string;
  network_precision?: number;
  time_limit?: string;
  burning_percent?: number;
  expiration_estimate_date?: string;
  order_description?: string;
  purchase_id?: string;
  [key: string]: any; // Allow other fields from NOWPayments
}

export interface CreateSubscriptionRequest {
  planCode: string;
  userEmail: string;
  productCode: string;
  currency?: 'BTC' | 'ETH' | 'SOL' | 'MATIC' | 'DOGE' | 'LTC'; // defaults to 'BTC' if not provided
  successRedirectUrl?: string;
  cancelRedirectUrl?: string;
}

/**
 * @deprecated Keagate integration has been removed. This type is kept for backward compatibility only.
 */
export interface KeagateInvoiceResponse {
  keagateInvoiceId: string;
  keagateInvoiceUrl: string;
}

export interface CreateInvoiceResponse {
  subscriptionId: string;
  invoiceId: string;
  plan: {
    code: string;
    name: string;
    priceUsd: number;
    durationDays: number | null;
  };
  payment: {
    provider: string | null;
    paymentId: string | null;
    paymentUrl: string | null;
  };
}

export interface InvoiceResponse {
  invoiceId: string;
  status: string;
  amountUsd: number;
  planCode: string;
  subscriptionId: string;
  payment: {
    provider: string | null;
    paymentId: string | null;
    paymentUrl: string | null;
  };
}

export interface CreateOrExtendLicenseParams {
  userEmail: string;
  planCode: string;
  startsAt: Date;
  expiresAt: Date | null;
  maxRequestsPerDay: number | null;
}

export interface CreateOrExtendLicenseResponse {
  licenseKey: string;
  plan: string;
  expiresAt: string | null;
  limitPerDay: number | null;
}

