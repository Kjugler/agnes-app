# Deploy Gate Checklist

**No merging to main until ALL gates pass.**

## Gate A — DB Sanity ✅

### Checklist:
- [ ] `/api/debug/prisma` shows `resolved_path` ending in `deepquill\dev.db`
- [ ] `exists: true`
- [ ] `signal_table_exists: true`
- [ ] `tables` includes `User`, `Signal`, `Review`, `PointAward`

### How to verify:
```bash
curl http://localhost:3000/api/debug/prisma
```

**Expected:**
```json
{
  "database": {
    "resolved_path": "C:\\dev\\agnes-app\\deepquill\\dev.db",
    "exists": true,
    "signal_table_exists": true,
    "tables": ["User", "Signal", "Review", "PointAward", ...]
  }
}
```

---

## Gate B — Golden User Journey ✅

### Checklist:
- [ ] `localhost:5173` → Terminal(s) → Lightning plays → auto-continues → Contest
- [ ] Contest greeting uses known profile name if exists; else guessed from email
- [ ] Catalog → Checkout → Stripe success → Congratulations page loads

### How to verify:
1. **Terminal Flow:**
   - Open `http://localhost:5173`
   - Complete Terminal 1 → Terminal 2
   - Submit email
   - Lightning video plays and auto-forwards

2. **Contest Greeting:**
   - Should show "Welcome back, {Name}" or "Welcome, {GuessedName}"
   - No "Continue as X / Start Fresh" pill

3. **Checkout Flow:**
   - Click "Buy Book" → Stripe checkout opens
   - Complete test purchase → Redirects to thank-you page
   - Thank-you page loads → Auto-redirects to contest

---

## Gate C — Email Triggers ✅

### Checklist:
- [ ] Purchase confirmation email fires
- [ ] Referrer email fires (even if points are capped)
- [ ] "Guardrail" messaging is correct

### How to verify:
1. **Purchase Email:**
   - Make test purchase
   - Check email inbox for purchase confirmation
   - Verify points messaging (awarded or guardrail explanation)

2. **Referrer Email:**
   - Use referral code in checkout
   - Check referrer's email inbox
   - Verify commission email sent (even if points capped)

---

## Gate D — Abuse Prevention Sanity ✅

### Checklist:
- [ ] Approve-all requires admin key (or is dev-only and hard blocked in prod)
- [ ] Debug routes blocked in prod (return 404, not 403)
- [ ] No client-side point awarding
- [ ] Rate limiting on critical endpoints

### How to verify:
1. **Admin Endpoints:**
   ```bash
   # In production mode, should return 403/404
   curl -X POST http://localhost:3000/api/admin/moderation/approve-all
   ```

2. **Debug Routes:**
   ```bash
   # In production mode, should return 404
   curl http://localhost:3000/api/debug/prisma
   ```

3. **Client-Side Points:**
   - Search codebase for `points.*increment` in client components
   - Verify all point awarding happens server-side only

4. **Rate Limiting:**
   - Check `/api/contest/login` has rate limiting
   - Check `/api/track` has rate limiting
   - Check `/api/refer` has rate limiting

---

## Pre-Deploy Commands

Before merging to main:

```bash
# 1. Verify DB vault
cd agnes-next
cat .env.local | grep DATABASE_URL
# Should show: DATABASE_URL="file:C:/dev/agnes-app/deepquill/dev.db"

# 2. Run migrations (if any pending)
npx prisma migrate deploy

# 3. Generate Prisma clients
npx prisma generate
cd ../deepquill
npx prisma generate

# 4. Test checkout
# Visit /checkout?product=paperback
# Should redirect to Stripe successfully
```

---

## Post-Deploy Verification

After deploying:

1. **Production DB:**
   - Verify production DB is separate from dev vault
   - Run migrations on production DB

2. **Admin Endpoints:**
   - Verify `/api/admin/*` returns 403/404 in production
   - Verify `/api/debug/*` returns 404 in production

3. **Stripe:**
   - Verify production Stripe keys are configured
   - Test one real purchase flow
