# Crypto Billing Service

A standalone crypto billing service for Shadow Intern that manages pricing plans, subscriptions, invoices, and payments via the Keagate crypto payment gateway.

## Overview

This service acts as a billing middleware between:
- **Frontend/Landing Pages**: Create subscriptions and retrieve invoice information
- **Keagate**: External crypto payment gateway that processes crypto payments
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
│   │   ├── keagateClient.ts      # Keagate payment gateway
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
- `KEAGATE_BASE_URL` - Keagate instance URL
- `KEAGATE_API_KEY` - Keagate API key
- `KEAGATE_WEBHOOK_SECRET` - Keagate webhook secret (for HMAC verification)
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
  "keagate": {
    "invoiceId": "kg_123",
    "invoiceUrl": "https://keagate.yourdomain.com/invoice/kg_123"
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
  "keagate": {
    "invoiceId": "kg_123",
    "invoiceUrl": "https://..."
  }
}
```

### Webhooks

#### `POST /api/webhooks/keagate`

Keagate webhook endpoint for payment confirmations.

**Payload:**
```json
{
  "event": "payment_confirmed",
  "invoiceId": "kg_123",
  "txHash": "0x...",
  "currency": "USDT",
  "network": "ERC20",
  "amount": 39.99
}
```

When a payment is confirmed:
1. Payment record is created
2. Invoice is marked as paid
3. Subscription is activated or extended
4. License key is created/updated on Shadow Intern server

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

### Keagate Client

The Keagate client (`src/integrations/keagateClient.ts`) includes TODO comments for adjusting the API endpoints and request/response formats based on actual Keagate documentation. The current implementation assumes a REST API structure.

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

1. **Webhook Security**: Implement proper HMAC verification for Keagate webhooks (see TODO in `keagateClient.ts`)
2. **Error Handling**: License creation failures are logged and subscriptions are marked with `payment_received_but_license_failed` status
3. **Database**: Consider migrating to Postgres for production (update `DATABASE_URL` in `.env`)
4. **Background Jobs**: Future enhancement: cron job to mark expired subscriptions
5. **Logging**: Consider adding structured logging (e.g., Winston, Pino)

## License

ISC

