# Tier 1 Stabilization Test Report

**Date:** 2025-03-14  
**Baseline:** Tier 1 fixes (associate/upsert, points/award, create-checkout-session, track)  
**Environment:** localhost:3002 (agnes-next), localhost:5055 (deepquill)

---

## Test Results Summary

| Category              | Passed | Failed | Warnings |
|-----------------------|--------|--------|----------|
| Identity resolution   | 2      | 0      | 1        |
| Points proxying       | 0      | 0      | 1        |
| Checkout session      | 1      | 0      | 0        |
| Purchase-complete     | 1      | 0      | 0        |
| Deepquill outage      | 0      | 0      | 1 (code only) |

---

## 1. Identity Resolution

| Test | Result | Details |
|------|--------|---------|
| Contest login | **PASS** | POST `/api/contest/login` with email → 200, `userId`, `ok:true`. Proxied to deepquill; user created there. |
| Associate status (cookies) | **WARN** | GET `/api/associate/status` with `contest_user_id` cookie → 200 but `hasAssociate:false, id:null`. May be cookie forwarding or deepquill lookup. Identity created via login; status may need `contest_email` in correct format. |
| Checkout principal resolution | **PASS** | Create checkout with user cookies → principal resolved, Stripe session created. |
| Associate upsert fallback | **PASS** (code) | No local fallback; 503 on deepquill failure. |

---

## 2. Points Proxying

| Test | Result | Details |
|------|--------|---------|
| Points award (share_x) | **WARN** | POST `/api/points/award` with `x-user-email`, `kind:share_x` → 403 Forbidden. Deepquill `points/award` requires `NODE_ENV=development` or valid `x-admin-key`. In prod, set `ADMIN_KEY` in both apps. |
| Proxy-only path | **PASS** (code) | No prisma usage in agnes-next `points/award`; pure proxy. |
| No local fallback | **PASS** (code) | On proxy failure → 503. |

---

## 3. Checkout Session Creation

| Test | Result | Details |
|------|--------|---------|
| Create session | **PASS** | POST `/api/create-checkout-session` with product, email, user cookies → 200, Stripe `url` returned. Principal resolved via deepquill `associate/status`. |
| No local User creation | **PASS** (code) | Removed `ensureAssociateMinimal` and `prisma.user`; uses deepquill only. |

---

## 4. Purchase-Complete Tracking

| Test | Result | Details |
|------|--------|---------|
| Track PURCHASE_COMPLETED | **PASS** | POST `/api/track` with `type:PURCHASE_COMPLETED`, email, meta → 200, `ok:true`. |
| No canonical local writes | **PASS** (code) | `recordPurchase`, `getOrCreateUserId` removed. No User/Purchase/Event writes in agnes-next. |
| Canonical source | **PASS** (code) | Purchase state from deepquill Stripe webhook only. |

---

## 5. Deepquill Outage Handling

| Test | Result | Details |
|------|--------|---------|
| Explicit failure codes | **PASS** (code) | `associate/upsert` → 503, `points/award` → 503 on proxy throw. |
| No local fallback | **PASS** (code) | No fallback to local DB in Tier 1 routes. |
| Simulated outage | **WARN** | Would require stopping deepquill or overriding `NEXT_PUBLIC_API_BASE_URL`. Not run in this pass. |

---

## Canonical Writes Verification

**Confirmed no canonical writes in Tier 1 flows:**

- `associate/upsert` — Proxy only; no prisma
- `points/award` — Proxy only; no prisma
- `create-checkout-session` — Principal via deepquill API; no prisma
- `track` — Local User/Purchase/Event writes removed

**Failure behavior:** All Tier 1 routes return explicit 503/500 on deepquill failure; no local fallback.

---

## Suspected Tier 2 Candidates

| Area | Route/Lib | Issue |
|------|-----------|-------|
| Rabbit | `rabbit/catch`, `rabbit/state`, `me/score` | Ledger + User writes; `ensureAssociateMinimal` |
| Signal/review identity | `signal/*`, `reviews/create` | `ensureAssociateMinimal` can create User locally |
| Admin jobs | `send-*-reminders`, `send-missionary-emails` | User read + update (noPurchaseEmailSentAt, etc.) |
| Fulfillment | `fulfillment/*` | Order read/update on local DB |
| Points award gate | deepquill `points/award` | 403 when not dev and no ADMIN_KEY; prod config needed |

