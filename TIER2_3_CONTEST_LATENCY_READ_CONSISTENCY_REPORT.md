# Tier 2.3 Contest Latency / Read Consistency Refinement

**Objective:** Reduce stale or inconsistent contest reads after user actions, while preserving current architecture and UX.

**Completed:** 2025-03-21

---

## 1. Audit Summary

### Endpoints Audited

| Endpoint | Method | Canonical Source | Notes |
|---------|--------|------------------|-------|
| `/api/points/me` | GET | deepquill points/me | Full payload: total, rabbitTarget, rabbitSeq, nextRankThreshold, dailyShares, etc. |
| `/api/points` | GET | **Local agnes-next** | Used Purchase, Event from agnes-next Prisma — **stale vs deepquill** |
| `/api/contest/score` | GET | deepquill contest/score | Supports session_id for post-checkout; returns totalPoints |
| `/api/rabbit/state` | GET | Proxies to points/me | Maps total→points |
| `/api/me/score` | GET | Proxies to points/me | Maps total→totalPoints; no current client consumers |

### Client Read Paths (Score Page)

| Consumer | Path | Issue |
|----------|------|-------|
| `useScore(contestEmail)` | rabbit/state → points/me | **Duplicate**: Same data as refreshPoints |
| `refreshPoints()` | points/me | Canonical full payload |
| `CurrentScoreButton` | /api/points?sessionId= | **Stale**: Local agnes-next calc, not deepquill |

### Post-Write Behavior

| Action | Before | After |
|--------|--------|-------|
| `awardShare` | refreshPoints + refreshScore (2 fetches) | refreshPoints only (1 fetch) |
| Rabbit catch | applyScore + refreshScore | setData (optimistic) + refreshPoints |

---

## 2. Issues Found

### 2.1 Duplicate Fetches on Mount (ScoreClient)

- **Before:** `useScore` and `refreshPoints` both ran on mount.
- **Impact:** Two requests to the same canonical data (points/me via rabbit/state and points/me direct).
- **Fix:** Single read path via `refreshPoints`; removed `useScore` from ScoreClient.

### 2.2 Redundant Post-Write Fetches

- **Before:** After `awardShare`, both `refreshPoints` and `refreshScore` were called.
- **Impact:** Two identical reads after one write.
- **Fix:** Only `refreshPoints` is called.

### 2.3 Stale Read: CurrentScoreButton

- **Before:** `GET /api/points?sessionId=` used agnes-next local Prisma (Purchase, Event).
- **Impact:** Post-checkout score could be stale or inconsistent with deepquill ledger.
- **Fix:** Switched to `GET /api/contest/score?session_id=` (canonical deepquill).

### 2.4 Inconsistent Field Mapping

- **rabbit/state:** Maps `total` → `points`
- **me/score:** Maps `total` → `totalPoints`
- **points/me (direct):** Returns `total` as-is
- **Status:** Clients now use points/me directly where possible; rabbit/state and me/score remain for legacy consumers (useScore hook, external callers).

### 2.5 Unnecessary Parallel Endpoints

- **rabbit/state** and **me/score** both proxy to points/me with different field names.
- **Status:** Kept for compatibility; ScoreClient no longer uses rabbit/state (useScore removed from score page).

---

## 3. Files Changed

| File | Change |
|------|--------|
| `agnes-next/src/app/contest/CurrentScoreButton.tsx` | Switched fetch from `/api/points?sessionId=` to `/api/contest/score?session_id=` for canonical deepquill read |
| `agnes-next/src/app/contest/score/ScoreClient.tsx` | Removed useScore; single read via refreshPoints; extended PointsPayload with rabbitTarget, rabbitSeq, nextRankThreshold; removed duplicate refreshScore after awardShare; rabbit catch uses setData + refreshPoints |

---

## 4. Files Verified Clean

| File | Verification |
|------|---------------|
| `agnes-next/src/app/api/points/me/route.ts` | Proxy-only to deepquill; no local calc |
| `agnes-next/src/app/api/contest/score/route.ts` | Proxy-only to deepquill |
| `agnes-next/src/app/api/rabbit/state/route.ts` | Proxy to points/me; no local calc |
| `agnes-next/src/app/api/me/score/route.ts` | Proxy to points/me; no local calc |
| `agnes-next/src/hooks/useScore.ts` | Unchanged; still used by other components if any (currently only ScoreClient used it; now unused by ScoreClient) |
| `agnes-next/src/app/badge/BadgeClient.tsx` | Uses points/me directly; no change needed |

---

## 5. What Was Standardized

| Area | Before | After |
|------|--------|-------|
| Score page initial load | 2 fetches (rabbit/state + points/me) | 1 fetch (points/me) |
| Score page after awardShare | 2 fetches | 1 fetch |
| CurrentScoreButton post-checkout | Local /api/points (agnes-next Prisma) | Canonical /api/contest/score (deepquill) |
| Rabbit catch success | applyScore + refreshScore | Optimistic setData + refreshPoints |
| Score/rabbit fields | Split across useScore + data | Single `data` from points/me |

---

## 6. Remaining Known Limitations

| Limitation | Severity | Notes |
|------------|----------|-------|
| `/api/points` (GET) still uses local Prisma | Low | CurrentScoreButton no longer uses it; route may be dead for contest flows. Other consumers (if any) would get agnes-next-local data. |
| `me/score` endpoint | Low | No client consumers in agnes-next; kept for external/legacy use. |
| `useScore` hook | Low | Only ScoreClient used it; hook remains for possible future use. |
| Rabbit/state proxy | Low | Still used if any component calls it; ScoreClient no longer does. |
| points/me requires X-User-Email or cookies | Info | ScoreClient passes X-User-Email; contest/score supports session_id when no principal. |

---

## 7. UX Preserved

- Score page behavior unchanged.
- CurrentScoreButton visibility and celebration logic unchanged.
- Rabbit catch flow unchanged.
- Share award flow unchanged.
- No UI or UX redesign.
