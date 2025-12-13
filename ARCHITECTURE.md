# Shadow Intern Architecture

**Last Updated:** 2025

This document explains how all components in the Shadow Intern ecosystem work together. It's written for developers who need to understand, maintain, or extend the system.

---

## High-Level Overview

Shadow Intern is a multi-repo system that enables users to purchase subscriptions, receive license keys, and use a Chrome extension to generate AI-powered Twitter replies. The system consists of four main components:

1. **crypto-billing-service** - Node.js + Express billing backend with Prisma + SQLite
2. **shadow-intern-website** - Next.js 16 marketing site with checkout and admin panel
3. **shadow-intern-server** (xallower-server) - Node.js API for generating replies using OpenAI
4. **shadow-intern-extension** (xallower-extension) - Chrome extension that injects reply buttons on Twitter

### System Flow Diagram

```
┌─────────────┐
│   Browser   │
│   (User)    │
└──────┬──────┘
       │
       │ 1. Enters invite code → sees pricing
       ▼
┌─────────────────────┐
│ shadow-intern-      │
│ website             │
│ (Next.js)           │
└──────┬──────────────┘
       │
       │ 2. POST /api/billing/create-subscription
       ▼
┌─────────────────────┐
│ crypto-billing-     │
│ service             │
│ (Express + Prisma)  │
└──────┬──────────────┘
       │
       │ 3. Creates subscription + invoice
       │ 4. POST to NOWPayments API
       ▼
┌─────────────────────┐
│   NOWPayments       │
│   (Payment Gateway) │
└──────┬──────────────┘
       │
       │ 5. User pays with crypto
       │ 6. Webhook: POST /api/webhooks/nowpayments
       ▼
┌─────────────────────┐
│ crypto-billing-     │
│ service             │
│ (Webhook Handler)   │
└──────┬──────────────┘
       │
       │ 7. Updates invoice → paid
       │ 8. Updates subscription → active
       │ 9. POST /admin/license/upsert
       ▼
┌─────────────────────┐
│ shadow-intern-      │
│ server              │
│ (License DB)        │
└──────┬──────────────┘
       │
       │ 10. Returns license key
       ▼
┌─────────────────────┐
│ crypto-billing-     │
│ service             │
│ (Stores licenseKey) │
└──────┬──────────────┘
       │
       │ 11. User sees license on /success page
       │ 12. User installs extension
       │ 13. User enters license key in extension
       ▼
┌─────────────────────┐
│ shadow-intern-      │
│ extension           │
│ (Chrome Extension)  │
└──────┬──────────────┘
       │
       │ 14. User clicks reply button on Twitter
       │ 15. POST /shadow/generate (with X-License-Key header)
       ▼
┌─────────────────────┐
│ shadow-intern-      │
│ server              │
│ (OpenAI + License   │
│  Validation)        │
└─────────────────────┘
       │
       │ 16. Validates license → generates reply → returns
       ▼
┌─────────────────────┐
│ shadow-intern-      │
│ extension           │
│ (Inserts reply)     │
└─────────────────────┘
```

---

## Component Descriptions

### 1. crypto-billing-service

**Tech Stack:** Node.js, Express, TypeScript, Prisma, SQLite

**Purpose:** Handles all billing logic, subscriptions, invoices, invite codes, and payment provider integration.

**Key Responsibilities:**
- Create subscriptions and invoices
- Integrate with NOWPayments for crypto payments
- Process webhooks from NOWPayments
- Manage invite codes (validation, usage tracking)
- Sync license keys with Shadow Intern server
- Provide admin API for managing subscriptions/invoices

**Database Schema:**
- `Plan` - Subscription plans (monthly, yearly, lifetime)
- `Subscription` - User subscriptions linked to plans
- `Invoice` - Payment invoices linked to subscriptions
- `Payment` - Individual payment transactions
- `PaymentMethod` - Supported crypto payment methods
- `InviteCode` - Invite/referral codes

