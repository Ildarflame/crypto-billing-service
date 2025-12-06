# Crypto Billing Service

A standalone crypto billing service for Shadow Intern that manages pricing plans, subscriptions, invoices, and payments via the NOWPayments crypto payment gateway.

## Overview

This service acts as a billing middleware between:
- **Frontend/Landing Pages**: Create subscriptions and retrieve invoice information
- **NOWPayments**: External crypto payment gateway that processes crypto payments
- **Shadow Intern Server**: Admin API that manages license keys and rate limits

The Chrome extension only talks to the Shadow Intern server and never calls this service directly.

## Tech Stack

- **Node.js** + **TypeScript**
- **Express** - Web framework
- **Prisma ORM** - Database ORM
- **SQLite** - Initial database (easy migration path to Postgres)
- **dotenv** - Configuration management
- **ESLint** + **Prettier** - Code formatting and linting

## Project Structure

```
crypto-billing-service/
├── src/
│   ├── app.ts                    # Express app setup
│   ├── server.ts                 # Server entry point
│   ├── config/
│   │   └── env.ts                # Environment configuration
│   ├── db/
│   │   └── prisma.ts             # Prisma client singleton
│   ├── models/                   # Business logic services
│   │   ├── planService.ts
│   │   ├── subscriptionService.ts
│   │   ├── invoiceService.ts
│   │   ├── paymentService.ts
│   │   └── paymentMethodService.ts
│   ├── routes/                   # API routes
│   │   ├── billingRoutes.ts      # /api/billing/*
│   │   ├── webhookRoutes.ts      # /api/webhooks/*
│   │   └── adminRoutes.ts        # /api/admin/*
│   ├── integrations/             # External service clients
│   │   ├── nowpaymentsClient.ts  # NOWPayments payment gateway
│   │   └── shadowInternClient.ts # Shadow Intern admin API
│   ├── middlewares/
│   │   ├── errorHandler.ts       # Global error handler
│   │   └── authAdmin.ts          # Admin authentication
│   └── types/
│       └── api.ts                 # Shared TypeScript types
├── prisma/
│   ├── schema.prisma             # Database schema
│   └── seed.ts                   # Seed script for initial data
├── .env.example                  # Environment variables template
├── package.json
├── tsconfig.json
└── README.md
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

Required environment variables:
- `PORT` - Server port (default: 4000)
- `DATABASE_URL` - SQLite database path (default: `file:./dev.db`)
- `NOWPAYMENTS_BASE_URL` - NOWPayments API base URL (default: `https://api.nowpayments.io/v1`)
- `NOWPAYMENTS_API_KEY` - NOWPayments API key
- `NOWPAYMENTS_IPN_SECRET` - NOWPayments IPN secret (for HMAC-SHA512 signature verification)
- `BILLING_PUBLIC_BASE_URL` - Public base URL for webhook callbacks (e.g., `https://billing.shadowintern.xyz`)
- `SHADOW_INTERN_BASE_URL` - Shadow Intern server API URL
- `SHADOW_INTERN_ADMIN_TOKEN` - Shadow Intern admin API token
- `ADMIN_API_TOKEN` - Token for admin endpoints

### 3. Set Up Database

Generate Prisma client:
```bash
npm run prisma:generate
```

Run migrations:
```bash
npm run prisma:migrate
```

Seed initial data (plans and payment methods):
```bash
npm run prisma:seed
```

### 4. Run the Service

Development mode (with hot reload):
```bash
npm run dev
```

Production mode:
```bash
npm run build
npm start
```

The service will start on `http://localhost:4000` (or the port specified in `.env`).

## API Endpoints

### Billing API

#### `POST /api/billing/create-subscription`

Create a new subscription and invoice.

**Request:**
```json
{
  "planCode": "pro_monthly",
  "userEmail": "user@example.com",
  "productCode": "shadow-intern",
  "successRedirectUrl": "https://shadowintern.xyz/success",
  "cancelRedirectUrl": "https://shadowintern.xyz/cancel"
}
```

**Response:**
```json
{
  "subscriptionId": "sub_...",
  "invoiceId": "inv_...",
  "plan": {
    "code": "pro_monthly",
    "name": "Pro Monthly",
    "priceUsd": 39.99,
    "durationDays": 30
  },
  "payment": {
    "provider": "nowpayments",
    "paymentId": "12345678",
    "paymentUrl": "https://nowpayments.io/payment/?iid=12345678"
  }
}
```

#### `GET /api/billing/invoice/:id`

