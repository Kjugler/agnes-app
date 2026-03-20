# Post-Purchase Reconciliation Implementation Plan

---

## 1. Canonical Post-Purchase Model

| Model | Purpose | Written By |
|-------|---------|------------|
| **User** | Buyer (and referrer). `earnedPurchaseBook`, `points`, `referralEarningsCents`. | Webhook |
| **Customer** | Billing/shipping identity. Links to Order. | Webhook |
| **Order** | Fulfillment, session-based score. `stripeSessionId`, `contestPlayerId`, `referralCode`, `pointsAwarded`. | Webhook |
| **Purchase** | Purchase record for points/ledger. `sessionId` unique. | Webhook |
| **Event** | `PURCHASE_COMPLETED` for analytics. | Webhook |
| **Ledger** | `PURCHASE_BOOK` (buyer +500), `REFER_PURCHASE` (referrer +5,000). | Webhook |
| **ReferralConversion** | Commission tracking. `stripeSessionId` unique. | Webhook |

---

## 2. Unique Keys / Uniqueness Strategy

| Model | Unique Key | Strategy |
|-------|------------|----------|
| **Order** | `stripeSessionId` | Guarded create: create only if `findUnique({ stripeSessionId })` returns null |
| **Purchase** | `sessionId` | Upsert by `sessionId` |
| **ReferralConversion** | `stripeSessionId` | Guarded create: create only if `findUnique({ stripeSessionId })` returns null |
| **Buyer Ledger (PURCHASE_BOOK)** | Guard by `User.earnedPurchaseBook` | Create only if `!user.earnedPurchaseBook` |
| **Referrer Ledger (REFER_PURCHASE)** | Guard by ReferralConversion | Create only when creating ReferralConversion |

---

## 3. User ↔ Customer Relationship

| Aspect | Rule |
|--------|------|
| **Keys** | User: `email` unique. Customer: `email` unique. No FK between them. |
| **Linking** | Order → Customer via `customerId`. Score links User via `contestPlayerId` or `customer.email` → User. |
| **Guest checkout** | Stripe collects email. Fallback: `unknown+{sessionId}@checkout.agnes` if absent. |
| **Repeated purchases** | Same email → same Customer/User (upsert). New session → new Order, new Purchase. |

---

## 4. Exact Write Sequence (Webhook)

```
session → Customer (upsert) → User (upsert) → Purchase (upsert) → Order (guarded create)
  → Ledger PURCHASE_BOOK (guarded) → ReferralConversion + Ledger REFER_PURCHASE (guarded)
  → Event (guarded: only if Purchase was newly created)
```

| Step | Operation | Idempotency |
|------|-----------|-------------|
| Customer | Upsert | `upsert({ where: { email } })` |
| User | Upsert | `upsert({ where: { email } })` |
| Purchase | Upsert | `upsert({ where: { sessionId } })` |
| Order | Guarded create | `findUnique` → if null, `create` |
| Ledger PURCHASE_BOOK | Guarded create | `!user.earnedPurchaseBook` → create Ledger, update User, set Order.pointsAwarded |
| ReferralConversion | Guarded create | `findUnique({ stripeSessionId })` → if null and ref valid, create |
| Ledger REFER_PURCHASE | Guarded create | Only when creating ReferralConversion |
| Event | Guarded create | Only if Purchase did not exist before upsert |

---

## 5. /api/track PURCHASE_COMPLETED

| Keep | Remove |
|------|--------|
| Accept request, return 200 | `recordPurchase` (User, Purchase, Event writes) |
| CORS headers | |
| `if (DEV) console.log` | |
| Mailchimp proxy when `email` present | |

**UI preserved**: Thank-you sets `localStorage` client-side. Track only needs to return 200 so sendBeacon succeeds.

---

## 6. New Module: `deepquill/lib/postPurchaseSync.cjs`

`syncPostPurchase(session)` — per-model idempotent, no global early-exit.

**Session mapping** (Stripe `checkout.session.completed`):
- Email: `session.customer_details?.email || session.customer_email`
- Name: `session.customer_details?.name || session.shipping_details?.name`
- Address: `session.shipping_details?.address || session.customer_details?.address` → map to `line1`, `line2`, `city`, `state`, `postal_code`, `country`
- Metadata: `session.metadata?.ref`, `session.metadata?.ref_valid`, `session.metadata?.contestPlayerId`

**Logic** (per-model idempotent; no global early-exit):
1. **Transaction**:
   - Upsert `Customer` by email
   - Upsert `User` by email (buyer)
   - Upsert `Purchase` by sessionId (check if existed before for Event guard)
   - Guarded create `Order` if !exists by stripeSessionId
   - Guarded create `Ledger` PURCHASE_BOOK + update User if !user.earnedPurchaseBook; set Order.pointsAwarded
   - Guarded create `ReferralConversion` + `Ledger` REFER_PURCHASE if ref valid and !exists by stripeSessionId
   - Guarded create `Event` only if Purchase was newly created
2. Return `{ ok: true }`

### Webhook integration

In `deepquill/api/stripe-webhook.cjs`, inside `checkout.session.completed` when `paymentStatus === 'paid'`:

- After email send and eBook fulfillment logging, call `syncPostPurchase(session)`.
- Keep existing email and fulfillment logic; add sync before `break`.

