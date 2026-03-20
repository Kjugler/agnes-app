# Post-Purchase Beta Caps Implementation

## Uniqueness Confirmations

| Model | Unique Key | Scope |
|-------|------------|-------|
| **Purchase** | `sessionId` (schema: `@unique`) | Per Stripe Checkout Session ID (`cs_xxx`) |
| **ReferralConversion** | `stripeSessionId` (schema: `@unique`) | Per Stripe Checkout Session ID (`cs_xxx`) |
| **Order** | `stripeSessionId` (schema: `@unique`) | Per Stripe Checkout Session ID (`cs_xxx`) |

**Fulfillment visibility**: Order and Purchase are created in steps 3–4, before any point-award logic. When caps block points, Order/Purchase still exist. Fulfillment routes (`/api/fulfillment/next-for-label`, etc.) query `prisma.order` and are unaffected by caps.

---

## Summary

| Mode | Buyer | Associate Publisher |
|------|-------|---------------------|
| **Beta** (`POST_PURCHASE_BETA=true`) | Max 500 PURCHASE_BOOK points/day | Max 25,000 REFER_PURCHASE points/day; commission ($2) always |
| **Production** | 500 points per qualifying purchase | 5,000 points + $2 commission per qualifying purchase |

## Files Modified

| File | Changes |
|------|---------|
| `deepquill/src/config/env.cjs` | Added `POST_PURCHASE_BETA` (true when `POST_PURCHASE_BETA=true`) |
| `deepquill/lib/postPurchaseSync.cjs` | Beta/prod branching; ledger-based daily checks; commission always awarded |

## Exact Queries for Daily Totals

### Buyer (PURCHASE_BOOK)

```javascript
// getBuyerDailyPurchaseBookTotal(prismaClient, userId)
const startOfToday = getStartOfTodayUTC();  // 00:00:00.000 UTC
const result = await prismaClient.ledger.aggregate({
  where: {
    userId,
    type: 'PURCHASE_BOOK',
    createdAt: { gte: startOfToday },
  },
  _sum: { points: true },
});
return result._sum.points ?? 0;
```

**Beta guard**: `shouldAwardBuyer = dailyTotal < 500`

### Referrer (REFER_PURCHASE)

```javascript
// getReferrerDailyReferPurchaseTotal(prismaClient, userId)
const startOfToday = getStartOfTodayUTC();  // 00:00:00.000 UTC
const result = await prismaClient.ledger.aggregate({
  where: {
    userId,
    type: 'REFER_PURCHASE',
    createdAt: { gte: startOfToday },
  },
  _sum: { points: true },
});
return result._sum.points ?? 0;
```

**Beta guard**: `shouldAwardReferrerPoints = dailyTotal + 5000 <= 25000`

## Timezone

- **Timezone**: UTC
- **Start of day**: `new Date(); d.setUTCHours(0, 0, 0, 0);`
- Day boundaries reset at 00:00:00.000 UTC each day.

## Idempotency

| Check | Mechanism |
|-------|-----------|
| Buyer | Only consider award when `purchaseWasNew` (Purchase did not exist before upsert) |
| Referrer | `ReferralConversion.findUnique({ stripeSessionId })` — if exists, skip entirely |
| Order/Purchase | Unchanged; creation is independent of point caps |

## Logic Flow

1. **Order/Purchase/Customer/User**: Created/updated regardless of caps.
2. **Commission**: Always awarded when referral is valid (beta and prod).
3. **Buyer points**: Awarded only when:
   - `purchaseWasNew` (idempotency), and
   - Beta: `dailyTotal < 500`; Prod: always.
4. **Referrer points**: Awarded only when:
   - No existing ReferralConversion (idempotency), and
   - Beta: `dailyTotal + 5000 <= 25000`; Prod: always.
5. **Commission**: Always created with ReferralConversion; always increments `referralEarningsCents`.

## Environment Variable

```
POST_PURCHASE_BETA=true   # Enable beta caps
```

---

## Local Validation Checklist

### Prerequisites

- agnes-next + deepquill running locally
- Stripe test mode; webhook pointing to deepquill (or ngrok)
- Test user with valid referral code (e.g. `TESTREF`) in User table
- SQLite DB shared by both apps (`DATABASE_URL` in deepquill = agnes-next DB path)

### Recommended run order

1. **Test 6** (duplicate webhook) – quick idempotency check
2. **Test 5** (commission always) – quick commission check
3. **Test 1** (buyer beta cap) – then **Test 2** (buyer prod) – toggle `POST_PURCHASE_BETA`, restart
4. **Test 3** (referrer beta cap) – then **Test 4** (referrer prod)
5. **Test 7** (fulfillment when capped) – reuse capped state from 1 and 3

### Quick DB Queries (run after each test)

```sql
-- Check Ledger
SELECT userId, type, points, createdAt FROM Ledger WHERE type IN ('PURCHASE_BOOK','REFER_PURCHASE') ORDER BY createdAt DESC LIMIT 20;

-- Check ReferralConversion
SELECT referralCode, stripeSessionId, commissionCents, createdAt FROM ReferralConversion ORDER BY createdAt DESC LIMIT 10;

-- Check Order
SELECT id, stripeSessionId, pointsAwarded, commissionCents FROM Order ORDER BY createdAt DESC LIMIT 5;

-- Check Purchase
SELECT sessionId, userId, amount FROM Purchase ORDER BY createdAt DESC LIMIT 5;
```

