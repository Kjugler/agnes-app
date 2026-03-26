# Production Smoke Test Checklist

Use this checklist after deploying agnes-next and deepquill to verify deployment readiness.

---

## Pre-Deploy Verification

- [ ] `DATABASE_URL` points to production DB (not `file:./dev.db`)
- [ ] `ADMIN_KEY` set in **both** agnes-next and deepquill (identical value)
- [ ] `NEXT_PUBLIC_API_BASE_URL` = deepquill production URL (e.g. `https://deepquill.railway.app`)
- [ ] `DEEPQUILL_URL` = same as above (for agnes-next server-side fetches)
- [ ] `NEXT_PUBLIC_SITE_URL` = agnes-next production URL (e.g. `https://agnes.example.com`)
- [ ] `STRIPE_WEBHOOK_SECRET` = production webhook signing secret
- [ ] Stripe Dashboard webhook endpoint = `https://your-domain.com/api/stripe/webhook`

---

## Post-Deploy Smoke Tests

### 1. Homepage & Core Navigation
- [ ] Homepage loads without 503/500
- [ ] Navigation between main pages works (contest, catalog, score)

### 2. Contest Flow
- [ ] Contest entry: Submit email → no CORS error
- [ ] Redirect after entry works
- [ ] Contest score page loads (no 503 from points/me)
- [ ] Score displays correctly (or zeros if new user)

### 3. Checkout Flow
- [ ] Create checkout session: Redirects to Stripe successfully
- [ ] (Optional) Complete test purchase with Stripe test card
- [ ] Post-purchase redirect back to score/thank-you
- [ ] (If webhook configured) Points appear after short delay

### 4. Security
- [ ] `POST /api/admin/moderation/approve-all` without `x-admin-key`: returns 403
- [ ] `GET /api/debug/prisma`: returns 404 (not 403)

### 5. Deepquill Connectivity
- [ ] Agnès-next proxy routes return 200 or expected errors (not 503)
- [ ] Deepquill health (if you have `/ping` or similar): responds

---

## Fail-Fast Checks

If any of these fail, investigate before further testing:

| Check | Expected | If fails |
|-------|----------|----------|
| Homepage | 200 | Check build, env vars |
| Contest score | 200, JSON with totalPoints | Check NEXT_PUBLIC_API_BASE_URL, deepquill up |
| Create checkout | Redirect to Stripe | Check STRIPE_* in deepquill |