**Key Endpoints:**
- `POST /api/billing/create-subscription` - Create subscription + invoice
- `GET /api/billing/subscription-status` - Get subscription status by ID + email
- `POST /api/webhooks/nowpayments` - NOWPayments webhook handler
- `GET /api/admin/subscriptions` - List subscriptions (admin)
- `PATCH /api/admin/subscriptions/:id` - Update subscription (admin)
- `GET /api/admin/invoices` - List invoices (admin)
- `GET /api/admin/stats` - Dashboard stats (admin)
- `GET /api/admin/user-overview` - User details by email (admin)
- `GET /api/admin/invite-codes` - List invite codes (admin)
- `POST /api/admin/invite-codes` - Create invite code (admin)

**External Integrations:**
- **NOWPayments API** - Create payments, verify webhook signatures
- **Shadow Intern Server** - Create/update licenses via `/admin/license/upsert` and `/admin/license/update`

---

### 2. shadow-intern-website

**Tech Stack:** Next.js 16, React, TypeScript, Tailwind CSS

**Purpose:** Marketing site, pricing page, checkout flow, success page, and admin panel.

**Key Pages:**
- `/` - Landing page
- `/pricing` - Pricing page with plan selection
- `/success` - Success page showing license key after payment
- `/admin` - Admin dashboard (requires auth)

**API Routes (Next.js API routes that proxy to billing service):**
- `POST /api/billing/create-subscription` - Proxies to billing service
- `GET /api/billing/subscription-status` - Proxies to billing service
- `POST /api/invite/validate` - Validates invite code
- `GET /api/admin/stats` - Admin stats
- `GET /api/admin/subscriptions` - List subscriptions
- `PATCH /api/admin/subscriptions/[id]` - Update subscription
- `GET /api/admin/invoices` - List invoices
- `GET /api/admin/user-overview` - User overview
- `GET /api/admin/invite-codes` - List invite codes
- `POST /api/admin/invite-codes` - Create invite code

**Note:** All admin routes require `BILLING_ADMIN_TOKEN` in server-side env vars. The website acts as a proxy, forwarding requests to the billing service with the admin token.

---

### 3. shadow-intern-server (xallower-server)

**Tech Stack:** Node.js, Express, SQLite (better-sqlite3), OpenAI API

**Purpose:** Generates Twitter replies using OpenAI, validates license keys, and tracks usage.

**Key Endpoints:**
- `POST /shadow/generate` - Generate reply (used by extension)
  - Requires: `X-License-Key` header
  - Validates license before generating
  - Increments usage counters
- `POST /admin/license/upsert` - Create/update license (called by billing service)
  - Requires: `Authorization: Bearer <ADMIN_API_TOKEN>` or `X-Admin-Token` header
- `POST /admin/license/update` - Update license status/expiry (called by billing service)
  - Requires: `Authorization: Bearer <ADMIN_API_TOKEN>` or `X-Admin-Token` header
- `GET /admin/license/:key` - Debug endpoint to check license status
- `POST /license/validate` - Validate license key (used by extension)

**License Validation Logic:**
- Checks `status` field: must be `'active'` (not `'paused'`, `'canceled'`, `'expired'`)
- Checks `expires_at`: if set, must be in the future
- Checks `max_requests`: if set, `used_requests` must be less than `max_requests`
- Checks `max_requests_per_day`: if set, daily usage must be under limit
- Legacy: Falls back to `active` field and `limit_total` if new fields not set

**Database Schema:**
- `licenses` table with fields:
  - `license_key` (unique)
  - `user_email`
  - `subscription_id` (links to billing service)
  - `plan_code`
  - `status` ('active' | 'paused' | 'canceled' | 'expired')
  - `expires_at` (timestamp, null for lifetime)
  - `max_requests_per_day` (daily limit)
  - `max_requests` (total limit)
  - `used_requests` (usage counter)
  - `usage` (legacy counter)
  - `limit_total` (legacy limit)

---

### 4. shadow-intern-extension (xallower-extension)

**Tech Stack:** Vanilla JavaScript (Chrome Extension Manifest V3)

**Purpose:** Injects custom reply buttons on Twitter/X and calls the Shadow Intern server to generate replies.

**Key Files:**
- `manifest.json` - Extension configuration
- `content.js` - Injects reply buttons into Twitter pages
- `background.js` - Handles API calls to Shadow Intern server
- `options.html/js` - Settings page for license key and mode configuration
- `popup.html/js` - Extension popup UI

