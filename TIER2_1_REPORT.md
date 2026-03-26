# Tier 2.1 Rabbit Canonical Cleanup – Report

## Summary
All rabbit canonical state and reward logic moved to deepquill. Agnes-next rabbit/state, rabbit/catch, and me/score are proxy-only. No local rabbit computation or persistence remains in these routes.

---

## Files Changed

### Deepquill (new/modified)

| File | Change |
|------|--------|
| `deepquill/lib/rabbit.cjs` | **New** – RANK_STEP, calcNextRankThreshold, calcInitialRabbitTarget, ensureRabbitState |
| `deepquill/api/rabbit/catch.cjs` | **New** – Canonical rabbit catch: completion detection, ledger RABBIT_BONUS, User.rabbitTarget/rabbitSeq update |
| `deepquill/api/points/me.cjs` | **Modified** – Added rabbitTarget, rabbitSeq, nextRankThreshold to response; calls ensureRabbitState with canonical total |
| `deepquill/server/index.cjs` | **Modified** – Mounted POST /api/rabbit/catch |

### Agnes-next (proxy-only)

| File | Change |
|------|--------|
| `agnes-next/src/app/api/rabbit/state/route.ts` | **Replaced** – Proxy to GET /api/points/me; maps total→points |
| `agnes-next/src/app/api/rabbit/catch/route.ts` | **Replaced** – Proxy to POST /api/rabbit/catch |
| `agnes-next/src/app/api/me/score/route.ts` | **Replaced** – Proxy to GET /api/points/me; maps total→totalPoints |

---

## Files Verified Clean

- `agnes-next/src/app/api/rabbit/state` – No prisma, no rabbit lib
- `agnes-next/src/app/api/rabbit/catch` – No prisma, no rabbit lib
- `agnes-next/src/app/api/me/score` – No prisma, no rabbit lib

---

## New Deepquill Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/rabbit/catch` | POST | Canonical rabbit catch: verify target reached, create RABBIT_BONUS ledger, advance rabbitTarget/rabbitSeq |

**Extended** (no new endpoint):
- `/api/points/me` – Response now includes `rabbitTarget`, `rabbitSeq`, `nextRankThreshold`

---

## Unified Endpoint Confirmation

**Yes – a single unified endpoint is sufficient for UI.**

- **GET /api/points/me** returns: `total`, `rabbitTarget`, `rabbitSeq`, `nextRankThreshold`, plus existing fields (firstName, earned, rabbit1Completed, etc.)
- **rabbit/state** proxies to points/me and maps `total` → `points` for useScore compatibility
- **me/score** proxies to points/me and maps `total` → `totalPoints`
- No duplicate reward paths: rabbit catch is the only path for RABBIT_BONUS
- No local fallback: agnes-next returns 503 when deepquill is unavailable

---

## Remaining Rabbit-Related Risks

1. **lib/rabbitMissions.ts** – `checkAndAwardRabbit1` performs Ledger + User writes for "Rabbit 1" (one-time social+book bonus). This is **not** the progression rabbit and is **never called** by any route. It remains as potentially dead/legacy code. If it were ever invoked, it would create a duplicate reward path; recommend moving to deepquill or removing if truly unused.

2. **lib/rabbit.ts** (agnes-next) – Still exists; only used by `lib/associate.ts` (ensureAssociateMinimal, upsertAssociateByEmail). Those functions are not called by any route (associate/upsert is proxy-only). Lib/rabbit can be removed if associate.ts is refactored to drop ensureAssociateMinimal.

3. **lib/associate.ts** – Uses calcInitialRabbitTarget for user creation in ensureAssociateMinimal. Not in active path; document as legacy.

---

## Behavior Changes / Edge Cases

1. **rabbit/state, me/score** – Now depend on deepquill being up. If deepquill is down → 503.
2. **rabbit/catch** – Same; 503 when deepquill unavailable.
3. **Points resolution** – Rabbit logic in deepquill uses rollup total (ledger-derived) for completion check, not user.points cache.
4. **Ledger-only reward** – rabbit/catch creates ledger RABBIT_BONUS only; does not increment user.points (rollup is canonical; points/me reconciles user.points from rollup).
5. **me/score consumers** – Response shape unchanged: totalPoints, rabbitTarget, rabbitSeq, nextRankThreshold. No UX change.

---

## No UX Changes

- UI continues to call `/api/rabbit/state` and `/api/rabbit/catch` (same paths).
- Response shapes preserved via mapping in proxy routes.
- useScore and ScoreClient require no changes.
