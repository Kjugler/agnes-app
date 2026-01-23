# Track 1 & Track 2 Implementation Summary

## Track 1 — Stop Dev Drift ✅

### A) Single DB Vault

**Canonical DB:** `C:\dev\agnes-app\deepquill\dev.db`

**Configuration:**
- `agnes-next/.env.local`: `DATABASE_URL="file:C:/dev/agnes-app/deepquill/dev.db"`
- `deepquill/.env`: `DATABASE_URL="file:./dev.db"`

**See:** `VAULT_DB_SETUP.md` for complete setup instructions

### B) One Migrator Only

- ✅ Only `agnes-next` runs migrations: `npx prisma migrate dev`
- ✅ `deepquill` only generates: `npx prisma generate`
- ✅ No migrations run from deepquill

### C) Ban DB Copying

- ✅ No `dev-next.db` creation
- ✅ No DB copying scripts
- ✅ Single vault DB enforced

### D) Branch Discipline

- ✅ `main` = deployable
- ✅ `wip/*` = experiments
- ✅ `fix/*` = scoped fixes
- ✅ Deploy Gate checklist before merging to main

---

## Track 2 — Harden for Public ✅

### 1) Admin + Dev Endpoints Dead in Production

**Updated Files:**
- `agnes-next/src/app/api/admin/moderation/approve-all/route.ts`
- `agnes-next/src/app/api/admin/moderation/approve-signal/route.ts`
- `agnes-next/src/app/api/admin/moderation/approve-review/route.ts`
- `agnes-next/src/app/api/debug/prisma/route.ts`

**Behavior:**
- Production: Hard block (403/404) unless `x-admin-key` header matches `ADMIN_KEY`
- Development: Allow without header
- Debug endpoints return 404 (not 403) to hide existence

### 2) Points: Server Truth Only

**Verified:**
- ✅ All point awarding server-side:
  - Stripe webhook → `deepquill/api/stripe-webhook.cjs`
  - Moderation → `deepquill/api/points/award.cjs`
- ✅ Client only displays points (optimistic UI)
- ✅ Badge page clarified: display-only

### 3) Stripe is Only Money Truth

**Verified:**
- ✅ Server maps `product` → `priceId` (no client prices)
- ✅ Webhook verifies payment before awarding
- ✅ Checkout validates product/price server-side

### 4) Rate Limiting

**Created:** `agnes-next/src/lib/rateLimit.ts`

**Protected Endpoints:**
- ✅ `/api/contest/login` - 10 req/min per IP
- ✅ `/api/track` - 20 req/min per IP
- ✅ `/api/refer` - 5 req/min per IP, 10/hour per email

**Implementation:**
- In-memory store (dev/testing)
- Returns 429 with `Retry-After` header
- Production should use Redis/Vercel Edge Config

### 5) Lock Down Secrets

**Verified:**
- ✅ `STRIPE_SECRET_KEY` - Server-side only
- ✅ `STRIPE_WEBHOOK_SECRET` - Server-side only
- ✅ `ADMIN_KEY` - Server-side only
- ✅ Mailchimp keys - Server-side only
- ✅ No `NEXT_PUBLIC_*` secrets

---

## Deploy Gate Checklist

**See:** `DEPLOY_GATE_CHECKLIST.md` for full checklist

### Gate A — DB Sanity
- [ ] `/api/debug/prisma` shows `deepquill\dev.db`
- [ ] `signal_table_exists: true`
- [ ] Tables include `User`, `Signal`, `Review`, `PointAward`

### Gate B — Golden User Journey
- [ ] Terminal → Lightning → Contest flow works
- [ ] Contest greeting shows correct name
- [ ] Checkout → Stripe → Thank-you works

### Gate C — Email Triggers
- [ ] Purchase confirmation email fires
- [ ] Referrer email fires (even if points capped)
- [ ] Guardrail messaging correct

### Gate D — Abuse Prevention
- [ ] Approve-all blocked in prod (or requires admin key)
- [ ] Debug routes return 404 in prod
- [ ] Rate limiting active
- [ ] No client-side point awarding

---

## Files Created/Updated

### Created:
- `VAULT_DB_SETUP.md` - Single DB vault setup guide
- `DEPLOY_GATE_CHECKLIST.md` - Pre-deploy verification checklist
- `PRODUCTION_HARDENING.md` - Security hardening details
- `TRACK_1_TRACK_2_SUMMARY.md` - This file
- `agnes-next/src/lib/rateLimit.ts` - Rate limiting utility

### Updated:
- `agnes-next/src/app/api/admin/moderation/*` - Production guards
- `agnes-next/src/app/api/debug/prisma/route.ts` - Returns 404 in prod
- `agnes-next/src/app/api/contest/login/route.ts` - Rate limiting
- `agnes-next/src/app/api/track/route.ts` - Rate limiting
- `agnes-next/src/app/api/refer/route.ts` - Rate limiting
- `agnes-next/src/app/badge/page.tsx` - Clarified display-only points

---

## Next Steps

1. **Set up DB vault:**
   - Update `agnes-next/.env.local` to point to `deepquill/dev.db`
   - Run migrations from `agnes-next` only

2. **Test Deploy Gate:**
   - Run through `DEPLOY_GATE_CHECKLIST.md`
   - Verify all gates pass

3. **Production Setup:**
   - Set `ADMIN_KEY` env var in production
   - Configure rate limiting (Redis/Vercel Edge Config)
   - Verify all admin endpoints blocked

4. **Merge to main:**
   - Only after all Deploy Gates pass
   - Use `fix/*` or `wip/*` branches until ready