**Flow:**
1. Content script watches for Twitter composer boxes
2. Injects panel with reply mode buttons (One-Liner, Agree, Disagree, etc.)
3. User clicks a button → extracts tweet data (text, images, video hints)
4. Sends message to background script
5. Background script validates license key
6. Background script calls `POST /shadow/generate` with `X-License-Key` header
7. Server validates license and generates reply using OpenAI
8. Reply is inserted into the active textbox

**License Storage:**
- License key stored in `chrome.storage.sync`
- Validated before each request (can be cached)

---

## User Lifecycle

### 1. User Enters Invite Code

**Flow:**
- User visits `/pricing` page
- Enters invite code in form
- Frontend calls `POST /api/invite/validate` (Next.js API route)
- Next.js route proxies to `GET /api/invite/validate` on billing service
- Billing service validates invite code:
  - Checks if code exists
  - Checks if `status === 'ACTIVE'`
  - Checks if `expiresAt` is in future (if set)
  - Checks if `usedCount < maxUses` (if maxUses is set)
- If valid, user can proceed to checkout

**Example Request:**
```json
POST /api/invite/validate
{
  "code": "WELCOME2024"
}
```

**Example Response:**
```json
{
  "valid": true,
  "code": "welcome2024",
  "type": "INVITE",
  "status": "ACTIVE",
  "maxUses": 100,
  "usedCount": 42
}
```

---

### 2. User Selects Plan and Pays

**Flow:**
- User selects plan (e.g., `pro_monthly`)
- User enters email
- Frontend calls `POST /api/billing/create-subscription` (Next.js API route)
- Next.js route proxies to billing service
- Billing service:
  1. Validates invite code (required)
  2. Creates `Subscription` record with status `'pending_payment'`
  3. Creates `Invoice` record with status `'pending'`
  4. Calls NOWPayments API to create payment
  5. Updates invoice with `providerPaymentId` and `providerInvoiceUrl`
  6. Returns payment URL to frontend
- Frontend redirects user to NOWPayments payment page
- User pays with crypto (BTC, ETH, USDT, etc.)

**Example Request:**
```json
POST /api/billing/create-subscription
{
  "planCode": "pro_monthly",
  "userEmail": "user@example.com",
  "productCode": "shadow_intern",
  "inviteCode": "WELCOME2024",
  "successRedirectUrl": "https://shadowintern.xyz/success",
  "cancelRedirectUrl": "https://shadowintern.xyz/cancel"
}
```

**Example Response:**
```json
{
  "subscriptionId": "clx123abc",
  "invoiceId": "inv_456def",
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

---

### 3. Payment Webhook Processing

**Flow:**
- NOWPayments sends webhook to `POST /api/webhooks/nowpayments`
- Webhook includes HMAC signature in `x-nowpayments-sig` header
- Billing service verifies signature using `NOWPAYMENTS_IPN_SECRET`
- If payment status is `'finished'` or `'confirmed'`:
  1. Updates invoice status to `'paid'`
  2. Updates subscription status to `'active'`
  3. Computes expiration dates (`startsAt`, `expiresAt`)
  4. Increments invite code `usedCount`
  5. Calls Shadow Intern server: `POST /admin/license/upsert`
  6. Shadow Intern server creates/updates license and returns `licenseKey`
  7. Billing service stores `licenseKey` in subscription record
- If payment failed/expired, invoice is marked as `'expired'` or `'canceled'`

**Example Webhook Payload:**
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

**Shadow Intern License Creation:**
```json
POST {SHADOW_INTERN_BASE_URL}/admin/license/upsert
Headers: {
  "Authorization": "Bearer {SHADOW_INTERN_ADMIN_TOKEN}"
}
Body: {
  "userEmail": "user@example.com",
  "planCode": "pro_monthly",
  "subscriptionId": "clx123abc",
  "startsAt": "2024-01-01T00:00:00Z",
  "expiresAt": "2024-01-31T23:59:59Z",
  "maxRequestsPerDay": 100
}
```

**Response:**
```json
{
  "licenseKey": "shadow-a1b2c3d4",
  "plan": "pro_monthly",
  "expiresAt": "2024-01-31T23:59:59Z",
  "limitPerDay": 100
}
```

---

### 4. User Receives License Key

**Flow:**
- User is redirected to `/success?subscriptionId=clx123abc&email=user@example.com`
- Success page calls `GET /api/billing/subscription-status?subscriptionId=...&email=...`
- Billing service returns subscription with `licenseKey` (if payment processed)
- If `status === 'active'` and `licenseKey` exists, success page displays license key
- If not ready yet, shows "Payment is processing" message

**Example Response:**
```json
{
  "id": "clx123abc",
  "status": "active",
  "planCode": "pro_monthly",
  "licenseKey": "shadow-a1b2c3d4",
  "expiresAt": "2024-01-31T23:59:59Z",
  "userEmail": "user@example.com"
}
```

---

### 5. User Installs Extension

**Flow:**
- User downloads extension from `/success` page
- Installs extension in Chrome (`chrome://extensions`, Developer Mode, Load unpacked)
- Opens extension options page
- Enters license key: `shadow-a1b2c3d4`
- Extension stores license key in `chrome.storage.sync`

