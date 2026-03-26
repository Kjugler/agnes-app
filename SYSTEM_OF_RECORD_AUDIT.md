# System-of-Record Architecture Audit

**Date:** 2025-03-14  
**Goal:** Eliminate dual-write / dual-source issues before production deployment.

---

## 1. Architecture Rules

| Rule | Description |
|------|--------------|
| **deepquill** | ONLY source of truth for: User, Purchase, Ledger, Referral, Contest state |
| **agnes-next** | MUST NOT write to its own DB for the above; ONLY read via API from deepquill |
| **agnes-next DB** | Limited to: signals, UI content, non-critical presentation data |

---

## 2. Violations Summary

### Critical: Writes to Canonical Entities (User, Ledger, Purchase, Referral, Contest)

| File | Operation | Entity | Severity |
|------|-----------|--------|----------|
| `src/lib/associate.ts` | create, update | User | **CRITICAL** |
| `src/app/api/associate/upsert/route.ts` | fallback write | User | **CRITICAL** |
| `src/app/api/points/award/route.ts` | create Ledger, update User | Ledger, User | **CRITICAL** |
| `src/app/api/rabbit/catch/route.ts` | create Ledger, update User | Ledger, User | **CRITICAL** |
| `src/lib/dailySharePoints.ts` | create Ledger, update User | Ledger, User | **CRITICAL** |
| `src/lib/rabbitMissions.ts` | create Ledger, update User | Ledger, User | **CRITICAL** |
| `src/app/api/admin/jobs/send-no-purchase-reminders/route.ts` | read User/Purchase, update User | User, Purchase | **CRITICAL** |
| `src/app/api/admin/jobs/send-engaged-reminders/route.ts` | read User/Purchase/ReferralConversion, update User | User, Purchase, ReferralConversion | **CRITICAL** |
| `src/app/api/admin/jobs/send-non-participant-reminders/route.ts` | read User/Purchase/ReferralConversion, update User | User, Purchase, ReferralConversion | **CRITICAL** |
| `src/app/api/admin/jobs/send-missionary-emails/route.ts` | read User/Purchase/ReferralConversion, update User | User, Purchase, ReferralConversion | **CRITICAL** |
| `src/app/api/fulfillment/next-for-label/route.ts` | read Order | Order (Purchase/fulfillment) | **CRITICAL** |
| `src/app/api/fulfillment/print-label/route.ts` | read, update Order | Order | **CRITICAL** |
| `src/app/api/fulfillment/to-ship/route.ts` | read Order | Order | **CRITICAL** |
| `src/app/api/fulfillment/mark-shipped/route.ts` | read, update Order, Customer | Order, Customer | **CRITICAL** |

### High: Reads from Canonical Entities (should use deepquill API)

| File | Operation | Entity | Notes |
|------|-----------|--------|-------|
| `src/app/api/points/route.ts` | read Purchase, User, Event | Purchase, User, Event | Points logic; should proxy to deepquill |
| `src/app/api/create-checkout-session/route.ts` | read User, ensureAssociateMinimal | User | Principal resolution; should use deepquill |
| `src/app/api/rabbit/state/route.ts` | read User (ensureAssociateMinimal, findRabbitUser) | User | Rabbit state; should proxy |
| `src/app/api/me/score/route.ts` | read User (rabbit state) | User | Duplicate of rabbit/state; should proxy |
| `src/lib/rabbit.ts` | read, update User | User | Rabbit state; move to deepquill or proxy |
| `src/lib/associatePublisher.ts` | read User (referralCode) | User | Referral validation; use `/api/referral/validate` |
| `src/app/api/signal/reply/route.ts` | read Purchase, ReferralConversion, User | Purchase, ReferralConversion, User | Moderation auth; use deepquill |
| `src/app/api/reviews/create/route.ts` | read Purchase, ReferralConversion, User; ensureAssociateMinimal | Purchase, ReferralConversion, User | Moderation auth; use deepquill |
| `src/app/signal-room/page.tsx` | read User (by email) | User | Identity for acknowledge; use deepquill |
| `src/app/api/fulfillment/user/route.ts` | (if exists) FulfillmentUser | FulfillmentUser | Check if reads canonical data |

