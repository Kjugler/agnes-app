# Rival / Display Rabbit Removal Report

## Summary
Removed all secondary rabbit calculations and rival displays from agnes-next. Only the canonical rabbit (from deepquill via points/me or rabbit/state) remains.

---

## Files Changed

| File | Change |
|------|--------|
| `src/app/api/points/route.ts` | Removed rival object and local rabbitTarget calculation |
| `src/app/contest/score/ScoreClient.tsx` | Replaced fallback `totalPoints + 500` with `nextRankThreshold ?? 500` (both from deepquill) |

---

## Code Removed

### api/points/route.ts
- **Removed:** `rabbitTarget = totalPoints < 75 ? 100 : Math.ceil((totalPoints + 25) / 25) * 25`
- **Removed:** `rival` object `{ label: 'Rabbit', points, gap, tip }` from both response paths (user not found + success)
- **Kept:** totalPoints, breakdown, recent, actor – no rabbit/rival in response

### ScoreClient.tsx
- **Changed:** `const target = rabbitTarget && rabbitTarget > 0 ? rabbitTarget : totalPoints + 500`
- **To:** `const target = rabbitTarget && rabbitTarget > 0 ? rabbitTarget : (nextRankThreshold ?? 500)`
- **Effect:** Fallback when rabbitTarget is null now uses `nextRankThreshold` (from deepquill) or constant 500; no local computation

---

## UI Areas Affected

| Area | Impact |
|------|--------|
| **CurrentScoreButton** | None – only uses `totalPoints` from `/api/points`; rival was never consumed |
| **ScoreClient (contest score page)** | Rabbit meter fallback now uses deepquill `nextRankThreshold` instead of `totalPoints + 500` |
| **GET /api/points** | Response no longer includes `rival`; consumers that only used `totalPoints` unaffected |

---

## Confirmation: Single Rabbit System

| Source | Status |
|--------|--------|
| **Deepquill** | Canonical – rabbitTarget, rabbitSeq, nextRankThreshold from points/me and rabbit/catch |
| **rabbit/state** | Proxy to points/me – passes through deepquill values |
| **rabbit/catch** | Proxy to deepquill – no local logic |
| **me/score** | Proxy to points/me – passes through deepquill values |
| **api/points** | Rival/rabbit removed – no rabbit computation |
| **ScoreClient** | Uses useScore (rabbit/state) – fallback uses nextRankThreshold from deepquill |
| **lib/rabbit, lib/associate** | Not in active route path – legacy/dead for rabbit display |

**Result:** Only the canonical rabbit from deepquill exists for display and progression.
