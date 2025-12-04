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

export interface CreateSubscriptionRequest {
  planCode: string;
  userEmail: string;
  productCode: string;
  currency?: 'BTC' | 'ETH' | 'SOL' | 'MATIC' | 'DOGE' | 'LTC'; // defaults to 'BTC' if not provided
  successRedirectUrl?: string;
  cancelRedirectUrl?: string;
}

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
  keagate: {
    invoiceId: string;
    invoiceUrl: string;
  };
}

export interface InvoiceResponse {
  invoiceId: string;
  status: string;
  amountUsd: number;
  planCode: string;
  subscriptionId: string;
  keagate: {
    invoiceId: string;
    invoiceUrl: string;
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