### Medium: Supporting Libs Used by Violating Routes

| File | Used By | Purpose |
|------|---------|---------|
| `src/lib/associate.ts` | associate/upsert, create-checkout-session, points/award, rabbit/*, signal/reply, reviews/create | User create/update/ensure |
| `src/lib/rabbit.ts` | rabbit/catch, rabbit/state, me/score, associate.ts | Rabbit state read/write |
| `src/lib/dailySharePoints.ts` | points/award | Ledger + User for share points |
| `src/lib/rabbitMissions.ts` | points/award | Ledger + User for Rabbit 1 |

---

## 3. Already Compliant (Proxies to deepquill)

| Route | Status |
|-------|--------|
| `src/app/api/points/me/route.ts` | ✅ Proxies to `/api/points/me` |
| `src/app/api/associate/status/route.ts` | ✅ Proxies to `/api/associate/status` |
| `src/app/api/contest/login/route.ts` | ✅ Proxies to `/api/contest/login` |
| `src/app/api/contest/join/route.ts` | ✅ Proxies to `/api/contest/join` |
| `src/app/api/contest/explicit-enter/route.ts` | ✅ Proxies to `/api/contest/explicit-enter` |
| `src/app/api/contest/score/route.ts` | ✅ Proxies to `/api/contest/score` |
| `src/app/api/contest/terminal-discovery/route.ts` | ✅ Proxies to `/api/contest/terminal-discovery` |
| `src/app/api/contest/live-stats/route.ts` | ✅ Proxies to `/api/contest/live-stats` |
| `src/app/api/refer/route.ts` | ✅ Proxies validation + award to deepquill |

---

## 4. Files to Fix (Prioritized)

### Tier 1: Remove Local Fallbacks / Writes

| File | Change |
|------|--------|
| `src/app/api/associate/upsert/route.ts` | Remove fallback to `upsertAssociateByEmail`; return 503 when deepquill proxy fails |
| `src/app/api/points/award/route.ts` | Remove all local Ledger/User writes; proxy only; remove fallback; remove `handleBookPurchase` local path |

### Tier 2: Convert to Deepquill Proxy

| File | Change |
|------|--------|
| `src/app/api/points/route.ts` | Replace with proxy to deepquill. Deepquill may need new endpoint or use `/api/points/me` + session/email semantics |
| `src/app/api/rabbit/state/route.ts` | Proxy to deepquill. **deepquill needs** `/api/rabbit/state` (GET) endpoint |
| `src/app/api/rabbit/catch/route.ts` | Proxy to deepquill. **deepquill needs** `/api/rabbit/catch` (POST) endpoint |
| `src/app/api/me/score/route.ts` | Proxy to same deepquill endpoint as rabbit/state, or deprecate if duplicate |
| `src/app/api/create-checkout-session/route.ts` | For principal resolution: call deepquill `/api/associate/status` or new `/api/user/by-email` instead of prisma.user / ensureAssociateMinimal |

### Tier 3: Add Deepquill Endpoints + Migrate Jobs

| File | Change |
|------|--------|
| `src/app/api/admin/jobs/send-no-purchase-reminders/route.ts` | Create deepquill job endpoint; agnes-next calls it |
| `src/app/api/admin/jobs/send-engaged-reminders/route.ts` | Same |
| `src/app/api/admin/jobs/send-non-participant-reminders/route.ts` | Same |
| `src/app/api/admin/jobs/send-missionary-emails/route.ts` | Same |

### Tier 4: Fulfillment

| File | Change |
|------|--------|
| `src/app/api/fulfillment/next-for-label/route.ts` | Proxy to deepquill. **deepquill needs** fulfillment API |
| `src/app/api/fulfillment/print-label/route.ts` | Same |
| `src/app/api/fulfillment/to-ship/route.ts` | Same |
| `src/app/api/fulfillment/mark-shipped/route.ts` | Same |

### Tier 5: Moderation Auth (Use Deepquill for Contest State)

| File | Change |
|------|--------|
| `src/app/api/signal/reply/route.ts` | Replace Purchase/ReferralConversion/User reads with deepquill API (e.g. extend `/api/points/me` to return hasPurchase, isContestOfficial) |
| `src/app/api/reviews/create/route.ts` | Same; Review write can stay in agnes-next if Review is UI content, but User identity must come from deepquill |
| `src/app/signal-room/page.tsx` | Resolve userId from deepquill (proxy with email) instead of prisma.user |
| `src/lib/associatePublisher.ts` | Replace with proxy to `/api/referral/validate` (already exists in deepquill) |

### Tier 6: Remove / Refactor Libs

| File | Change |
|------|--------|
| `src/lib/associate.ts` | Remove or restrict to dev-only; all prod flows use deepquill |
| `src/lib/rabbit.ts` | Remove from agnes-next; logic lives in deepquill |
| `src/lib/dailySharePoints.ts` | Move share-point award to deepquill `/api/points/award` (already exists); agnes-next proxies only |
| `src/lib/rabbitMissions.ts` | Move to deepquill; agnes-next does not call |
| `src/lib/associatePublisher.ts` | Replace with `proxyJson('/api/referral/validate?code=' + ...)` |

---

## 5. Deepquill Endpoints to Add

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/rabbit/state` | GET | Return points, rabbitTarget, rabbitSeq, nextRankThreshold (from User + Ledger rollup) |
| `/api/rabbit/catch` | POST | Award RABBIT_BONUS, update User.rabbitSeq, lastRabbitCatchAt |
| `/api/admin/jobs/no-purchase-reminders` | GET | Run job; return sentCount |
| `/api/admin/jobs/engaged-reminders` | GET | Run job; return sentCount |
| `/api/admin/jobs/non-participant-reminders` | GET | Run job; return sentCount |
| `/api/admin/jobs/missionary-emails` | GET | Run job; return sentCount |
| `/api/fulfillment/next-for-label` | GET | Return next pending order |
| `/api/fulfillment/print-label` | POST | Mark label printed |
| `/api/fulfillment/to-ship` | GET | List orders to ship |
| `/api/fulfillment/mark-shipped` | POST | Mark shipped, send email |
| `/api/user/by-email` or extend `/api/associate/status` | GET | Resolve userId, code from email (for checkout principal) |

---

## 6. Minimal Changes (Quick Wins)

1. **associate/upsert**: Remove local fallback; return 503 on proxy failure.
2. **points/award**: Remove all `prisma.` usage; proxy only; fail if proxy fails.
3. **create-checkout-session**: For `email && !userId`, call deepquill to resolve; remove `ensureAssociateMinimal` and `prisma.user.findUnique`.
4. **associatePublisher**: Replace `prisma.user.findUnique` with `proxyJson('/api/referral/validate?code=' + ref)`.
5. **points/route**: Deprecate or replace with redirect to `/api/points/me` with appropriate auth; document that `/api/points` (legacy) is not canonical.

---

## 7. UI State Sources (Target)

All UI state for contest status, points, identity should come from:

- `/api/points/me` — points, ledger rollup, contest join, rabbit1Completed
- `/api/associate/status` — associate profile, code, referrals
- `/api/contest/score` — score with session_id
- `/api/checkout/verify-session` — contest join after purchase

Rabbit state (points, rabbitTarget, rabbitSeq) should be included in `/api/points/me` or a new `/api/rabbit/state`.

---

## 8. Schema Cleanup (Post-Migration)

After all routes use deepquill:

- Consider removing from agnes-next Prisma: User, Purchase, Ledger, ReferralConversion, Order, Customer (if no longer used).
- Keep: Signal, SignalReply, SignalAcknowledge, SignalComment, Review, Event (if used only for signals), Badge, UserBadge, Post, FulfillmentUser (or move to deepquill).

Note: Order/Customer may still be needed if fulfillment UI stays in agnes-next but reads from deepquill API. Otherwise, remove.