Get invoice details.

**Response:**
```json
{
  "invoiceId": "inv_...",
  "status": "pending",
  "amountUsd": 39.99,
  "planCode": "pro_monthly",
  "subscriptionId": "sub_...",
  "payment": {
    "provider": "nowpayments",
    "paymentId": "12345678",
    "paymentUrl": "https://nowpayments.io/payment/?iid=12345678"
  }
}
```

### Webhooks

#### `POST /api/webhooks/nowpayments`

NOWPayments IPN (Instant Payment Notification) webhook endpoint for payment confirmations.

**Headers:**
- `x-nowpayments-sig` - HMAC-SHA512 signature for verification

**Payload:**
```json
{
  "payment_id": "12345678",
  "payment_status": "finished",
  "order_id": "inv_...",
  "price_amount": 39.99,
  "price_currency": "usd",
  "pay_amount": 0.001234,
  "pay_currency": "BTC"
}
```

**Payment Statuses:**
- `waiting` - Payment is waiting for user action
- `confirming` - Payment is being confirmed on blockchain
- `confirmed` - Payment confirmed (treated as success)
- `finished` - Payment completed successfully (final success status)
- `failed` - Payment failed
- `expired` - Payment expired
- `refunded` - Payment was refunded

When a payment is confirmed (`finished` or `confirmed`):
1. Invoice is marked as paid
2. Subscription is activated or extended
3. License key is created/updated on Shadow Intern server via `POST /admin/license/upsert`

### Admin API

#### `GET /api/admin/subscriptions`

Get paginated list of subscriptions (requires `X-Admin-Token` header).

**Headers:**
```
X-Admin-Token: your-admin-token
```

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 50, max: 100)

## Database Models

### Plan
Pricing plans with duration and rate limits.

### Subscription
User subscriptions to plans. Status can be:
- `pending_payment` - Waiting for payment
- `active` - Active subscription
- `expired` - Subscription expired
- `canceled` - Canceled by user
- `payment_received_but_license_failed` - Payment received but license creation failed

### Invoice
Payment invoices linked to subscriptions.

### Payment
On-chain payment records with transaction details.

### PaymentMethod
Supported crypto tokens and networks (reference data).

## Supported Payment Methods

- **USDT**: TRC20, ERC20, BEP20, Polygon, Avalanche
- **USDC**: ERC20, TRC20, BEP20, Polygon, Avalanche
- **L1 Coins**: SOL (Solana), BTC (Bitcoin), ETH (Ethereum), BNB (BSC), MATIC (Polygon), AVAX (Avalanche)

## Integration Notes

### NOWPayments Client

The NOWPayments client (`src/integrations/nowpaymentsClient.ts`) handles:
- Payment creation via `POST /v1/payment` API
- IPN webhook signature verification using HMAC-SHA512
- Automatic USD to crypto conversion (handled by NOWPayments)

### Shadow Intern Client

The Shadow Intern admin client (`src/integrations/shadowInternClient.ts`) includes TODO comments for adjusting the endpoint URL and request/response format. The current implementation assumes `POST /admin/license/upsert`.

## Subscription Logic

- **First Payment**: `startsAt = now`, `expiresAt = now + durationDays` (or `null` for lifetime)
- **Renewal (Active)**: If `expiresAt > now`, extend from current expiration. Otherwise, start from now.
- **Lifetime Plans**: `durationDays = null`, `expiresAt = null`

## Development

### Linting
```bash
npm run lint
```

### Formatting
```bash
npm run format
```

### Database Migrations

Create a new migration:
```bash
npm run prisma:migrate
```

View database in Prisma Studio:
```bash
npx prisma studio
```

## Production Considerations

1. **Webhook Security**: HMAC-SHA512 signature verification is implemented for NOWPayments IPN webhooks
2. **Error Handling**: License creation failures are logged and subscriptions are marked with `payment_received_but_license_failed` status
3. **Database**: Consider migrating to Postgres for production (update `DATABASE_URL` in `.env`)
4. **Background Jobs**: Future enhancement: cron job to mark expired subscriptions
5. **Logging**: Consider adding structured logging (e.g., Winston, Pino)
6. **IPN Configuration**: Ensure `NOWPAYMENTS_IPN_SECRET` matches the secret configured in your NOWPayments dashboard
7. **Webhook URL**: Configure the IPN callback URL in NOWPayments dashboard: `https://billing.shadowintern.xyz/api/webhooks/nowpayments`

## License

ISC

