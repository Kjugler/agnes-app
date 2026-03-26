# Tier 1 Verification Report — agnes-next

**Date:** 2025-03-14  
**Objective:** Confirm agnes-next no longer writes canonical data locally (identity, points, ledger, referral, purchase, contest state).

---

## 1. Files Verified Clean

These routes/libs have **no canonical local writes** after Tier 1 fixes:

| File | Status |
|------|--------|
| `src/app/api/associate/upsert/route.ts` | Proxies only; 503 on deepquill failure |
| `src/app/api/points/award/route.ts` | Proxies only; 503 on failure |
| `src/app/api/create-checkout-session/route.ts` | Resolves principal via deepquill `/api/associate/status` |
| `src/app/api/points/me/route.ts` | Proxies to deepquill |
| `src/app/api/associate/status/route.ts` | Proxies to deepquill |
| `src/app/api/contest/login/route.ts` | Proxies to deepquill |
| `src/app/api/contest/join/route.ts` | Proxies to deepquill |
| `src/app/api/contest/explicit-enter/route.ts` | Proxies to deepquill |
| `src/app/api/contest/score/route.ts` | Proxies to deepquill |
| `src/app/api/contest/terminal-discovery/route.ts` | Proxies to deepquill |
| `src/app/api/contest/live-stats/route.ts` | Proxies to deepquill |
| `src/app/api/refer/route.ts` | Proxies validation + award to deepquill |
| `src/app/api/track/route.ts` | **Fixed this pass** — removed local User/Purchase/Event writes |

---

## 2. Files Changed (This Verification Pass)

| File | Change |
|------|--------|
| `src/app/api/track/route.ts` | Removed `getOrCreateUserId`, `recordPurchase`, and local User/Purchase/Event persistence for PURCHASE_COMPLETED. Canonical purchase state comes from deepquill Stripe webhook. |

---

## 3. Remaining Risk Areas (Tier 2+)

These still write or can trigger canonical writes. **No edits made** — would require proxy/architecture changes:

### Routes with canonical writes

| File | Violation | Notes |
|------|-----------|-------|
| `src/app/api/rabbit/catch/route.ts` | Ledger (RABBIT_BONUS) + User update | Writes via prisma.$transaction |
| `src/app/api/rabbit/state/route.ts` | ensureAssociateMinimal (can create User) | Read path; ensures user in local DB |
| `src/app/api/me/score/route.ts` | ensureAssociateMinimal | Same |
| `src/app/api/admin/jobs/send-no-purchase-reminders/route.ts` | User read + User update (noPurchaseEmailSentAt) | |
| `src/app/api/admin/jobs/send-engaged-reminders/route.ts` | User, Purchase, ReferralConversion read + User update | |
| `src/app/api/admin/jobs/send-non-participant-reminders/route.ts` | Same | |
| `src/app/api/admin/jobs/send-missionary-emails/route.ts` | Same | |
| `src/app/api/fulfillment/print-label/route.ts` | Order update | |
| `src/app/api/fulfillment/mark-shipped/route.ts` | Order update | |
| `src/app/api/fulfillment/next-for-label/route.ts` | Order read | |
| `src/app/api/fulfillment/to-ship/route.ts` | Order read | |

### Libs that mutate canonical state

| File | Mutates | Used by |
|------|---------|---------|
| `src/lib/associate.ts` | User create/update | rabbit/*, signal/*, reviews/create |
| `src/lib/rabbit.ts` | User update | rabbit/catch, rabbit/state |
| `src/lib/dailySharePoints.ts` | Ledger + User | (was points/award — no longer) |
| `src/lib/rabbitMissions.ts` | Ledger + User | (was points/award — no longer) |

### Routes using ensureAssociateMinimal (can create User locally)

- `src/app/api/signal/reply/route.ts`
- `src/app/api/signal/create/route.ts`
- `src/app/api/signal/comment/route.ts`
- `src/app/api/signal/ack/route.ts`
- `src/app/api/signal/comment-upvote/route.ts`
- `src/app/api/reviews/create/route.ts`
- `src/app/api/rabbit/catch/route.ts`
- `src/app/api/rabbit/state/route.ts`
- `src/app/api/me/score/route.ts`

**Note:** `signal/comment-upvote` writes only SignalCommentUpvote + SignalComment (UI/signals). The canonical risk is `ensureAssociateMinimal`, which can create User.

---

## 4. Routes That Depend on Deepquill Availability

These **fail or degrade** when deepquill is down:

| Route | Deepquill dependency | Failure mode |
|-------|---------------------|--------------|
| `/api/associate/upsert` | `/api/associate/upsert` | 503 |
| `/api/points/award` | `/api/points/award` | 503 |
| `/api/create-checkout-session` | `/api/associate/status`, `/api/create-checkout-session` | 400/500; checkout blocked |
| `/api/points/me` | `/api/points/me` | 500 |
| `/api/associate/status` | `/api/associate/status` | 500 |
| `/api/contest/login` | `/api/contest/login` | 500 |
| `/api/contest/join` | `/api/contest/join` | 500 |
| `/api/contest/explicit-enter` | `/api/contest/explicit-enter` | 500 |
| `/api/contest/score` | `/api/contest/score` | 500 |
| `/api/contest/terminal-discovery` | `/api/contest/terminal-discovery` | 500 |
| `/api/contest/live-stats` | `/api/contest/live-stats` | 500 |
| `/api/refer` | `/api/referral/validate`, `/api/refer-friend`, `/api/referral/award-email-points` | 400/500 |
| `/api/checkout/verify-session` | (if proxied) | 500 |
| `/api/track` | `/api/track` (Mailchimp — deepquill may not have this) | Non-blocking; logs warning |

---

## 5. Minimal Test Checklist

### Identity resolution

- [ ] **Login flow:** Contest login with email → cookies set → `/api/associate/status` returns `id`, `email`, `code`
- [ ] **Checkout principal (userId cookie):** Logged-in user starts checkout → `contest_user_id` present → deepquill associate/status returns email → checkout succeeds
- [ ] **Checkout principal (email only):** User with email cookie but no userId → deepquill associate/status?email=X returns id → checkout succeeds
- [ ] **Associate upsert:** Submit associate form → proxy succeeds → cookies set with code; proxy fails → 503, no local fallback

### Points awarding

- [ ] **Share action:** POST `/api/points/award` with `kind: share_x`, `x-user-email` → 200, `awarded: true` or `alreadyAwarded: true`
- [ ] **Proxy failure:** Deepquill down → 503
- [ ] **Invalid action:** `kind: invalid` → 400 from deepquill

### Checkout session creation

- [ ] **Logged-in user:** Cookies present → principal resolved via deepquill → Stripe session created
- [ ] **Email-only user:** Only email in cookie → associate/status?email=... returns userId → session created
- [ ] **Deepquill down:** Associate/status or create-checkout-session fails → error, no local User creation

### Deepquill outage handling

- [ ] **Associate upsert:** Deepquill 503 → agnes-next returns 503 (no fallback)
- [ ] **Points award:** Deepquill unreachable → agnes-next returns 503
- [ ] **Contest login:** Deepquill down → login fails with 500
- [ ] **Points/me:** Deepquill down → 500 when fetching score
- [ ] **Track PURCHASE_COMPLETED:** No local User/Purchase/Event write; Mailchimp proxy may fail quietly