---

### 6. User Uses Extension

**Flow:**
- User visits Twitter/X
- Extension injects reply buttons into composer boxes
- User clicks a button (e.g., "One-Liner")
- Content script extracts tweet data:
  - Text content
  - Image URLs (filters out avatars)
  - Video hints (if video present)
  - Tweet URL, author handle, tweet ID
- Sends message to background script
- Background script:
  1. Validates license: `POST /license/validate` (optional, can be cached)
  2. Calls `POST /shadow/generate` with `X-License-Key` header
- Shadow Intern server:
  1. Validates license (checks status, expiration, limits)
  2. If valid, generates reply using OpenAI (GPT-4.1-mini)
  3. Increments usage counters (`used_requests`, `usage`)
  4. Logs usage in `usage_logs` table
  5. Returns reply text
- Extension inserts reply into active textbox

**Example Request:**
```json
POST /shadow/generate
Headers: {
  "X-License-Key": "shadow-a1b2c3d4",
  "Content-Type": "application/json"
}
Body: {
  "mode": "one-liner",
  "tweetText": "Just shipped a new feature!",
  "imageUrls": [],
  "hasVideo": false,
  "videoHints": [],
  "mediaShortLinks": [],
  "settings": {
    "maxChars": 220,
    "tone": "neutral",
    "humanize": true
  }
}
```

**Example Response:**
```json
{
  "reply": "Nice work! What's next?"
}
```

---

### 7. Subscription Changes

**Admin Actions:**
- **Pause subscription:** Admin sets `status = 'paused'` → calls Shadow Intern `/admin/license/update` with `status: 'paused'`
- **Cancel subscription:** Admin sets `status = 'canceled'` → calls Shadow Intern `/admin/license/update` with `status: 'canceled'`
- **Extend subscription:** Admin sets `addDays = 30` → calls Shadow Intern `/admin/license/update` with `addDays: 30`
- **Expire subscription:** Admin sets `status = 'expired'` → calls Shadow Intern `/admin/license/update` with `status: 'expired'`

**Automatic Expiration:**
- Billing service can check `expiresAt` and mark subscriptions as expired
- Shadow Intern server checks `expires_at` during license validation

**License Behavior:**
- `status = 'paused'` → License validation fails with `STATUS_PAUSED`
- `status = 'canceled'` → License validation fails with `STATUS_CANCELED`
- `status = 'expired'` → License validation fails with `STATUS_EXPIRED`
- `expires_at` in past → License validation fails with `EXPIRED`
- `used_requests >= max_requests` → License validation fails with `LIMIT_REACHED`
- Daily limit exceeded → License validation fails with `LIMIT_REACHED`

---

## Billing Flow

### Payment Provider: NOWPayments

**Integration:**
- Billing service uses NOWPayments API to create payments
- NOWPayments supports multiple cryptocurrencies (BTC, ETH, USDT, etc.)
- Webhook endpoint: `POST /api/webhooks/nowpayments`

**Payment Statuses:**
- `waiting` - User hasn't paid yet
- `confirming` - Payment being confirmed on blockchain
- `confirmed` - Payment confirmed (treated as success)
- `finished` - Payment completed (final success status)
- `failed` - Payment failed
- `expired` - Payment expired
- `refunded` - Payment refunded

**Webhook Security:**
- NOWPayments signs webhooks with HMAC-SHA512
- Signature in `x-nowpayments-sig` header
- Billing service verifies using `NOWPAYMENTS_IPN_SECRET`