---

### 1. Buyer 500/day cap (beta)

**Setup**: `POST_PURCHASE_BETA=true` in deepquill `.env`
**Restart**: deepquill server after env change

| Step | Action | Expected |
|------|--------|----------|
| 1 | Checkout #1 (no ref), complete payment | Order + Purchase created; 1 Ledger PURCHASE_BOOK (+500); User.points += 500 |
| 2 | Checkout #2 (same email, no ref), complete payment | Order + Purchase created; 0 new Ledger PURCHASE_BOOK; User.points unchanged |
| 3 | Query Ledger for buyer | Exactly 1 PURCHASE_BOOK row today |
| 4 | Query Order | Both orders exist; Order #1 `pointsAwarded: true`, Order #2 `pointsAwarded: false` (capped) |

---

### 2. Buyer 500 per purchase (prod)

**Setup**: `POST_PURCHASE_BETA=false` or remove from deepquill `.env`
**Restart**: deepquill server

| Step | Action | Expected |
|------|--------|----------|
| 1 | Checkout #1 (no ref), complete payment | Order + Purchase; 1 Ledger PURCHASE_BOOK (+500) |
| 2 | Checkout #2 (same email, no ref), complete payment | Order + Purchase; 1 more Ledger PURCHASE_BOOK (+500); User.points += 1000 total |
| 3 | Query Ledger for buyer | 2 PURCHASE_BOOK rows |

---

### 3. Associate publisher 25,000/day cap (beta)

**Setup**: `POST_PURCHASE_BETA=true`; referrer user with `referralCode=TESTREF`
**Note**: 5 qualifying purchases × 5,000 = 25,000 (at cap)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Checkout #1 with `?ref=TESTREF`, complete | ReferralConversion; Ledger REFER_PURCHASE (+5,000); referralEarningsCents += 200 |
| 2 | Checkout #2 (different buyer) with `?ref=TESTREF` | ReferralConversion; Ledger REFER_PURCHASE (+5,000); total 10,000 |
| 3 | Checkout #3–5 with `?ref=TESTREF` | Same pattern; after 5th: 25,000 total |
| 4 | Checkout #6 with `?ref=TESTREF` | ReferralConversion + commission (200); NO Ledger REFER_PURCHASE; referralEarningsCents += 200 |
| 5 | Query Ledger for referrer | 5 REFER_PURCHASE rows today; total 25,000 |
| 6 | Query ReferralConversion | 6 rows; all have commissionCents 200 |

---

### 4. Associate publisher 5,000 per purchase (prod)

**Setup**: `POST_PURCHASE_BETA=false`

| Step | Action | Expected |
|------|--------|----------|
| 1 | Checkout #1 with `?ref=TESTREF` | ReferralConversion; Ledger REFER_PURCHASE (+5,000); commission 200 |
| 2 | Checkout #2 (different buyer) with `?ref=TESTREF` | ReferralConversion; Ledger REFER_PURCHASE (+5,000); commission 200 |
| 3 | Query Ledger for referrer | 2+ REFER_PURCHASE rows today; no cap |

---

### 5. Commission always applies per qualifying purchase

**Setup**: Beta or prod

| Step | Action | Expected |
|------|--------|----------|
| 1 | Checkout with valid `?ref=TESTREF` | ReferralConversion created with commissionCents=200 |
| 2 | In beta, 6th checkout with same ref (after 25k cap) | ReferralConversion created; commissionCents=200; NO Ledger REFER_PURCHASE; User.referralEarningsCents += 200 |

---

### 6. Duplicate webhook replay does not double-award

**Setup**: Beta or prod; one completed checkout

| Step | Action | Expected |
|------|--------|----------|
| 1 | Complete checkout, note session_id | Order, Purchase, Ledger, ReferralConversion created |
| 2 | Replay same webhook: Stripe Dashboard → Developers → Events → select `checkout.session.completed` → Resend; or CLI: `stripe events resend evt_xxx` (event ID from Dashboard) | No new Ledger rows; no new ReferralConversion; User.points unchanged; ReferralConversion unique on stripeSessionId prevents duplicate |
| 3 | Query Ledger | Same count as before replay |
| 4 | Query ReferralConversion | Same count as before replay |

---

### 7. Order/Purchase creation when caps block points

**Setup**: Beta; buyer already at 500 cap today

| Step | Action | Expected |
|------|--------|----------|
| 1 | Second checkout (same buyer, same day) | Order created; Purchase created |
| 2 | No new Ledger PURCHASE_BOOK | Buyer points unchanged |
| 3 | Visit `/admin/fulfillment/labels` or `/api/fulfillment/next-for-label` | Order visible; can print label |

**Setup**: Beta; referrer at 25k cap today

| Step | Action | Expected |
|------|--------|----------|
| 1 | 6th checkout with same ref (after cap) | Order created; Purchase created; ReferralConversion + commission |
| 2 | No new Ledger REFER_PURCHASE | Referrer points unchanged |
| 3 | Visit fulfillment routes | Order visible |

---

### Confirmation Summary

| Assertion | Verification |
|-----------|--------------|
| Purchase uniqueness per Stripe session | `Purchase.sessionId` is `@unique`; upsert by sessionId |
| ReferralConversion uniqueness per Stripe session | `ReferralConversion.stripeSessionId` is `@unique`; guarded create |
| Capped awards do not block fulfillment | Order/Purchase created before point logic; fulfillment routes use Order only |
