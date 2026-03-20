# Deployment Conversion Plan

**Architecture:** Vercel (agnes-next) + Railway (deepquill) + Neon Postgres

**Quick reference:**
- [1. Pre-Deployment Checklist](#1-pre-deployment-checklist)
- [2. Environment Variables](#2-environment-variables)
- [3. DATABASE_URL in agnes-next](#3-does-agnes-next-need-database_url-in-production)
- [4. Local URLs, SQLite, JSON, Proxy](#4-local-urls-sqlite-json-orders-proxy-assumptions)
- [5. Stripe Webhook → Railway Direct](#5-stripe-webhook-migration-to-railway-direct)
- [6. Prisma Migration Steps](#6-prisma-migration-sqlite--postgres)
- [7. Launch Test Plan](#7-launch-test-plan)
- [8. Rollback Plan](#8-rollback-plan)

---

## 1. Pre-Deployment Checklist

### Code/Config Changes Required

| # | Location | Change |
|---|----------|--------|
| 1 | `agnes-next/prisma/schema.prisma` | Change `provider = "sqlite"` to `provider = "postgresql"` |
| 2 | `agnes-next/src/app/share/[platform]/[variant]/layout.tsx` | Replace hardcoded `BASE_URL = 'https://agnes-dev.ngrok-free.app'` with `process.env.NEXT_PUBLIC_SITE_URL \|\| process.env.SITE_URL \|\| 'https://theagnesprotocol.com'` |
| 3 | `agnes-next/src/app/s/fb/page.tsx` | Replace fallback `'https://agnes-dev.ngrok-free.app'` with production URL |
| 4 | `agnes-next/src/app/s/ig/page.tsx` | Same as above |
| 5 | `agnes-next/src/app/api/create-checkout-session/route.ts` | Replace fallback `'https://agnes-dev.ngrok-free.app'` with `'https://theagnesprotocol.com'` |
| 6 | `agnes-next/src/app/api/admin/jobs/*` (4 routes) | Replace fallback `'https://agnes-dev.ngrok-free.app'` with production URL |
| 7 | `agnes-next/src/lib/email/associateCommission.ts` | Same as above |
| 8 | `agnes-next/src/app/api/track/route.ts` | Add production origin(s) to `ALLOW_ORIGINS` (e.g. `https://theagnesprotocol.com`) |
| 9 | `agnes-next/src/app/api/contest/login/route.ts` | Add production origin(s) to allowlist |
| 10 | `agnes-next/src/lib/deepquillProxy.ts` | Ensure `NEXT_PUBLIC_API_BASE_URL` is set (no localhost fallback in prod) |
| 11 | `agnes-next/src/app/api/refer-friend/route.ts` | Ensure `DEEPQUILL_API_BASE` is set (no localhost fallback in prod) |
| 12 | `agnes-next/src/lib/referrals/awardReferralCommission.ts` | Fix URL: use `${apiUrl}/api/referrals/award-commission` (currently missing `/api` prefix) |
| 13 | `deepquill/src/config/env.cjs` | Replace fallback `'https://agnes-dev.ngrok-free.app'` with `'https://theagnesprotocol.com'` |
| 14 | `deepquill/api/create-checkout-session.cjs` | Same as above |
| 15 | `deepquill/package.json` | Add `@prisma/client` and `prisma` as dependencies; add `prisma:generate` script that runs from agnes-next schema |
| 16 | `deepquill/api/stripe-webhook.cjs` | Implement TODO: create Prisma Order, award referral commission when `metadata.ref` present |
| 16b | `deepquill/api/create-checkout-session.cjs` | Use `req.body.success_url` and `req.body.cancel_url` when provided (agnes-next sends these; deepquill currently ignores them and uses successPath/cancelPath defaults) |
| 17 | `deepquill/lib/ordersStore.cjs` | Deprecate or migrate: Prisma Order is source of truth for fulfillment; JSON store is unused by agnes-next fulfillment routes |
| 18 | `agnes-next/next.config.ts` | Add production domain(s) to `images.remotePatterns` if needed (e.g. `theagnesprotocol.com`) |

### Stripe Dashboard

- Create production webhook endpoint: `https://api.theagnesprotocol.com/api/stripe/webhook`
- Use **live** webhook signing secret for Railway `STRIPE_WEBHOOK_SECRET`
- Switch to live Stripe keys for production

---

## 2. Environment Variables

### Vercel (agnes-next)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon Postgres connection string (see Neon section) |
| `NEXT_PUBLIC_SITE_URL` | Yes | `https://theagnesprotocol.com` |
| `NEXT_PUBLIC_API_BASE_URL` | Yes | `https://api.theagnesprotocol.com` |
| `SITE_URL` | Yes | Same as `NEXT_PUBLIC_SITE_URL` (for server-side) |
| `DEEPQUILL_API_URL` | Yes* | `https://api.theagnesprotocol.com` (for awardReferralCommission; *only if referral commission is called from agnes-next) |
| `DEEPQUILL_API_TOKEN` | Yes* | Shared secret for deepquill API auth |
| `DEEPQUILL_API_BASE` | Yes | Same as `NEXT_PUBLIC_API_BASE_URL` (for refer-friend proxy) |
| `BLOB_READ_WRITE_TOKEN` | If using Blob | For training videos, etc. |
| `NEXT_PUBLIC_EMAIL_ENABLED` | Optional | `true` to enable Mailchimp proxy from track |
| `TRACKER_ENABLED` | Optional | `true` in production to enable /api/track |
| `NEXT_PUBLIC_TERMINAL_URL` | Optional | Deepquill Vite app URL if used |

### Railway (deepquill)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Same Neon Postgres connection string |
| `STRIPE_SECRET_KEY` | Yes | Live key `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Yes | Live webhook signing secret (from Stripe Dashboard) |
| `STRIPE_PRICE_PAPERBACK` | Yes | Live price ID |
| `STRIPE_PRICE_EBOOK` | Yes | Live price ID |
| `STRIPE_PRICE_AUDIO_PREORDER` | Yes | Live price ID |
| `STRIPE_ASSOCIATE_15_COUPON_ID` | Yes | Live coupon ID |
| `SITE_URL` | Yes | `https://theagnesprotocol.com` |
| `NEXT_PUBLIC_SITE_URL` | Optional | Same (for env.cjs fallback) |
| `DEEPQUILL_API_TOKEN` | Yes | Shared secret (must match agnes-next) |
| `MAILCHIMP_TRANSACTIONAL_KEY` | Yes | For purchase confirmation emails |
| `MAILCHIMP_FROM_EMAIL` | Yes | e.g. `no-reply@theagnesprotocol.com` |
| `ORDER_ALERT_EMAIL` | Optional | Admin alert email |
| `FULFILLMENT_TOKEN_SECRET` | Yes | For secure eBook download tokens |
| `EBOOK_FILE_PATH` | Yes | Path to EPUB in Railway (e.g. `/app/assets/ebook/the-agnes-protocol.epub`) |
| `EBOOK_LINK_TTL_DAYS` | Optional | Default 7 |
| `ASSOCIATE_REF_ALLOWLIST` | Optional | Comma-separated codes if not using Prisma |
| `ASSOCIATE_REF_ALLOWLIST_MODE` | Optional | `allowlist` or `any` |
| `NODE_ENV` | Yes | `production` |

### Neon Postgres

- Create project in Neon; obtain connection string.
- Use **pooled** connection string for serverless (Vercel, Railway) if available.
- Format: `postgresql://user:password@host/dbname?sslmode=require`
- Same connection string is used by both agnes-next and deepquill.

---

## 3. Does agnes-next Need DATABASE_URL in Production?

**Yes.** agnes-next requires `DATABASE_URL` in production.

### Justification

agnes-next uses Prisma in many server-side routes:

| Route/Usage | Purpose |
|-------------|---------|
| `/api/track` | `recordPurchase`, `getOrCreateUserId`, `prisma.purchase.upsert`, `prisma.event.create` |
| `/api/contest/score` | `prisma.order.findUnique` |
| `/api/associate/*` | User/associate lookups |
| `/api/points/*` | Ledger, points |
| `/api/fulfillment/*` | `next-for-label`, `print-label`, `to-ship`, `mark-shipped` — all use `prisma.order` |
| `/api/signals/*` | Signal CRUD |
| `/api/reviews/*` | Review CRUD |
| `ensureAssociateMinimal` (create-checkout) | User upsert |
| `getEntryVariant`, `logEntryVariant` | Event/analytics |

Without `DATABASE_URL`, these routes would fail at runtime.

---

## 4. Local URLs, SQLite, JSON Orders, Proxy Assumptions

### Local URLs / ngrok Fallbacks

| File | Line/Pattern | Current Fallback |
|------|--------------|------------------|
| `agnes-next/src/app/share/[platform]/[variant]/layout.tsx` | 9 | `BASE_URL = 'https://agnes-dev.ngrok-free.app'` (hardcoded) |
| `agnes-next/src/app/s/fb/page.tsx` | 12 | `'https://agnes-dev.ngrok-free.app'` |
| `agnes-next/src/app/s/ig/page.tsx` | 13 | `'https://agnes-dev.ngrok-free.app'` |
| `agnes-next/src/app/api/create-checkout-session/route.ts` | 16 | `'https://agnes-dev.ngrok-free.app'` |
| `agnes-next/src/app/api/admin/jobs/send-engaged-reminders/route.ts` | 6 | `'https://agnes-dev.ngrok-free.app'` |
| `agnes-next/src/app/api/admin/jobs/send-missionary-emails/route.ts` | 6 | `'https://agnes-dev.ngrok-free.app'` |
| `agnes-next/src/app/api/admin/jobs/send-no-purchase-reminders/route.ts` | 6 | `'https://agnes-dev.ngrok-free.app'` |
| `agnes-next/src/app/api/admin/jobs/send-non-participant-reminders/route.ts` | 6 | `'https://agnes-dev.ngrok-free.app'` |
| `agnes-next/src/lib/email/associateCommission.ts` | 66 | `'https://agnes-dev.ngrok-free.app'` |
| `agnes-next/src/app/api/track/route.ts` | 13–19 | `ALLOW_ORIGINS` includes localhost/ngrok; CORS fallback `'https://agnes-dev.ngrok-free.app'` |
| `agnes-next/src/app/api/contest/login/route.ts` | 10–14 | localhost/ngrok in allowlist |
| `agnes-next/src/lib/deepquillProxy.ts` | 8 | `'http://localhost:5055'` |
| `agnes-next/src/app/api/refer-friend/route.ts` | 6 | `'http://localhost:5055'` |
| `agnes-next/src/middleware.ts` | 29 | `NEXT_PUBLIC_TERMINAL_URL` fallback `'http://localhost:5173'` |
| `agnes-next/src/app/contest/ContestClient.tsx` | 376 | `NEXT_PUBLIC_TERMINAL_URL` fallback `'http://localhost:5173'` |
| `deepquill/src/config/env.cjs` | 56 | `'https://agnes-dev.ngrok-free.app'` |
| `deepquill/api/create-checkout-session.cjs` | 153 | `'https://agnes-dev.ngrok-free.app'` |
| `deepquill/src/components/EmailModal.jsx` | 35–50 | ngrok detection and fallback |

### SQLite Assumptions

| Location | Assumption |
|----------|------------|
| `agnes-next/prisma/schema.prisma` | `provider = "sqlite"` |
| `deepquill/.env` | `DATABASE_URL="file:C:/dev/agnes-app/deepquill/dev.db"` |
| Prisma migrations | SQLite-specific syntax (e.g. `AUTOINCREMENT`, `DATETIME`) — must be regenerated for Postgres |

### JSON Order Storage

| Location | Behavior |
|----------|----------|
| `deepquill/lib/ordersStore.cjs` | Writes to `data/orders.json`; `createOrderFromStripeSession` |
| `deepquill/server/routes/orders.cjs` | `POST /api/orders/create-from-stripe` — **never called** by stripe-webhook |
| `deepquill/server/routes/adminOrders.cjs` | `getOrderById` from JSON store for label generation |
| `agnes-next` fulfillment routes | Use **Prisma Order** only; no JSON |

**Gap:** Prisma `Order` is never created by any code path. The deepquill webhook has a TODO to create it. The JSON store is populated only if something called `/api/orders/create-from-stripe`, which nothing does.

### Proxy Webhook Behavior

| Current Flow | Target Flow |
|-------------|-------------|
| Stripe → agnes-next `/api/stripe/webhook` → `proxyRaw` → deepquill `/api/stripe/webhook` | Stripe → Railway `https://api.theagnesprotocol.com/api/stripe/webhook` directly |
| agnes-next webhook route can be deprecated or kept as optional fallback | No proxy; deepquill receives webhooks directly |

---

## 5. Stripe Webhook Migration to Railway Direct

### Steps

1. **Stripe Dashboard**
   - Add endpoint: `https://api.theagnesprotocol.com/api/stripe/webhook`
   - Events: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed` (match current handling)
   - Copy the **Signing secret** (starts with `whsec_`)

2. **Railway**
   - Set `STRIPE_WEBHOOK_SECRET` to the new signing secret
   - Ensure deepquill is deployed and `/api/stripe/webhook` is reachable

3. **Verify**
   - Use Stripe CLI: `stripe listen --forward-to https://api.theagnesprotocol.com/api/stripe/webhook`
   - Or send test event from Dashboard

4. **agnes-next**
   - Option A: Remove or disable `/api/stripe/webhook` route (return 410 or redirect)
   - Option B: Keep as fallback but do not register it in Stripe for production

5. **DNS / Railway**
   - Ensure `api.theagnesprotocol.com` points to the Railway service (custom domain in Railway project settings)

---

## 6. Prisma Migration: SQLite → Postgres

### Pre-Migration

1. **Backup SQLite DB**
   ```bash
   cp agnes-next/prisma/dev.db agnes-next/prisma/dev.db.backup
   ```

2. **Update schema**
   - In `agnes-next/prisma/schema.prisma`:
     ```prisma
     datasource db {
       provider = "postgresql"
       url      = env("DATABASE_URL")
     }
     ```

3. **Create Neon database**
   - Create project in Neon; copy connection string

### Migration Options

**Option A: Fresh migration (no data migration)**

```bash
cd agnes-next
DATABASE_URL="postgresql://..." npx prisma migrate dev --name init_postgres
```

This will fail if existing migrations are SQLite-specific. In that case:

1. Delete `prisma/migrations` (or move aside)
2. Run:
   ```bash
   DATABASE_URL="postgresql://..." npx prisma migrate dev --name init_postgres
   ```
   This creates a new migration from the current schema for Postgres.

**Option B: Migrate data from SQLite**

1. Use `prisma db pull` against SQLite to get schema, or keep current schema
2. Create Postgres DB and run migrations
3. Use a data migration tool (e.g. custom script, `pgloader`, or manual export/import) to copy data from SQLite to Postgres

### Post-Migration

1. **Generate client**
   ```bash
   cd agnes-next && npx prisma generate
   ```

2. **Deepquill**
   - Add `@prisma/client` and `prisma` to `deepquill/package.json`
   - Add build step: copy schema and generate from agnes-next, or use `prisma schema path`:
     ```json
     "prisma:generate": "cd ../agnes-next && npx prisma generate"
     ```
   - Ensure `DATABASE_URL` is set in Railway for deepquill

3. **Verify**
   ```bash
   DATABASE_URL="postgresql://..." npx prisma db push  # or migrate deploy
   ```

---

## 7. Launch Test Plan

### 7.1 Checkout

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `/contest` (or catalog) | Page loads |
| 2 | Click "Buy the Book" | Redirects to Stripe Checkout |
| 3 | Complete payment (use test card in test mode) | Redirect to success URL with `session_id` |
| 4 | Verify success URL | `https://theagnesprotocol.com/contest/score?session_id=...` (or thank-you) |

### 7.2 Webhook Processing

| Step | Action | Expected |
|------|--------|----------|
| 1 | Complete a test checkout | Stripe sends `checkout.session.completed` |
| 2 | Check Railway logs | `[WEBHOOK] Event received: checkout.session.completed` |
| 3 | Check email | Purchase confirmation email received |
| 4 | Check Prisma | `Order` (if implemented) and/or `Purchase` exist |

### 7.3 Referrals

| Step | Action | Expected |
|------|--------|----------|
| 1 | Checkout with `?ref=VALIDCODE` | Discount applied |
| 2 | After payment | Referral commission awarded (deepquill webhook calls award-commission or internal logic) |
| 3 | Check DB | `ReferralConversion` record; `User.referralEarningsCents` incremented |

### 7.4 Ledger Updates

| Step | Action | Expected |
|------|--------|----------|
| 1 | Thank-you page fires `PURCHASE_COMPLETED` to `/api/track` | `recordPurchase` runs |
| 2 | Check DB | `Purchase` and `Event` records created |
| 3 | Visit `/contest/score` | Points/ledger reflect purchase |

### 7.5 Email / SMS

| Step | Action | Expected |
|------|--------|----------|
| 1 | Purchase | Mailchimp transactional email sent |
| 2 | Contest signup with email | Mailchimp tag applied (if `NEXT_PUBLIC_EMAIL_ENABLED`) |
| 3 | Refer-friend | Deepquill `/api/refer-friend` invoked successfully |

### 7.6 Order Fulfillment

| Step | Action | Expected |
|------|--------|----------|
| 1 | Admin: `/admin/fulfillment/labels` | Loads next pending order from Prisma |
| 2 | Print label | Order marked `label_printed` |
| 3 | Admin: `/admin/fulfillment/ship` | Orders to ship listed |
| 4 | Mark shipped | `shippedAt` set |

**Note:** Fulfillment depends on Prisma `Order` being created. Currently no code creates it. The deepquill webhook must be extended to create `Order` (and `Customer` if needed) on `checkout.session.completed` before fulfillment will work.

---

## 8. Rollback Plan

### If Production Deployment Fails

1. **Revert Stripe webhook**
   - In Stripe Dashboard, change webhook endpoint back to agnes-next URL (if it was the previous prod endpoint) or disable the new endpoint
   - Restore previous `STRIPE_WEBHOOK_SECRET` if needed

2. **Revert Vercel**
   - Use Vercel dashboard to rollback to previous deployment
   - Or: `vercel rollback` if using CLI

3. **Revert Railway**
   - Use Railway dashboard to rollback to previous deployment
   - Or redeploy from last known-good commit

4. **Database**
   - If Postgres migration was applied and caused issues, restore from Neon backup (if available)
   - If using fresh Postgres with no critical data, no rollback needed for DB

5. **Environment variables**
   - Restore previous values in Vercel and Railway if they were changed

6. **Code**
   - Revert schema change: `provider = "sqlite"` and `DATABASE_URL` to SQLite path
   - Revert any URL/fallback changes
   - Redeploy

### Pre-Rollback Checklist

- [ ] Stripe webhook URL and secret documented
- [ ] Neon backup/snapshot taken before migration
- [ ] Previous Vercel deployment ID noted
- [ ] Previous Railway deployment/revision noted
- [ ] `.env` backups for all services

---

## Appendix: Order Creation Gap

The Prisma `Order` model is used by agnes-next fulfillment routes but **is never created** by any current code. To fix:

1. **In `deepquill/api/stripe-webhook.cjs`**, inside `checkout.session.completed` when `paymentStatus === 'paid'`:
   - Create or upsert `Customer` from `customer_details`/`shipping_details`
   - Create `Order` with `stripeSessionId`, `customerId`, shipping fields, `metadata.ref`, etc.
   - Optionally call internal referral commission logic when `metadata.ref` is present (or `POST /api/referrals/award-commission` to self with `DEEPQUILL_API_TOKEN`)

2. **Deprecate** `deepquill/lib/ordersStore.cjs` and `POST /api/orders/create-from-stripe` once Prisma Order creation is in place.

3. **Deepquill admin label route** (`adminOrders.cjs`) currently uses JSON store. It must be updated to use Prisma `Order` or the fulfillment UI must call agnes-next fulfillment APIs (which already use Prisma).