**Idempotency:**
- Webhook handler checks if invoice is already `'paid'` before processing
- Prevents duplicate license creation

---

## License Lifecycle & Sync

### License Creation

**When:** After successful payment (webhook handler)

**Process:**
1. Billing service calls `POST /admin/license/upsert` on Shadow Intern server
2. Shadow Intern server:
   - If license exists for email → extends expiration
   - If license doesn't exist → creates new license with generated key
   - Returns `licenseKey`
3. Billing service stores `licenseKey` in subscription record

**Request Example:**
```json
POST /admin/license/upsert
{
  "userEmail": "user@example.com",
  "planCode": "pro_monthly",
  "subscriptionId": "clx123abc",
  "startsAt": "2024-01-01T00:00:00Z",
  "expiresAt": "2024-01-31T23:59:59Z",
  "maxRequestsPerDay": 100
}
```

### License Updates

**When:** Admin modifies subscription (pause, cancel, extend, etc.)

**Process:**
1. Admin updates subscription via `PATCH /api/admin/subscriptions/:id`
2. Billing service calls `POST /admin/license/update` on Shadow Intern server
3. Shadow Intern server updates license record

**Request Example:**
```json
POST /admin/license/update
{
  "licenseKey": "shadow-a1b2c3d4",
  "status": "paused"
}
```

**Note:** License updates are **defensive** - if Shadow Intern server is unavailable, billing service logs error but doesn't fail the admin request. This prevents admin UI from breaking if Shadow Intern server is down.

---

## Admin Panel Overview

**Location:** `/admin` on shadow-intern-website

**Authentication:** Requires `BILLING_ADMIN_TOKEN` in server-side env vars (Next.js API routes check this)

**Features:**

### Dashboard (`/admin`)
- **Stats:** Total subscriptions, active subscriptions, revenue (total + last 30 days)
- **Plans Breakdown:** Subscriptions and revenue per plan
- **Invite Codes Breakdown:** Usage and revenue per invite code

### Subscriptions (`/admin`)
- **List:** Filter by email, status, plan code, invite code
- **Update:** Change status, extend expiration, link invite code
- **View:** See subscription details, license key, expiration

### Invoices (`/admin`)
- **List:** Filter by email, status, payment ID
- **View:** See invoice details, payment provider info

### User Overview (`/admin`)
- **Search by email:** Shows all subscriptions, invoices, invite codes for a user
- **Metrics:** Total subscriptions, active subscriptions, revenue

### Invite Codes (`/admin`)
- **List:** See all invite codes with usage stats
- **Create:** Create new invite codes (INVITE, REFERRAL, PARTNER types)
- **Update:** Change status, max uses, notes, revenue share

**API Mapping:**
- All admin routes in Next.js proxy to billing service with `X-Admin-Token` header
- Billing service validates token using `BILLING_ADMIN_TOKEN` env var

---

## Error Handling & Failure Modes

### 1. Webhook Failed

**Scenario:** NOWPayments webhook fails to reach billing service

**Impact:** Invoice remains `'pending'`, subscription remains `'pending_payment'`, no license created

**Recovery:**
- NOWPayments retries webhooks automatically
- Admin can manually check payment status in NOWPayments dashboard
- Admin can manually update invoice/subscription via admin panel

**Prevention:**
- Webhook endpoint should be publicly accessible
- Monitor webhook logs for failures
- Set up alerts for webhook errors

---

### 2. License Creation Failed

**Scenario:** Payment succeeded, but Shadow Intern server is down or returns error

**Impact:** Subscription status set to `'payment_received_but_license_failed'`, no license key stored

**Recovery:**
- Admin can manually call `/admin/license/upsert` via Shadow Intern server API
- Admin can update subscription with license key manually
- Or retry license creation via admin panel (future feature)

**Prevention:**
- Monitor Shadow Intern server health
- Set up alerts for license creation failures
- Implement retry logic (future improvement)

---

### 3. License Not Found

**Scenario:** Extension tries to use license key that doesn't exist in Shadow Intern server

**Impact:** `POST /shadow/generate` returns 401/403, extension shows error

**Error Response:**
```json
{
  "error": "Invalid license key",
  "reason": "not_found"
}
```

