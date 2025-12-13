# Crypto Billing Service

A standalone crypto billing service for Shadow Intern that manages subscriptions, invoices, NOWPayments webhooks, license synchronization, invite codes, and admin operations.

## Description

This service handles the complete billing lifecycle for Shadow Intern:

- **Subscription Management**: Create and manage user subscriptions to pricing plans
- **Invoice Processing**: Generate invoices and track payment status
- **NOWPayments Integration**: Process crypto payments via NOWPayments gateway
- **Webhook Handling**: Receive and process NOWPayments payment notifications (IPN)
- **License Synchronization**: Automatically sync license keys with Shadow Intern server when payments are confirmed
- **Invite Code System**: Validate and track invite/referral codes for subscriptions
- **Admin API**: Manage subscriptions, invoices, invite codes, and view statistics

## Tech Stack

- **Node.js** + **TypeScript**
- **Express** - Web framework
- **Prisma ORM** - Database ORM
- **SQLite** - Database (easy migration path to Postgres)
- **pm2** - Process manager for production (recommended)
- **dotenv** - Environment configuration
- **NOWPayments API** - Crypto payment gateway integration
- **Shadow Intern Admin API** - License key management integration

## Setup & Local Development

### Requirements

- **Node.js**: v18+ (or as specified in your project)
- **npm** or **pnpm**: Package manager
- **SQLite**: Usually pre-installed on macOS/Linux

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   # or
   pnpm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Generate Prisma client:**
   ```bash
   npm run prisma:generate
   ```

4. **Run database migrations:**
   ```bash
   # For development (creates migration files)
   npx prisma migrate dev
   
   # For production (applies existing migrations)
   npx prisma migrate deploy
   ```

5. **Seed initial data (optional):**
   ```bash
   npm run prisma:seed
   ```

### Running the Service

**Development mode** (with hot reload):
```bash
npm run dev
```

**Production mode:**
```bash
# Build TypeScript
npm run build

# Start server
npm start
```

The service will start on `http://localhost:4000` (or the port specified in `PORT` env var).

## Environment Variables

All environment variables are defined in `src/config/env.ts`. Create a `.env` file in the project root.

### Database

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | No | SQLite database file path | `file:./prisma/dev.db` |

### Server

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `PORT` | No | Server port | `4000` |

### NOWPayments Integration

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NOWPAYMENTS_BASE_URL` | No | NOWPayments API base URL | `https://api.nowpayments.io/v1` |
| `NOWPAYMENTS_API_KEY` | **Yes** | NOWPayments API key for creating invoices | `your-api-key-here` |
| `NOWPAYMENTS_IPN_SECRET` | **Yes** | Secret for HMAC-SHA512 webhook signature verification | `your-ipn-secret-here` |

### Billing Service

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `BILLING_PUBLIC_BASE_URL` | **Yes** | Public base URL for webhook callbacks (must be accessible by NOWPayments) | `https://billing.shadowintern.xyz` |

### Shadow Intern Integration

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `SHADOW_INTERN_BASE_URL` | **Yes** | Shadow Intern server API base URL | `https://api.shadowintern.xyz` |
| `SHADOW_INTERN_ADMIN_TOKEN` | **Yes** | Admin token for Shadow Intern API authentication | `your-admin-token-here` |

### Admin API

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `BILLING_ADMIN_TOKEN` | **Yes** | Token for admin endpoint authentication (alternative: `ADMIN_API_TOKEN`) | `your-admin-token-here` |
| `ADMIN_API_TOKEN` | **Yes** | Alternative name for admin token (used if `BILLING_ADMIN_TOKEN` is not set) | `your-admin-token-here` |

