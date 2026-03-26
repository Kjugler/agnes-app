# Tier 2.2 ensureAssociateMinimal Containment – Report

## Summary
Replaced all route uses of `ensureAssociateMinimal` with deepquill-based identity resolution via `resolveIdentityByEmail`. No local canonical identity creation remains in these paths.

---

## Files Changed

| File | Change |
|------|--------|
| `agnes-next/src/lib/deepquillIdentity.ts` | **New** – Helper for deepquill identity lookup by email |
| `agnes-next/src/app/api/signal/ack/route.ts` | Replaced ensureAssociateMinimal → resolveIdentityByEmail |
| `agnes-next/src/app/api/signal/comment/route.ts` | Replaced ensureAssociateMinimal → resolveIdentityByEmail |
| `agnes-next/src/app/api/signal/comment-upvote/route.ts` | Replaced ensureAssociateMinimal → resolveIdentityByEmail |
| `agnes-next/src/app/api/signal/create/route.ts` | Replaced ensureAssociateMinimal → resolveIdentityByEmail |
| `agnes-next/src/app/api/signal/reply/route.ts` | Replaced ensureAssociateMinimal → resolveIdentityByEmail |
| `agnes-next/src/app/api/reviews/create/route.ts` | Replaced ensureAssociateMinimal → resolveIdentityByEmail |
| `agnes-next/src/app/api/rabbit/state/route.ts` | Replaced ensureAssociateMinimal → resolveIdentityByEmail |
| `agnes-next/src/app/api/rabbit/catch/route.ts` | Replaced ensureAssociateMinimal → resolveIdentityByEmail |
| `agnes-next/src/app/api/me/score/route.ts` | Replaced ensureAssociateMinimal → resolveIdentityByEmail |
| `agnes-next/.env.example` | Documented ADMIN_KEY for production |
| `deepquill/.env.example` | Documented ADMIN_KEY for production |
| `deepquill/api/points/award.cjs` | Clearer 403 error message when ADMIN_KEY missing |

---

## Files Verified Clean

- `agnes-next/src/app/api/associate/upsert/route.ts` – Already proxy-only (Tier 1)
- `agnes-next/src/app/api/points/award/route.ts` – Already proxy-only (Tier 1)
- `agnes-next/src/app/api/track/route.ts` – Already cleaned (Tier 1)
- `agnes-next/src/app/api/create-checkout-session/route.ts` – Already uses associate/status (Tier 1)

---

## Routes Now Hard-Depending on Deepquill

All of the following routes call `resolveIdentityByEmail`, which fetches `GET /api/associate/status?email=` from deepquill. If deepquill is down or unreachable, these return 401 (identity unknown) or 503 (fetch failure propagates as throw → 500 unless caught).

| Route | Depends On | Behavior When Deepquill Down |
|-------|------------|------------------------------|
| `POST /api/signal/ack` | associate/status | 401 if identity null; 500 if fetch fails |
| `POST /api/signal/comment` | associate/status | 401 if identity null; 500 if fetch fails |
| `POST /api/signal/comment-upvote` | associate/status | 401 if identity null; 500 if fetch fails |
| `POST /api/signal/create` | associate/status | 401 if identity null; 500 if fetch fails |
| `POST /api/signal/reply` | associate/status | 401 if identity null; 500 if fetch fails |
| `POST /api/reviews/create` | associate/status | 401 if identity null; 500 if fetch fails |
| `GET /api/rabbit/state` | associate/status | 401 if identity null; 500 if fetch fails |
| `POST /api/rabbit/catch` | associate/status | 401 if identity null; 500 if fetch fails |
| `GET /api/me/score` | associate/status | 401 if identity null; 500 if fetch fails |

**Note:** `resolveIdentityByEmail` throws on fetch failure. Route handlers that don’t explicitly catch will surface 500. Consider wrapping in try/catch and returning 503 for fetch errors if desired.

---

## Behavior Changes / Edge Cases

1. **No local identity creation**
   - Users who don’t exist in deepquill receive 401 instead of being created locally.
   - Users must sign up via contest/login or associate/upsert before these routes succeed.

2. **Rabbit routes (`rabbit/state`, `rabbit/catch`, `me/score`)**
   - When `findRabbitUser` returns null (user not in shared DB), `rabbit/state` and `me/score` return default values (points: 0, rabbitTarget: RANK_STEP/2, rabbitSeq: 1).
   - Previously `ensureAssociateMinimal` created the user locally, so `findRabbitUser` almost always found them. With shared DB, users created by deepquill should be found.

3. **ADMIN_KEY for points/award**
   - Production requires `ADMIN_KEY` in both agnes-next and deepquill env.
   - `.env.example` updated for both projects.
   - 403 response now includes a `hint` field when `ADMIN_KEY` is missing.

4. **`ensureAssociateMinimal` in lib/associate.ts**
   - Still defined; used only by `upsertAssociateByEmail`, which is not called by any route (associate/upsert is proxy-only).

---

## Points Award ADMIN_KEY Fix

- Added `ADMIN_KEY` documentation to `agnes-next/.env.example` and `deepquill/.env.example`.
- Improved deepquill `points/award` 403 message with a `hint` when `ADMIN_KEY` is not set.
- Production: set `ADMIN_KEY` to the same value in both apps’ environment variables.

---

## Outage Test (Tier 1 Route)

**Route:** `POST /api/associate/upsert`

| Phase | Deepquill | Result |
|-------|-----------|--------|
| Baseline | Up | 200 OK |
| Outage | Stopped (port 5055 killed) | 503 Server Unavailable |
| Recovery | Restarted | 200 OK |

Observed: during deepquill outage, agnes-next returns 503 and does not fall back to local writes.
