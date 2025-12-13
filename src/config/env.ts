import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  nowpayments: {
    baseUrl: process.env.NOWPAYMENTS_BASE_URL || 'https://api.nowpayments.io/v1',
    apiKey: process.env.NOWPAYMENTS_API_KEY || '',
    ipnSecret: process.env.NOWPAYMENTS_IPN_SECRET || '',
  },
  billing: {
    publicBaseUrl: process.env.BILLING_PUBLIC_BASE_URL || '',
  },
  shadowIntern: {
    baseUrl: process.env.SHADOW_INTERN_BASE_URL || '',
    adminToken: process.env.SHADOW_INTERN_ADMIN_TOKEN || '',
  },
  adminApiToken: process.env.BILLING_ADMIN_TOKEN || process.env.ADMIN_API_TOKEN || '',
  binance: {
    baseUrl: process.env.BINANCE_BASE_URL || 'https://api.binance.com',
  },
  coinbase: {
    baseUrl: process.env.COINBASE_BASE_URL || 'https://api.exchange.coinbase.com',
  },
  email: {
    provider: process.env.EMAIL_PROVIDER || 'resend', // 'resend' or 'smtp'
    from: process.env.EMAIL_FROM || 'Shadow Intern <noreply@shadowintern.xyz>',
    resend: {
      apiKey: process.env.RESEND_API_KEY || '',
    },
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  },
  receipt: {
    tokenSecret: process.env.RECEIPT_TOKEN_SECRET || '',
    tokenTtlSeconds: parseInt(process.env.RECEIPT_TOKEN_TTL_SECONDS || '604800', 10), // 7 days default
  },
};

export const COINBASE_BASE_URL =
  process.env.COINBASE_BASE_URL ?? 'https://api.exchange.coinbase.com';

