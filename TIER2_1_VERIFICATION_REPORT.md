# Tier 2.1 Rabbit Cleanup – Verification Report

## 1. No remaining agnes-next routes perform rabbit canonical logic ✅

| Check | Result |
|-------|--------|
| Local rabbit target calculation | **None** in routes. `lib/rabbit` calc functions only used by `lib/associate` (not in any active route path) |
| Rabbit completion detection | **None** – rabbit/catch proxies to deepquill |
| Rabbit reward issuance (RABBIT_BONUS) | **None** – only `lib/rabbitMissions` has it, never called |
| Rabbit-related prisma writes | **None** in routes. Admin jobs (send-reminders, etc.) touch User for email timestamps only, not rabbit fields |

---

## 2. rabbit/state, rabbit/catch, me/score are proxy/read-only ✅

| Route | Behavior |
|-------|----------|
| `GET /api/rabbit/state` | Proxies to `GET /api/points/me`; maps `total`→`points`; no prisma |
| `POST /api/rabbit/catch` | Proxies to `POST /api/rabbit/catch`; forwards body; no prisma |
| `GET /api/me/score` | Proxies to `GET /api/points/me`; maps `total`→`totalPoints`; no prisma |

---

## 3. /api/points/me returns all fields needed by current UI ✅ (fixed)

**Fixed:** deepquill `points/me` was missing `rabbitTarget`, `rabbitSeq`, `nextRankThreshold` in the response. Added.

| Consumer | Fields used |
|----------|-------------|
| rabbit/state proxy | total, rabbitTarget, rabbitSeq, nextRankThreshold |
| me/score proxy | total, rabbitTarget, rabbitSeq, nextRankThreshold |
| ScoreClient (refreshPoints, refreshFromSourceOfTruth) | total, firstName, earned, recent, referrals, rabbit1Completed, lastEvent, contestJoined, explicitContestEntry |
| BadgeClient | total, earned.purchase_book |

All required fields are now returned.

---

## 4. No active code path invokes lib/rabbitMissions ✅

| Check | Result |
|-------|--------|
| `checkAndAwardRabbit1` | Defined in rabbitMissions.ts; **never imported or called** |
| `getActionsSnapshot` | Only used internally by checkAndAwardRabbit1; **no external callers** |

---

## 5. Verified clean / dead code / UI compatibility

### Verified clean
- `src/app/api/rabbit/state/route.ts` – proxy only
- `src/app/api/rabbit/catch/route.ts` – proxy only
- `src/app/api/me/score/route.ts` – proxy only

### Dead code candidates
- `lib/rabbitMissions.ts` – `checkAndAwardRabbit1` never called; can remove or move to deepquill if ever needed
- `lib/associate.ts` – `ensureAssociateMinimal`, `upsertAssociateByEmail` not used by any route (associate/upsert is proxy-only)
- `lib/rabbit.ts` – Only referenced by `lib/associate.ts`; can remove if associate is cleaned up

### UI compatibility warnings
- **api/points route** (`GET /api/points`) – Uses a different “rabbit” idea: `rabbitTarget = totalPoints < 75 ? 100 : Math.ceil((totalPoints+25)/25)*25` for a “rival” display. This is **not** the canonical rabbit progression (RANK_STEP 500). Used by `CurrentScoreButton` with `sessionId`. If that UI should show canonical rabbit state, it should call `rabbit/state` or `points/me` instead of `/api/points`.

---

## Next Tier 2 step proposal

1. **Contest latency / read consistency** – If contest flows (live stats, score, login) still have notable latency or read-after-write issues, that should be next.
2. **Otherwise: Fulfillment source-of-truth review** – Move fulfillment logic to deepquill and make agnes-next read-only for orders/shipping.

Recommendation: **Proceed to fulfillment source-of-truth review** unless you have specific contest latency problems to address first.