### Email Configuration

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `EMAIL_PROVIDER` | No | Email provider: `resend` or `smtp` | `resend` |
| `EMAIL_FROM` | No | Sender email address | `Shadow Intern <noreply@shadowintern.xyz>` |
| `RESEND_API_KEY` | **Yes** (if using Resend) | Resend API key | `re_xxxxxxxxxxxx` |
| `SMTP_HOST` | **Yes** (if using SMTP) | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | No | SMTP server port | `587` |
| `SMTP_USER` | **Yes** (if using SMTP) | SMTP username | `noreply@shadowintern.xyz` |
| `SMTP_PASS` | **Yes** (if using SMTP) | SMTP password | `your-smtp-password` |

### Receipt Configuration

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `RECEIPT_TOKEN_SECRET` | **Yes** | Secret key for signing receipt download tokens | `your-secret-key-here` |
| `RECEIPT_TOKEN_TTL_SECONDS` | No | Receipt token expiration time in seconds (default: 604800 = 7 days) | `604800` |

### Exchange APIs (Optional)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `BINANCE_BASE_URL` | No | Binance API base URL | `https://api.binance.com` |
| `COINBASE_BASE_URL` | No | Coinbase API base URL | `https://api.exchange.coinbase.com` |

## API Overview

### Health Check

#### `GET /health`

Returns service health status.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### Public Endpoints

#### `POST /api/billing/create-subscription`

Create a new subscription and invoice, then forward to NOWPayments.

**Request Body:**
```json
{
  "planCode": "pro_monthly",
  "userEmail": "user@example.com",
  "productCode": "shadow-intern",
  "inviteCode": "WELCOME2024",
  "successRedirectUrl": "https://shadowintern.xyz/success",
  "cancelRedirectUrl": "https://shadowintern.xyz/cancel"
}
```