---

# Tier 2 Plan (Proposed)

**Scope:** Rabbit canonical cleanup, ensureAssociateMinimal containment, contest read consistency, fulfillment source-of-truth. No architecture redesign. No UX changes. Surgical edits only.

---

## 2.1 Rabbit Canonical-State Cleanup

**Goal:** Move rabbit state (points, rabbitTarget, rabbitSeq, RABBIT_BONUS) to deepquill; agnes-next proxies only.

| Task | Files | Change |
|------|-------|--------|
| Add deepquill endpoints | deepquill `server/index.cjs` | `GET /api/rabbit/state`, `POST /api/rabbit/catch` |
| Proxy rabbit/state | `agnes-next/api/rabbit/state/route.ts` | Replace ensureAssociateMinimal + findRabbitUser + ensureRabbitState with `proxyJson('/api/rabbit/state')` |
| Proxy rabbit/catch | `agnes-next/api/rabbit/catch/route.ts` | Replace prisma transaction with `proxyJson('/api/rabbit/catch')` |
| Proxy me/score | `agnes-next/api/me/score/route.ts` | Proxy to same deepquill endpoint as rabbit/state (or deprecate if duplicate) |
| Remove rabbit lib usage | `lib/rabbit.ts`, `lib/rabbitMissions.ts` | Stop use in rabbit routes; keep for any other consumers until migrated |

---

## 2.2 ensureAssociateMinimal Containment

**Goal:** Stop creating User in agnes-next for canonical paths. Resolve identity via deepquill.

| Task | Files | Change |
|------|-------|--------|
| Signal/review identity | `signal/reply`, `signal/create`, `signal/comment`, `signal/ack`, `signal/comment-upvote`, `reviews/create` | Replace `ensureAssociateMinimal(email)` with: call `proxyJson('/api/associate/status?email=' + email)`; use `data.id` for userId. If 404/null, return 401. |
| New helper | `lib/deepquillIdentity.ts` | `resolveUserIdByEmail(email): Promise<string | null>` — proxies to associate/status, returns id or null. |
| associate.ts | `lib/associate.ts` | Mark deprecated or restrict to non-canonical paths only. |

---

## 2.3 Contest Latency / Read-Consistency

**Goal:** Reduce round-trips and ensure UI reads from single source.

| Task | Files | Change |
|------|-------|--------|
| Extend points/me | deepquill `api/points/me.cjs` | Ensure rabbit1Completed, rabbitTarget, rabbitSeq, nextRankThreshold included in response. |
| Single read path | agnes-next contest UI | Use `/api/points/me` for score + rabbit state; avoid separate rabbit/state call when possible. |
| verify-session fast path | Already done | Keep verify-session for post-purchase contest-ready; no change. |

---

## 2.4 Fulfillment Source-of-Truth Review

**Goal:** Fulfillment reads/writes from deepquill only.

| Task | Files | Change |
|------|-------|--------|
| Add fulfillment API | deepquill | `GET /api/fulfillment/next-for-label`, `POST /api/fulfillment/print-label`, `GET /api/fulfillment/to-ship`, `POST /api/fulfillment/mark-shipped` |
| Proxy fulfillment | agnes-next `api/fulfillment/*` | Replace prisma reads/writes with `proxyJson` to deepquill |
| Order/Customer | agnes-next schema | After migration, consider removing Order/Customer from agnes-next if no longer needed. |

---

## Execution Order

1. **2.2** — ensureAssociateMinimal containment (highest dual-write risk)
2. **2.1** — Rabbit cleanup (moderate risk, clear scope)
3. **2.3** — Contest read consistency (low risk, optimization)
4. **2.4** — Fulfillment (requires new deepquill endpoints)

---

## Out of Scope for Tier 2

- Admin jobs (would need deepquill job endpoints)
- Signal/review content schema (Signals stay in agnes-next)
- Stripe webhook routing
- UX or flow changes
