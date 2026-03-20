# Webhook Baseline Analysis

**Purpose:** Preserve current state, then compare commit `e8ae7b6` (deploy baseline) with current branch to determine what each provides and whether the old baseline is sufficient for beta testing.

---

## 1. Best Commit/Branch Point to Preserve Current State

**Current HEAD:** `6e19fb4` (Merge training-videos: external URLs, Blob upload script, ngrok cleanup)

**Problem:** The current working state includes **uncommitted changes** that contain the webhook/post-purchase/beta-cap work:

- `deepquill/lib/postPurchaseSync.cjs` (untracked)
- `deepquill/api/stripe-webhook.cjs` (modified — calls syncPostPurchase)
- `deepquill/src/config/env.cjs` (modified — POST_PURCHASE_BETA)
- `agnes-next/src/app/api/track/route.ts` (modified — no PURCHASE_COMPLETED writes)
- `agnes-next/src/middleware.ts` (modified — root → lightening)
- Plus ~25 other modified files

**Recommendation:** Commit all current work first, then create the branch and tag from that new commit. This is the only way to preserve the full working state including post-purchase reconciliation and beta caps.

**Best commit point:** The new commit created after staging and committing all current changes.

---

## 2. Exact Git Commands

### Step 1: Preserve current state (commit everything)

```powershell
cd c:\dev\agnes-app

# Stage all changes (modified, deleted, untracked)
git add -A

# Verify what will be committed
git status

# Commit with descriptive message
git commit -m "webhook-complete: post-purchase sync, beta caps, lightening baseline

- deepquill: postPurchaseSync.cjs (Customer, User, Purchase, Order, Ledger, ReferralConversion, Event)
- deepquill: stripe-webhook calls syncPostPurchase after email/fulfillment
- Beta caps: buyer 500/day, referrer 25k/day (POST_PURCHASE_BETA)
- agnes-next: track route no longer writes PURCHASE_COMPLETED (webhook canonical)
- Middleware: root/start/entry → lightening
- Preserves Stripe reconciliation, fulfillment visibility, score updates"
```

### Step 2: Create branch and tag

```powershell
# Create branch from the new commit (current HEAD after commit)
git branch webhook-complete-2026-03-19

# Create tag on the same commit
git tag webhook-complete-2026-03-19

# Verify
git log -1 --oneline
git branch -v | Select-String "webhook-complete"
git tag -l "webhook-complete*"
```

### Alternative: If you prefer NOT to commit (preserve via stash)

```powershell
# Stash all changes (including untracked)
git stash push -u -m "webhook-complete work 2026-03-19"

# Create branch and tag from current HEAD (6e19fb4) — does NOT include stashed work
git branch webhook-complete-2026-03-19
git tag webhook-complete-2026-03-19

# Later: restore with git stash pop
```

**Recommendation:** Use the commit approach. Stash is fragile and easy to lose; a committed branch/tag is permanent.

---

## 3. Analysis of Commit e8ae7b6 (Deploy Baseline)

### 3.1 What e8ae7b6 Includes

| Capability | Present? | Details |
|------------|----------|---------|
| **Stripe checkout** | ✅ Yes | create-checkout-session, Stripe SDK in deepquill |
| **Webhook processing** | ✅ Yes | deepquill stripe-webhook.cjs, agnes-next proxies to it |
| **Webhook signature verification** | ✅ Yes | stripe.webhooks.constructEvent |
| **Purchase points (500)** | ✅ Yes | awardPurchaseDailyPoints, Ledger POINTS_AWARDED_PURCHASE, daily cap 1/user/day |
| **Referral/associate publisher points** | ✅ Yes | awardReferralSponsorPoints (5,000 pts) |
| **Commission ($2)** | ✅ Yes | processReferralCommission, referralEarningsCents |
| **Purchase creation** | ✅ Yes | prisma.purchase.create/update, sessionId unique |
| **Customer creation** | ✅ Yes | prisma.customer.upsert |
| **Ledger writes** | ✅ Yes | POINTS_AWARDED_PURCHASE, REFER_*, FULFILLMENT_*, EMAIL_* |
| **Event writes** | ⚠️ Unclear | Event model exists; webhook may not create PURCHASE_COMPLETED |
| **ReferralConversion** | ✅ Yes | Created in processReferralCommission |
| **Order creation** | ❌ No | **Prisma Order is never created.** Webhook creates Purchase, Customer. Order model exists in schema but no code path creates it. |
| **Fulfillment visibility** | ❌ Broken | `/api/fulfillment/next-for-label` queries `prisma.order.findFirst`. Since Order is never created, it always returns null. Fulfillment UI shows no orders. |
| **Score updates** | ✅ Yes | getPointsRollupForUser, Purchase lookup by session_id; score API reads Ledger + Purchase |
| **Purchase confirmation email** | ✅ Yes | buildPurchaseConfirmationEmail, Mailchimp |
| **Referrer commission email** | ✅ Yes | buildReferrerCommissionEmail |
| **logFulfillment** | ✅ Yes | Fulfillment obligations logged to Ledger (FULFILLMENT_PAPERBACK_SHIP, etc.) |