---

## 7. Point-Award Logic

| Responsibility | Location | Rationale |
|----------------|----------|-----------|
| **Canonical write** | Webhook only | Stripe is source of truth; webhook has full session (email, shipping, metadata). Single writer avoids races and duplicates. |
| **Thank-you track** | No DB writes for PURCHASE_COMPLETED | Remove `recordPurchase` for this event. Thank-you has no email; webhook has it. Avoids duplicate/incorrect User and Purchase. |
| **Mailchimp** | Thank-you → track → proxy (if email present) | Thank-you has no email; Mailchimp tagging for PURCHASE_COMPLETED happens via other flows (e.g. post-checkout emails). No change. |

**Division**: Webhook = all post-purchase DB writes. Thank-you = no persistence for PURCHASE_COMPLETED.

---

## 4. Idempotent Design

| Check | Mechanism |
|-------|------------|
| Order already processed | `Order.findUnique({ stripeSessionId })` at start; return immediately if exists |
| Purchase | `Purchase.upsert({ where: { sessionId } })` |
| ReferralConversion | `ReferralConversion.findUnique({ stripeSessionId })` before create; unique constraint as backup |
| Buyer points | Only when creating new Order; `Order.pointsAwarded` prevents re-award |
| Referrer points | Gated by ReferralConversion create; unique `stripeSessionId` prevents duplicates |

Duplicate webhook deliveries: first run creates Order; subsequent runs hit early exit.  
Duplicate thank-you calls: no DB writes, so no double-award.

---

## 5. Point-Award Logic

| Recipient | Points | Ledger Type | Condition |
|-----------|--------|-------------|-----------|
| Buyer | 500 | `PURCHASE_BOOK` | Every paid checkout |
| Referrer (discount-code owner) | 5,000 | `REFER_PURCHASE` | `metadata.ref` present and `metadata.ref_valid === 'true'` |

**Ledger entries**:
- Buyer: `{ userId, type: 'PURCHASE_BOOK', points: 500, note: 'checkout bonus' }`
- Referrer: `{ userId: referrerId, type: 'REFER_PURCHASE', points: 5000, note: 'referral purchase bonus' }`

**Commission** (unchanged): `ReferralConversion` + `User.referralEarningsCents` (+200 cents when ref used). Inline in `postPurchaseSync` (same logic as `award-referral-commission`).

---

## 6. Files and Functions to Change

| File | Change |
|------|--------|
| **NEW** `deepquill/lib/postPurchaseSync.cjs` | Implement `syncPostPurchase(session)` |
| `deepquill/api/stripe-webhook.cjs` | Call `syncPostPurchase(session)` after email/fulfillment, before `break` |
| `deepquill/package.json` | Add `@prisma/client`; add `prisma:generate` script pointing at agnes-next schema |
| `agnes-next/src/app/api/track/route.ts` | In `PURCHASE_COMPLETED` branch: remove `recordPurchase` call; keep Mailchimp proxy if email present (it won’t be for thank-you) |

**Optional** (contestPlayerId in metadata):
- `deepquill/api/create-checkout-session.cjs` | Ensure `metadata.contestPlayerId = req.body?.metadata?.contestPlayerId` (already passed from agnes-next)

---

## 7. Implementation Order

| Step | Task |
|------|------|
| **First** | Add `deepquill/lib/postPurchaseSync.cjs` with full sync logic (Customer, Order, User, Purchase, Event, Ledger, ReferralConversion). Add Prisma to deepquill. |
| **Second** | Call `syncPostPurchase(session)` from `stripe-webhook.cjs` in `checkout.session.completed` when `paymentStatus === 'paid'`. |
| **Third** | Remove `recordPurchase` for `PURCHASE_COMPLETED` in `agnes-next/src/app/api/track/route.ts`. |

---

## 8. Test Plan

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 1 | Checkout works | Start checkout → pay with test card → redirect | Redirect to thank-you with `session_id` |
| 2 | Emails send | Complete checkout | Purchase confirmation email received |
| 3 | Points correct | Checkout without ref | Buyer: +500, `earnedPurchaseBook` true |
| 4 | Referrer points | Checkout with valid `?ref=CODE` | Referrer: +5,000, ReferralConversion, commissionCents |
| 5 | Order created | After checkout | `Order` exists with `stripeSessionId`, shipping, `pointsAwarded` true |
| 6 | Fulfillment sees order | Visit `/admin/fulfillment/labels` | Next order is the new Order |
| 7 | Session-based score | Visit `/contest/score?session_id=cs_xxx` | Score shows purchase points, non-zero total |
| 8 | No double-award | Replay webhook (Stripe CLI) or reload thank-you | Single Order, single Ledger PURCHASE_BOOK, single ReferralConversion |

**Verification queries** (after test checkout):
```sql
SELECT * FROM Order WHERE stripeSessionId = 'cs_test_...';
SELECT * FROM Purchase WHERE sessionId = 'cs_test_...';
SELECT * FROM Ledger WHERE type IN ('PURCHASE_BOOK','REFER_PURCHASE') ORDER BY createdAt DESC LIMIT 5;
SELECT * FROM ReferralConversion ORDER BY createdAt DESC LIMIT 1;
```
