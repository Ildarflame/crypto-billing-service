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
};

export const COINBASE_BASE_URL =
  process.env.COINBASE_BASE_URL ?? 'https://api.exchange.coinbase.com';

