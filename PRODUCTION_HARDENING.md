# Production Hardening Summary (Track 2)

## ✅ Implemented

### 1. Admin + Dev Endpoints Dead in Production

**Files Updated:**
- `agnes-next/src/app/api/admin/moderation/approve-all/route.ts`
- `agnes-next/src/app/api/admin/moderation/approve-signal/route.ts`
- `agnes-next/src/app/api/admin/moderation/approve-review/route.ts`
- `agnes-next/src/app/api/debug/prisma/route.ts`

**Behavior:**
- Production: Returns 403/404 unless `x-admin-key` header matches `ADMIN_KEY` env var
- Development: Allows without header (for local testing)
- Debug endpoints return 404 in production (not 403) to hide existence

### 2. Points: Server Truth Only

**Verified:**
- ✅ All point awarding happens server-side:
  - Stripe webhook → `deepquill/api/stripe-webhook.cjs` → `awardPurchaseDailyPoints()`
  - Moderation approval → `deepquill/api/points/award.cjs` → `awardForSignalApproved()` / `awardForReviewApproved()`
- ✅ Client-side code only displays points (optimistic UI updates)
- ✅ Badge page clarified: display-only, not actual awarding

**Files Checked:**
- `agnes-next/src/app/badge/page.tsx` - Display-only (clarified comment)
- `deepquill/lib/points/awardPoints.cjs` - Server-side only
- `deepquill/api/stripe-webhook.cjs` - Server-side only

### 3. Stripe is Only Money Truth

**Verified:**
- ✅ Server maps `product` → `priceId` (no client-provided prices)
- ✅ Webhook verifies payment before awarding points
- ✅ Checkout session creation validates product/price server-side

**Files:**
- `deepquill/api/create-checkout-session.cjs` - Server-side price mapping
- `deepquill/api/stripe-webhook.cjs` - Webhook verifies payment

### 4. Rate Limiting

**Files Created:**
- `agnes-next/src/lib/rateLimit.ts` - Rate limiting utility

**Endpoints Protected:**
- ✅ `/api/contest/login` - 10 requests/minute per IP
- ✅ `/api/track` - 20 requests/minute per IP
- ✅ `/api/refer` - 5 requests/minute per IP, 10/hour per email

**Implementation:**
- In-memory store for dev/testing
- Production should use Redis or proper rate limiting service
- Returns 429 with `Retry-After` header

### 5. Secrets Locked Down

**Verified:**
- ✅ `STRIPE_SECRET_KEY` - Server-side only (`deepquill/src/config/env.cjs`)
- ✅ `STRIPE_WEBHOOK_SECRET` - Server-side only
- ✅ `ADMIN_KEY` - Server-side only
- ✅ Mailchimp keys - Server-side only (in deepquill)

**No Secrets in Frontend:**
- ✅ No `NEXT_PUBLIC_STRIPE_*` vars
- ✅ No `NEXT_PUBLIC_ADMIN_KEY`
- ✅ Only safe public vars like `NEXT_PUBLIC_SITE_URL`

---

## 🔒 Security Checklist

- [x] Admin endpoints blocked in production
- [x] Debug endpoints return 404 in production
- [x] Points awarded server-side only
- [x] Stripe prices validated server-side
- [x] Rate limiting on critical endpoints
- [x] Secrets server-side only
- [x] No client-side point awarding
- [x] Webhook verifies payment before awarding

---

## 📝 Notes

**Rate Limiting:**
- Current implementation uses in-memory store (fine for dev)
- Production should migrate to Redis or Vercel Edge Config
- Rate limits are conservative (can be adjusted)

**Admin Endpoints:**
- In production, must set `ADMIN_KEY` env var
- Requests must include `x-admin-key: <ADMIN_KEY>` header
- Without key, endpoints return 403/404

**Points Security:**
- All point awarding goes through `deepquill/lib/points/awardPoints.cjs`
- Idempotent (unique constraints prevent duplicates)
- Guardrails enforced (daily caps, lifetime caps)
