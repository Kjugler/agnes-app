# Three Fixes Summary — Purchase Flow Alignment

**Date:** 2026-03-14

---

## 1. Purchase Confirmation Email — Total Points Out of Sequence

### Exact cause
The webhook sent the purchase confirmation email using `user.points`, which is only reconciled later by `points/me` or `contest/score`. The ledger entries (POINTS_AWARDED_PURCHASE, CONTEST_JOIN) were written before the email, but the total came from the stale `user.points` cache.

### File
`deepquill/api/stripe-webhook.cjs`

### Patch
Replaced the `user.points` lookup with `getPointsRollupForUser(prisma, buyerUser.id)`, which computes the total from the ledger after all entries are written.

### Expected behavior
Purchase confirmation email displays the correct total, including the purchase points (e.g. 32810 instead of 32310).

---

## 2. Discount Persistence / Applied Discount Logic Inconsistent

### Exact cause
If the requested code (e.g. 9LR4ZA) failed validation, checkout stopped and did not fall back to a persisted valid code (e.g. `lastReferralCode` FNXCAP). The webhook still attributed to FNXCAP via the buyer's User record, so Stripe had no discount but the webhook gave commission. Checkout and webhook were misaligned.

### File
`deepquill/api/create-checkout-session.cjs`

### Patch
1. When the request code is invalid, fall back to `activeLastReferral` then `preferredDiscountCode`, and use the first valid one for Stripe.
2. Persist any applied valid code (including fallbacks) as `preferredDiscountCode`, so the “first discount code” rule applies regardless of source.

### Expected behavior
- Invalid request code → fallback to persisted valid code.
- Stripe discount and webhook attribution use the same code.
- First valid code is stored and reused unless the user overrides with another valid code.

---

## 3. Officially Enter → See Progress Too Slow

### Exact cause
The button state depended on `associate/status` (needs cookies, user identity). After purchase, the webhook creates Purchase and CONTEST_JOIN, but the UI only learned about it when `associate/status` returned `contestJoined: true`. The refresh loop used `associate/status` only, with delays of 0, 1.2s, 2.5s, 4.5s.

### Files
- `deepquill/api/checkout/verify-session.cjs` — add `contestJoined` to the response when Purchase exists and user has CONTEST_JOIN.
- `agnes-next/src/app/contest/ContestClient.tsx` — fast path and refresh loop changes.

### Patch
1. **verify-session**: For paid sessions, look up Purchase by `sessionId`, get `userId`, call `hasContestJoin`, and include `contestJoined` in the response.
2. **ContestClient fast path**: When `justPurchased` and `session_id` are present, call `verify-session` immediately and set `hasJoinedContest` if `contestJoined === true`.
3. **Refresh loop**: When `sessionId` is present, first call `verify-session` (no cookies); fall back to `associate/status` only if needed. Reduce attempts to 0, 800ms, 1.8s.

### Expected behavior
- “See Progress” appears as soon as the webhook has processed (usually within a few seconds).
- Fewer `associate/status` calls; `verify-session` used for contest-ready when `session_id` is available.