**Recovery:**
- User should check license key in extension options
- User should verify license key on success page
- Admin can check license in Shadow Intern server: `GET /admin/license/:key`

---

### 4. Subscription Pending

**Scenario:** Payment is still processing (status `'waiting'` or `'confirming'`)

**Impact:** User sees "Payment is processing" on success page, no license key yet

**Recovery:**
- Wait for webhook (NOWPayments sends webhooks as payment status changes)
- User can refresh success page (it polls subscription status)
- Admin can manually check payment status

---

### 5. License Expired

**Scenario:** Subscription `expiresAt` is in the past

**Impact:** License validation fails, extension shows "License expired" error

**Error Response:**
```json
{
  "error": "License expired",
  "reason": "expired"
}
```

**Recovery:**
- User needs to renew subscription
- Admin can extend expiration: `PATCH /api/admin/subscriptions/:id` with `addDays: 30`

---

### 6. Daily Limit Reached

**Scenario:** User has exceeded `max_requests_per_day` limit

**Impact:** License validation fails, extension shows "Daily limit reached" error

**Error Response:**
```json
{
  "error": "Daily limit exceeded",
  "reason": "limit_exceeded"
}
```

**Recovery:**
- Wait until next day (daily limit resets at midnight)
- Admin can increase `max_requests_per_day` limit

---

### 7. Total Limit Reached

**Scenario:** User has exceeded `max_requests` limit (if set)

**Impact:** License validation fails, extension shows "Limit reached" error

**Recovery:**
- Admin can increase `max_requests` limit
- Or user needs to upgrade plan

---

### 8. Invite Code Invalid

**Scenario:** User enters invalid/expired invite code

**Impact:** Frontend shows error, user cannot proceed to checkout

**Error Response:**
```json
{
  "error": "Invite code is invalid or expired"
}
```

**Recovery:**
- User needs valid invite code
- Admin can create new invite code or reactivate expired one

---

## Environment Variables

### crypto-billing-service

**Required:**
- `DATABASE_URL` - SQLite database path (e.g., `file:./prisma/dev.db`)
- `NOWPAYMENTS_API_KEY` - NOWPayments API key
- `NOWPAYMENTS_IPN_SECRET` - Secret for webhook signature verification
- `BILLING_ADMIN_TOKEN` - Token for admin API authentication
- `SHADOW_INTERN_BASE_URL` - Shadow Intern server URL (e.g., `https://api.shadowintern.xyz`)
- `SHADOW_INTERN_ADMIN_TOKEN` - Token for Shadow Intern admin API

**Optional:**
- `PORT` - Server port (default: 4000)
- `NOWPAYMENTS_BASE_URL` - NOWPayments API base URL (default: `https://api.nowpayments.io/v1`)
- `BILLING_PUBLIC_BASE_URL` - Public URL for billing service (for webhooks)

---

### shadow-intern-website

**Required (Server-side):**
- `BILLING_BASE_URL` - Billing service URL (e.g., `https://billing.shadowintern.xyz`)
- `BILLING_ADMIN_TOKEN` - Token for admin API (same as billing service)

**Required (Client-side, `NEXT_PUBLIC_*`):**
- `NEXT_PUBLIC_BILLING_BASE_URL` - Billing service URL (for client-side API calls)
- `NEXT_PUBLIC_SITE_URL` - Website URL (e.g., `https://shadowintern.xyz`)
- `NEXT_PUBLIC_PRODUCT_CODE` - Product code (default: `shadow_intern`)

**Optional:**
- Standard Next.js env vars (for deployment)

---

### shadow-intern-server (xallower-server)

**Required:**
- `OPENAI_API_KEY` - OpenAI API key for generating replies
- `ADMIN_API_TOKEN` - Token for admin endpoints (used by billing service)
- `PORT` - Server port (default: 3001)

**Optional:**
- Database path (default: `./shadow.db`)

---

### shadow-intern-extension

**Hardcoded URLs (in `background.js`):**
- `SHADOW_URL` - Shadow Intern server URL (e.g., `https://api.shadowintern.xyz/shadow/generate`)
- `LICENSE_VALIDATE_URL` - License validation URL (e.g., `https://api.shadowintern.xyz/license/validate`)

**Note:** These URLs are hardcoded in the extension code. To change them, rebuild the extension.

---

## Example Requests & Responses