**Response (201):**
```json
{
  "subscriptionId": "clx1234567890",
  "invoiceId": "clx0987654321",
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

**Notes:**
- `inviteCode` is **required**
- `successRedirectUrl` and `cancelRedirectUrl` are optional (defaults provided)
- Subscription starts with status `pending_payment`

---

#### `GET /api/billing/subscription-status`

Get subscription status and license key by subscription ID and email.

**Query Parameters:**
- `subscriptionId` (required) - Subscription ID
- `email` (required) - User email (must match subscription email)

**Example:**
```
GET /api/billing/subscription-status?subscriptionId=clx1234567890&email=user@example.com
```

**Response (200):**
```json
{
  "id": "clx1234567890",
  "status": "active",
  "planCode": "pro_monthly",
  "licenseKey": "sk-abc123...",
  "expiresAt": "2024-02-15T10:30:00.000Z",
  "userEmail": "user@example.com"
}
```

**Error Responses:**
- `400` - Missing subscriptionId or email
- `403` - Email does not match subscription
- `404` - Subscription not found

---

#### `GET /api/billing/invoice/:id`

Get invoice details by invoice ID.

**Example:**
```
GET /api/billing/invoice/clx0987654321
```

**Response (200):**
```json
{
  "invoiceId": "clx0987654321",
  "status": "paid",
  "amountUsd": 39.99,
  "planCode": "pro_monthly",
  "subscriptionId": "clx1234567890",
  "payment": {
    "provider": "nowpayments",
    "paymentId": "12345678",
    "paymentUrl": "https://nowpayments.io/payment/?iid=12345678"
  }
}
```

---

#### `GET /api/billing/receipt/:invoiceId?token=...`

Download receipt PDF (requires signed token for security).

**Query Parameters:**
- `token` (required) - Signed receipt token (provided in receipt email)

**Example:**
```
GET /api/billing/receipt/clx0987654321?token=eyJpbnZvaWNlSWQiOiJjbH...
```

**Response (200):**
- Content-Type: `application/pdf`
- Content-Disposition: `attachment; filename="receipt-SI-2025-000123.pdf"`
- Body: PDF file buffer

**Error Responses:**
- `401` - Missing or invalid token
- `404` - Invoice not found
- `400` - Invoice is not paid

**Note:** Tokens are signed with `RECEIPT_TOKEN_SECRET` and expire after `RECEIPT_TOKEN_TTL_SECONDS` (default: 7 days).

---

#### `POST /api/invite/validate`

Validate an invite code.

**Request Body:**
```json
{
  "code": "WELCOME2024"
}
```

**Response (200) - Valid:**
```json
{
  "ok": true,
  "code": "welcome2024",
  "type": "INVITE",
  "status": "ACTIVE",
  "maxUses": 100,
  "usedCount": 5,
  "expiresAt": "2024-12-31T23:59:59.000Z"
}
```

**Response (400) - Invalid:**
```json
{
  "ok": false,
  "error": "Invite code is invalid or expired",
  "reason": "NOT_FOUND"
}
```

**Error Reasons:**
- `NOT_FOUND` - Code doesn't exist
- `NOT_ACTIVE` - Code is not active (status is PAUSED or EXPIRED)
- `EXPIRED` - Code has passed its expiration date
- `LIMIT_REACHED` - Code has reached its max uses

---

### Webhook Endpoints

#### `POST /api/webhooks/nowpayments`

NOWPayments IPN (Instant Payment Notification) webhook endpoint.

**Headers:**
- `x-nowpayments-sig` (required) - HMAC-SHA512 signature for verification
- `Content-Type: application/json`

**Request Body:**
```json
{
  "payment_id": 12345678,
  "payment_status": "finished",
  "order_id": "clx1234567890",
  "price_amount": 39.99,
  "price_currency": "usd",
  "pay_amount": 0.001234,
  "pay_currency": "BTC"
}
```

**How It Works:**

1. **Signature Verification**: Verifies HMAC-SHA512 signature using `NOWPAYMENTS_IPN_SECRET`
2. **Invoice Lookup**: Finds invoice by `order_id` (which is the subscription ID)
3. **Status Processing**:
   - **Success** (`finished` or `confirmed`):
     - Marks invoice as `paid`
     - Activates or extends subscription
     - Computes new expiration date based on plan duration
     - Calls Shadow Intern `/admin/license/upsert` to create/extend license
     - Updates subscription with license key
     - Increments invite code `usedCount` if subscription just became active
   - **Failure** (`failed`, `expired`, `refunded`):
     - Marks invoice as `expired` or `canceled`
     - No license creation
   - **Intermediate** (`waiting`, `confirming`):
     - Logs status and returns 200 (waits for final status)

4. **Idempotency**: Checks if invoice is already paid or subscription is already active to avoid duplicate processing

**Payment Statuses:**
- `waiting` - Payment waiting for user action
- `confirming` - Payment being confirmed on blockchain
- `confirmed` - Payment confirmed (treated as success)
- `finished` - Payment completed (final success status)
- `failed` - Payment failed
- `expired` - Payment expired
- `refunded` - Payment was refunded

**Response (200):**
```json
{
  "status": "ok"
}
```

**Error Responses:**
- `400` - Invalid request body or missing required fields
- `401` - Invalid signature

---

### Admin Endpoints

All admin endpoints require authentication via one of:
- `X-Admin-Token` header
- `Authorization: Bearer <token>` header

---

#### `GET /api/admin/invite-codes`

Get list of invite codes or a single invite code.

**Query Parameters:**
- `code` (optional) - Exact match for invite code (returns single code or 404)
- `ownerEmail` (optional) - Contains search for owner email
- `type` (optional) - Filter by type: `INVITE`, `REFERRAL`, `PARTNER`
- `status` (optional) - Filter by status: `ACTIVE`, `PAUSED`, `EXPIRED`

**Example:**
```
GET /api/admin/invite-codes?code=WELCOME2024
```

**Response (200) - Single Code:**
```json
{
  "id": "clx111",
  "code": "welcome2024",
  "type": "INVITE",
  "status": "ACTIVE",
  "maxUses": 100,
  "usedCount": 5,
  "remaining": 95,
  "ownerEmail": "admin@example.com",
  "notes": "Welcome campaign 2024",
  "revenueSharePercent": 0,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "expiresAt": "2024-12-31T23:59:59.000Z"
}
```

**Response (200) - List:**
```json
{
  "inviteCodes": [
    {
      "id": "clx111",
      "code": "welcome2024",
      "type": "INVITE",
      "status": "ACTIVE",
      "maxUses": 100,
      "usedCount": 5,
      "remaining": 95,
      "ownerEmail": "admin@example.com",
      "notes": "Welcome campaign 2024",
      "revenueSharePercent": 0,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "expiresAt": "2024-12-31T23:59:59.000Z"
    }
  ]
}
```

---

#### `POST /api/admin/invite-codes`

Create a new invite code.

**Request Body:**
```json
{
  "code": "PARTNER2024",
  "type": "PARTNER",
  "maxUses": 50,
  "expiresAt": "2024-12-31T23:59:59.000Z",
  "ownerEmail": "partner@example.com",
  "notes": "Partner campaign",
  "revenueSharePercent": 10
}
```

**Response (201):**
```json
{
  "id": "clx222",
  "code": "partner2024",
  "type": "PARTNER",
  "status": "ACTIVE",
  "maxUses": 50,
  "usedCount": 0,
  "remaining": 50,
  "ownerEmail": "partner@example.com",
  "notes": "Partner campaign",
  "revenueSharePercent": 10,
  "createdAt": "2024-01-15T10:30:00.000Z",
  "expiresAt": "2024-12-31T23:59:59.000Z"
}
```

**Notes:**
- Code is automatically normalized (trimmed and lowercased)
- `type` defaults to `INVITE` if not provided
- `status` defaults to `ACTIVE`
- `revenueSharePercent` defaults to 0

---

#### `PATCH /api/admin/invite-codes/:id`

Update an invite code.

**Request Body:**
```json
{
  "status": "PAUSED",
  "maxUses": 200,
  "notes": "Updated notes",
  "revenueSharePercent": 15
}
```

**Response (200):**
```json
{
  "id": "clx222",
  "code": "partner2024",
  "type": "PARTNER",
  "status": "PAUSED",
  "maxUses": 200,
  "usedCount": 0,
  "remaining": 200,
  "ownerEmail": "partner@example.com",
  "notes": "Updated notes",
  "revenueSharePercent": 15,
  "createdAt": "2024-01-15T10:30:00.000Z",
  "expiresAt": "2024-12-31T23:59:59.000Z"
}
```

---

#### `GET /api/admin/subscriptions`

Get list of subscriptions.

**Query Parameters:**
- `email` (optional) - Filter by user email (contains search)
- `status` (optional) - Filter by subscription status
- `planCode` (optional) - Filter by plan code
- `inviteCode` (optional) - Filter by invite code string
- `limit` (optional) - Limit results (default: 50, max: 200)

**Example:**
```
GET /api/admin/subscriptions?email=user@example.com&status=active&limit=10
```

**Response (200):**
```json
{
  "subscriptions": [
    {
      "id": "clx1234567890",
      "userEmail": "user@example.com",
      "planCode": "pro_monthly",
      "status": "active",
      "licenseKey": "sk-abc123...",
      "startsAt": "2024-01-15T10:30:00.000Z",
      "expiresAt": "2024-02-15T10:30:00.000Z",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "inviteCode": {
        "id": "clx111",
        "code": "welcome2024",
        "type": "INVITE",
        "ownerEmail": "admin@example.com",
        "revenueSharePercent": 0
      }
    }
  ]
}
```

---

#### `PATCH /api/admin/subscriptions/:id`

Update a subscription.

**Request Body:**
```json
{
  "status": "active",
  "expiresAt": "2024-12-31T23:59:59.000Z",
  "addDays": 30,
  "inviteCode": "NEWCODE2024",
  "maxRequests": 1000
}
```

**Notes:**
- At least one field must be provided
- `expiresAt` sets exact expiration date (ISO string)
- `addDays` extends from current `expiresAt` (or now if null)
- `inviteCode` can be a code string or `null` to clear
- `maxRequests` updates the license max requests on Shadow Intern

**Response (200):**
```json
{
  "subscription": {
    "id": "clx1234567890",
    "userEmail": "user@example.com",
    "status": "active",
    "planCode": "pro_monthly",
    "licenseKey": "sk-abc123...",
    "expiresAt": "2024-12-31T23:59:59.000Z",
    "inviteCode": {
      "id": "clx333",
      "code": "newcode2024",
      "type": "INVITE",
      "ownerEmail": null,
      "revenueSharePercent": 0
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T11:00:00.000Z"
  }
}
```

**License Sync:** This endpoint automatically calls Shadow Intern `/admin/license/update` when subscription is modified.

---

#### `GET /api/admin/invoices`

Get list of invoices.

**Query Parameters:**
- `email` (optional) - Filter by subscription user email
- `status` (optional) - Filter by invoice status
- `providerPaymentId` (optional) - Filter by NOWPayments payment ID
- `orderId` (optional) - Filter by invoice ID
- `limit` (optional) - Limit results (default: 50, max: 200)

**Response (200):**
```json
{
  "invoices": [
    {
      "id": "clx0987654321",
      "status": "paid",
      "priceAmount": 39.99,
      "priceCurrency": "USD",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "providerPaymentId": "12345678",
      "orderId": "clx0987654321",
      "subscription": {
        "id": "clx1234567890",
        "userEmail": "user@example.com",
        "planCode": "pro_monthly",
        "status": "active",
        "licenseKey": "sk-abc123...",
        "inviteCode": {
          "id": "clx111",
          "code": "welcome2024",
          "type": "INVITE",
          "ownerEmail": "admin@example.com",
          "revenueSharePercent": 0
        }
      }
    }
  ]
}
```

---

#### `GET /api/admin/stats`

Get high-level statistics for admin dashboard.

**Response (200):**
```json
{
  "subscriptions": {
    "total": 150,
    "active": 120,
    "expired": 30
  },
  "revenue": {
    "totalPaidInvoices": 200,
    "totalRevenueUsd": 7998.00,
    "revenueLast30DaysUsd": 1999.50
  },
  "plans": [
    {
      "planCode": "pro_monthly",
      "name": "Pro Monthly",
      "priceUsd": 39.99,
      "totalSubscriptions": 100,
      "activeSubscriptions": 80,
      "revenueUsd": 3999.00
    }
  ],
  "inviteCodes": [
    {
      "id": "clx111",
      "code": "welcome2024",
      "type": "INVITE",
      "status": "ACTIVE",
      "maxUses": 100,
      "usedCount": 50,
      "subscriptionsCount": 50,
      "activeSubscriptionsCount": 45,
      "revenueUsd": 1999.50,
      "ownerEmail": "admin@example.com",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "expiresAt": "2024-12-31T23:59:59.000Z"
    }
  ]
}
```

---

#### `GET /api/admin/user-overview`

Get comprehensive overview for a single user by email.

**Query Parameters:**
- `email` (required) - User email address

**Example:**
```
GET /api/admin/user-overview?email=user@example.com
```

**Response (200):**
```json
{
  "userEmail": "user@example.com",
  "metrics": {
    "totalSubscriptions": 2,
    "activeSubscriptions": 1,
    "totalPaidInvoices": 3,
    "totalRevenueUsd": 119.97,
    "plansUsed": [
      {
        "planCode": "pro_monthly",
        "count": 2
      }
    ]
  },
  "subscriptions": [
    {
      "id": "clx1234567890",
      "planCode": "pro_monthly",
      "planName": "Pro Monthly",
      "status": "active",
      "licenseKey": "sk-abc123...",
      "startsAt": "2024-01-15T10:30:00.000Z",
      "expiresAt": "2024-02-15T10:30:00.000Z",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "inviteCodeId": "clx111",
      "inviteCode": {
        "id": "clx111",
        "code": "welcome2024"
      }
    }
  ],
  "invoices": [
    {
      "id": "clx0987654321",
      "status": "paid",
      "amountUsd": 39.99,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "paidAt": "2024-01-15T10:35:00.000Z",
      "subscriptionId": "clx1234567890"
    }
  ],
  "inviteCodes": [
    {
      "id": "clx111",
      "code": "welcome2024",
      "type": "INVITE",
      "status": "ACTIVE",
      "ownerEmail": "admin@example.com"
    }
  ]
}
```

---

#### `POST /api/admin/invoices/:id/resend-receipt`

Resend receipt email for a paid invoice.

**Path Parameters:**
- `id` (required) - Invoice ID

**Example:**
```
POST /api/admin/invoices/clx0987654321/resend-receipt
```

**Response (200):**
```json
{
  "success": true,
  "message": "Receipt email sent successfully",
  "invoiceId": "clx0987654321"
}
```

**Error Responses:**
- `404` - Invoice not found
- `400` - Invoice is not paid

**Note:** This endpoint is idempotent. If the receipt was already sent, it will be sent again and `receiptSentAt` will be updated.

---

## License Sync Behavior

The service automatically synchronizes license keys with the Shadow Intern server in two scenarios:

### 1. Payment Confirmation (Webhook)

When a NOWPayments webhook confirms payment (`finished` or `confirmed` status):

**Endpoint Called:** `POST {SHADOW_INTERN_BASE_URL}/admin/license/upsert`

**Request Body:**
```json
{
  "userEmail": "user@example.com",
  "planCode": "pro_monthly",
  "startsAt": "2024-01-15T10:30:00.000Z",
  "expiresAt": "2024-02-15T10:30:00.000Z",
  "maxRequestsPerDay": 1000
}
```

**Headers:**
```
Authorization: Bearer {SHADOW_INTERN_ADMIN_TOKEN}
Content-Type: application/json
```

**Response Handling:**
- Extracts `licenseKey` from response (supports multiple field name variations)
- Updates subscription with the license key
- If license creation fails, subscription status is set to `payment_received_but_license_failed`

### 2. Admin Subscription Update

When an admin updates a subscription via `PATCH /api/admin/subscriptions/:id`:

**Endpoint Called:** `POST {SHADOW_INTERN_BASE_URL}/admin/license/update`

**Request Body:**
```json
{
  "subscriptionId": "clx1234567890",
  "userEmail": "user@example.com",
  "licenseKey": "sk-abc123...",
  "status": "active",
  "expiresAt": "2024-12-31T23:59:59.000Z",
  "addDays": 30,
  "maxRequests": 1000
}
```

**Headers:**
```
X-Admin-Token: {SHADOW_INTERN_ADMIN_TOKEN}
Content-Type: application/json
```

**Notes:**
- Only sends fields that were provided in the update request
- This function is defensive and never throws (errors are logged only)
- If Shadow Intern is not configured or license key is missing, the update is skipped

**Fields Sent:**
- `subscriptionId` - Always sent
- `userEmail` - Always sent
- `licenseKey` - Required (update skipped if missing)
- `status` - Only if provided
- `expiresAt` - Only if provided (ISO string or null)
- `addDays` - Only if provided
- `maxRequests` - Only if provided (number or null)

---

## Operational Notes

### Running with pm2

**Start service:**
```bash
pm2 start dist/server.js --name crypto-billing
```

**Restart service:**
```bash
pm2 restart crypto-billing
```

**Stop service:**
```bash
pm2 stop crypto-billing
```

**View logs:**
```bash
pm2 logs crypto-billing
```

**Save pm2 configuration:**
```bash
pm2 save
pm2 startup  # Follow instructions to enable auto-start on reboot
```

### Debugging Issues

**Common Error Messages:**

1. **"NOWPayments configuration is missing"**
   - Check `NOWPAYMENTS_API_KEY` is set in `.env`

2. **"Shadow Intern configuration is missing"**
   - Check `SHADOW_INTERN_BASE_URL` and `SHADOW_INTERN_ADMIN_TOKEN` are set

3. **"Invalid signature" (webhook)**
   - Verify `NOWPAYMENTS_IPN_SECRET` matches the secret in NOWPayments dashboard
   - Ensure webhook URL is correctly configured in NOWPayments

4. **"Invite code is required"**
   - All subscriptions require an invite code
   - Create invite codes via `POST /api/admin/invite-codes`

5. **"Subscription not found"**
   - Check subscription ID is correct
   - Verify database connection

**Logs:**
- Service logs to stdout/stderr
- Check pm2 logs: `pm2 logs crypto-billing`
- Look for prefixes: `[NOWPayments]`, `[ShadowIntern]`, `[ADMIN]`, `[Billing]`

**Database Inspection:**
```bash
# Open Prisma Studio
npx prisma studio

# Or use SQLite CLI
sqlite3 prisma/dev.db
```

---

## Testing

### Local Development Setup

1. **Start the service:**
   ```bash
   npm run dev
   ```

2. **Run database migrations:**
   ```bash
   npx prisma migrate deploy
   ```

3. **Ensure environment variables are set** (see Environment Variables section above)

### Testing NOWPayments Webhook

The webhook handler requires HMAC-SHA512 signature verification. To test locally:

1. **Create a test webhook payload** (save as `test-webhook.json`):
   ```json
   {
     "payment_id": "12345678",
     "payment_status": "finished",
     "order_id": "clx123abc",
     "price_amount": 39.99,
     "price_currency": "usd",
     "pay_amount": 0.001234,
     "pay_currency": "BTC"
   }
   ```

2. **Generate signature** using the script below or manually:
   ```bash
   node scripts/signNowpaymentsWebhook.js test-webhook.json
   ```

3. **Send webhook with curl:**
   ```bash
   curl -X POST http://localhost:4000/api/webhooks/nowpayments \
     -H "Content-Type: application/json" \
     -H "x-nowpayments-sig: <signature-from-step-2>" \
     --data-binary @test-webhook.json
   ```

### Testing Receipt Download

1. **Generate a receipt token** (requires a paid invoice):
   ```javascript
   // In Node.js REPL or script
   const { createReceiptToken } = require('./dist/utils/receiptToken');
   const token = createReceiptToken({
     invoiceId: 'your-invoice-id',
     email: 'user@example.com',
     expSeconds: 604800 // 7 days
   });
   console.log(token);
   ```

2. **Download receipt PDF:**
   ```bash
   curl -X GET "http://localhost:4000/api/billing/receipt/your-invoice-id?token=YOUR_TOKEN" \
     --output receipt.pdf
   ```

### Testing Admin Resend Receipt

```bash
curl -X POST http://localhost:4000/api/admin/invoices/your-invoice-id/resend-receipt \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

### Testing License Key in Receipt Emails

Receipt emails automatically include license keys when available. If a license key is missing, the system will:
1. Generate a new license key (format: `shadow-<random hex>`)
2. Persist it to the subscription record in the database
3. Sync it with the Shadow Intern server via `/admin/license/upsert`
4. Include it in the receipt email

**To test license key generation:**

1. **Create a paid invoice without a license key:**
   ```bash
   # Using Prisma Studio or direct DB access
   # Set subscription.licenseKey to NULL for a test subscription
   ```

2. **Resend the receipt email:**
   ```bash
   curl -X POST http://localhost:4000/api/admin/invoices/your-invoice-id/resend-receipt \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
     -H "Content-Type: application/json"
   ```

3. **Verify the license key:**
   - Check the receipt email - it should include the license key prominently
   - Check the database - `subscription.licenseKey` should be populated
   - Check logs - should show `[Receipt] Generated and persisted license key` and `[Receipt] Synced license key with Shadow Intern server`
   - Verify Shadow Intern server has the license key via `/admin/license/:key` endpoint

4. **Test idempotency:**
   - Resend the receipt again - the same license key should be used (not regenerated)
   - Logs should show `[Receipt] Using existing license key from database`

**Note:** If Shadow Intern server is unavailable during receipt sending, the license key will still be generated and persisted to the database, but the sync will fail (logged as a warning). The receipt email will still be sent with the license key.

### Helper Script: Sign NOWPayments Webhook

Create `scripts/signNowpaymentsWebhook.js`:

```javascript
const crypto = require('crypto');
const fs = require('fs');

const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET || '';
const jsonFile = process.argv[2];

if (!ipnSecret) {
  console.error('Error: NOWPAYMENTS_IPN_SECRET environment variable is not set');
  process.exit(1);
}

if (!jsonFile) {
  console.error('Usage: node signNowpaymentsWebhook.js <webhook-payload.json>');
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

// Sort keys alphabetically and stringify
const sortedKeys = Object.keys(payload).sort();
const sortedBody = {};
for (const key of sortedKeys) {
  sortedBody[key] = payload[key];
}
const sortedBodyString = JSON.stringify(sortedBody);

// Compute HMAC-SHA512
const hmac = crypto.createHmac('sha512', ipnSecret);
hmac.update(sortedBodyString);
const signature = hmac.digest('hex');

console.log('Signature:', signature);
console.log('\nUse this in the x-nowpayments-sig header:');
console.log(signature);
```

Make it executable:
```bash
chmod +x scripts/signNowpaymentsWebhook.js
```

---

### Typical Pitfalls

1. **Migrations Not Applied**
   - Always run `npx prisma migrate deploy` in production after code updates
   - Check migration status: `npx prisma migrate status`

2. **InviteCode Table Empty**
   - Create at least one invite code before users can create subscriptions
   - Use `POST /api/admin/invite-codes` or seed script

3. **Environment Variable Mismatch**
   - Ensure `.env` file exists and is in the project root
   - Verify all required variables are set (check `src/config/env.ts`)
   - Restart service after changing `.env` (pm2 restart)

4. **Webhook URL Not Accessible**
   - `BILLING_PUBLIC_BASE_URL` must be publicly accessible
   - NOWPayments must be able to reach `/api/webhooks/nowpayments`
   - Check firewall/network settings

5. **License Sync Failures**
   - Check Shadow Intern server is running and accessible
   - Verify `SHADOW_INTERN_ADMIN_TOKEN` is correct
   - Check Shadow Intern logs for API errors
   - Subscriptions with `payment_received_but_license_failed` status need manual intervention

6. **Database Locked (SQLite)**
   - SQLite can have locking issues under high concurrency
   - Consider migrating to Postgres for production
   - Check for long-running transactions

### Database Migrations

**Development:**
```bash
# Create and apply migration
npx prisma migrate dev --name migration_name
```

**Production:**
```bash
# Apply existing migrations (does not create new ones)
npx prisma migrate deploy
```

**Reset Database (⚠️ DESTRUCTIVE):**
```bash
# Development only - deletes all data
npx prisma migrate reset
```

---

## Database Schema

Key models:

- **Plan**: Pricing plans with duration and rate limits
- **Subscription**: User subscriptions (status: `pending_payment`, `active`, `expired`, `canceled`, `payment_received_but_license_failed`)
- **Invoice**: Payment invoices linked to subscriptions
- **Payment**: On-chain payment records (transaction hashes, confirmations)
- **PaymentMethod**: Supported crypto tokens and networks
- **InviteCode**: Invite/referral codes with usage tracking

See `prisma/schema.prisma` for full schema definition.

---

## Development

### Linting
```bash
npm run lint
```

### Formatting
```bash
npm run format
```

### Prisma Studio
```bash
npx prisma studio
```

Opens a GUI to browse and edit database records.

---

## License

ISC
