import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  keagate: {
    baseUrl: process.env.KEAGATE_BASE_URL || '',
    apiKey: process.env.KEAGATE_API_KEY || '',
    ipnHmacSecret: process.env.KEAGATE_IPN_HMAC_SECRET || '',
    invoiceCallbackUrl: process.env.KEAGATE_INVOICE_CALLBACK_URL || 'https://shadowintern.xyz/billing/invoice-callback',
  },
  billing: {
    publicBaseUrl: process.env.BILLING_PUBLIC_BASE_URL || process.env.KEAGATE_BASE_URL || '',
  },
  shadowIntern: {
    baseUrl: process.env.SHADOW_INTERN_BASE_URL || '',
    adminToken: process.env.SHADOW_INTERN_ADMIN_TOKEN || '',
  },
  adminApiToken: process.env.ADMIN_API_TOKEN || '',
  binance: {
    baseUrl: process.env.BINANCE_BASE_URL || 'https://api.binance.com',
  },
};