### 3.2 e8ae7b6 Schema vs Implementation

- **Ledger:** Uses `POINTS_AWARDED_PURCHASE`, `sessionId`, `uniq_ledger_type_session_user`. Different from current schema (PURCHASE_BOOK, no sessionId).
- **Order:** Schema has Order model with Customer FK, shipping fields. **No code creates it.** The `ordersStore.cjs` writes to JSON file (`data/orders.json`), and `POST /api/orders/create-from-stripe` is **never called** by the webhook.
- **Fulfillment routes:** Use `prisma.order` (Prisma Order table). That table is empty. Deepquill `adminOrders` uses `getOrderById` from ordersStore (JSON) — a different Order source. Agnes-next fulfillment uses Prisma Order.

### 3.3 e8ae7b6 Idempotency

- Purchase: `findUnique` by sessionId before create
- Points: Ledger unique constraint `uniq_ledger_type_session_user` (sessionId, type, userId)
- Referral: Logic in processReferralCommission
- **Gap:** Duplicate webhook replay could create duplicate Customer/Purchase if not fully guarded. Ledger has unique constraint for points.

---

## 4. What Current Branch Adds Beyond e8ae7b6

| Addition | Description |
|----------|-------------|
| **Order creation** | postPurchaseSync creates Prisma Order (guarded by stripeSessionId). Fulfillment routes now return real orders. |
| **Single canonical writer** | All post-purchase writes (Customer, User, Purchase, Order, Ledger, ReferralConversion, Event) in one sync function. No split between webhook and other paths. |
| **Idempotent per-model** | Purchase upsert by sessionId; Order guarded create; ReferralConversion guarded by stripeSessionId; Ledger PURCHASE_BOOK only when purchaseWasNew. |
| **Beta caps** | POST_PURCHASE_BETA: buyer 500/day, referrer 25k/day. UTC-based daily totals from Ledger. |
| **Prod point amounts** | 500 buyer, 5,000 referrer per purchase (e8ae7b6 had same amounts but different Ledger types). |
| **track route cleanup** | PURCHASE_COMPLETED no longer writes to DB; webhook is canonical. Prevents double-award. |
| **Order.pointsAwarded** | Correctly false when caps block (e8ae7b6 had different model). |
| **Lightening middleware** | Root → lightening (current has this; e8ae7b6 had it too but main diverged). |

---

## 5. Concrete Comparison

### e8ae7b6 Already Does Correctly

- Stripe checkout flow
- Webhook receipt and signature verification
- Purchase creation (Prisma)
- Customer creation (Prisma)
- Purchase points (500, daily cap)
- Referral points (5,000)
- Commission ($2)
- ReferralConversion creation
- Purchase confirmation email
- Referrer commission email
- Score API (reads Ledger, Purchase)
- Fulfillment Ledger entries (FULFILLMENT_*)
- Entry flow (lightening, 3-way splitter, terminal)

### e8ae7b6 Gaps / Broken

- **Order never created** → Fulfillment UI shows no orders. Cannot print labels or mark shipped from agnes-next fulfillment routes.
- **Fulfillment visibility** depends on Prisma Order, which is empty.
- Ledger schema differs (POINTS_AWARDED_PURCHASE vs PURCHASE_BOOK; sessionId on Ledger).
- No beta caps (different product requirement).
- track route may have written PURCHASE_COMPLETED (potential double-award).

### Current Branch Adds

- Order creation in webhook path
- Fulfillment visibility (orders appear in /admin/fulfillment)
- Beta caps (500/day buyer, 25k/day referrer)
- Unified post-purchase sync (postPurchaseSync.cjs)
- Idempotency improvements
- track route no longer writes purchase

---

## 6. Is e8ae7b6 Sufficient for Beta Testing?

**No.** e8ae7b6 is **not sufficient** for beta testing if you need:

1. **Fulfillment visibility** — Orders never appear; you cannot print shipping labels or mark orders shipped from the fulfillment UI.
2. **Beta caps** — No 500/day buyer or 25k/day referrer limits.
3. **Robust idempotency** — Current branch has stricter guards against double-award on webhook replay.

**e8ae7b6 is sufficient** only if:

- You do not need fulfillment UI (e.g. manual order handling).
- You do not need beta caps.
- You accept the risk of potential double-award from track route + webhook.

**Recommendation:** Merge the newer reconciliation work (postPurchaseSync, Order creation, beta caps) into the deploy baseline. The restoration plan should **add** post-purchase sync to the e8ae7b6 entry flow, not replace it. The two are complementary: e8ae7b6 provides entry flow; current branch provides post-purchase correctness and fulfillment.