### Create Subscription

**Request:**
```bash
curl -X POST https://billing.shadowintern.xyz/api/billing/create-subscription \
  -H "Content-Type: application/json" \
  -d '{
    "planCode": "pro_monthly",
    "userEmail": "user@example.com",
    "productCode": "shadow_intern",
    "inviteCode": "WELCOME2024"
  }'
```

**Response:**
```json
{
  "subscriptionId": "clx123abc",
  "invoiceId": "inv_456def",
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

---

### Get Subscription Status

**Request:**
```bash
curl "https://billing.shadowintern.xyz/api/billing/subscription-status?subscriptionId=clx123abc&email=user@example.com"
```

**Response:**
```json
{
  "id": "clx123abc",
  "status": "active",
  "planCode": "pro_monthly",
  "licenseKey": "shadow-a1b2c3d4",
  "expiresAt": "2024-01-31T23:59:59Z",
  "userEmail": "user@example.com"
}
```

---

### Generate Reply (Extension → Server)

**Request:**
```bash
curl -X POST https://api.shadowintern.xyz/shadow/generate \
  -H "Content-Type: application/json" \
  -H "X-License-Key: shadow-a1b2c3d4" \
  -d '{
    "mode": "one-liner",
    "tweetText": "Just shipped a new feature!",
    "imageUrls": [],
    "hasVideo": false,
    "settings": {
      "maxChars": 220,
      "tone": "neutral"
    }
  }'
```

**Response:**
```json
{
  "reply": "Nice work! What's next?"
}
```

---

### Update Subscription (Admin)

**Request:**
```bash
curl -X PATCH https://billing.shadowintern.xyz/api/admin/subscriptions/clx123abc \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: your-admin-token" \
  -d '{
    "status": "paused",
    "addDays": 30
  }'
```

**Response:**
```json
{
  "subscription": {
    "id": "clx123abc",
    "userEmail": "user@example.com",
    "status": "paused",
    "planCode": "pro_monthly",
    "licenseKey": "shadow-a1b2c3d4",
    "expiresAt": "2024-02-29T23:59:59Z",
    "inviteCode": {
      "id": "inv_789",
      "code": "welcome2024"
    }
  }
}
```

---

## Deployment Notes

### Billing Service
- Deploy to a server with persistent storage (for SQLite database)
- Set up webhook endpoint to be publicly accessible
- Configure NOWPayments webhook URL: `https://billing.shadowintern.xyz/api/webhooks/nowpayments`
- Run Prisma migrations: `npx prisma migrate deploy`

### Shadow Intern Website
- Deploy to Vercel (or similar)
- Set environment variables in Vercel dashboard
- Both server-side and client-side env vars need to be set

### Shadow Intern Server
- Deploy to a server with persistent storage (for SQLite database)
- Ensure OpenAI API key is valid
- Set up health check endpoint (future improvement)

### Extension
- Build extension (zip files)
- Host extension files for download
- Update download link in success page

---

## Future Improvements

1. **Retry Logic:** Implement retry logic for license creation failures
2. **Webhook Monitoring:** Set up monitoring/alerting for webhook failures
3. **License Sync:** Implement periodic sync job to ensure billing and Shadow Intern server are in sync
4. **Subscription Renewals:** Implement automatic renewal logic for recurring subscriptions
5. **Email Notifications:** Send emails when license is created, expired, etc.
6. **Usage Analytics:** Track usage patterns, popular modes, etc.
7. **Multi-Product Support:** Support multiple products (not just Shadow Intern)

---

## Troubleshooting

### License not working in extension
1. Check license key is correct in extension options
2. Check license exists in Shadow Intern server: `GET /admin/license/:key`
3. Check license status is `'active'`
4. Check license hasn't expired
5. Check daily/total limits haven't been reached

### Payment succeeded but no license
1. Check webhook logs in billing service
2. Check subscription status: `GET /api/billing/subscription-status`
3. If status is `'payment_received_but_license_failed'`, manually create license
4. Check Shadow Intern server logs for errors

### Admin panel not working
1. Check `BILLING_ADMIN_TOKEN` is set in Next.js env vars
2. Check `BILLING_BASE_URL` is correct
3. Check billing service is accessible
4. Check browser console for errors

---

**End of Architecture Document**

