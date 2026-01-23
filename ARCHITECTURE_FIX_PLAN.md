# Architecture Fix Plan

## Problem Identified

**Root Cause:** SQLite file locking when two Prisma engines (deepquill + agnes-next) access the same DB file simultaneously.

**Symptom:** "unable to open db" errors, crashes, table "missing" errors.

## Immediate Fix (Step A-C) ✅

### Step A — Revert agnes-next to Own DB

**Completed:**
- ✅ `agnes-next/.env` → `DATABASE_URL="file:./dev-next.db"`
- ✅ `agnes-next/.env.local` → `DATABASE_URL="file:./dev-next.db"`
- ✅ Killed node processes
- ✅ Cleared `.next` cache
- ✅ Regenerated Prisma client
- ✅ Running migrations

**Result:** agnes-next now uses its own DB, no file locking.

### Step B — Verify

**Check:**
```
http://localhost:3000/api/debug/prisma
```

**Expected:**
- `resolved_path` ends with `agnes-next\dev-next.db`
- `exists: true`
- `signal_table_exists: true`
- Tables populated

### Step C — Test Flow

**Test:**
1. `localhost:5173` → Terminal → email submit
2. Terminal 2 should work (no "unable to open db" errors)
3. `/api/contest/login` should succeed

---

## Long-Term Fix (Architecture Change)

### Goal: Single DB Without File Locking

**Architecture:**
- **deepquill** = Backend vault (owns Prisma + DB)
- **agnes-next** = Thin proxy layer (no Prisma, calls deepquill APIs)

### Implementation Plan

#### 1. Create Deepquill API Endpoints

**New endpoints in `deepquill/api/`:**
- `contest/login.cjs` - Handle contest login
- `signal/create.cjs` - Create signals
- `reviews/create.cjs` - Create reviews
- `points/me.cjs` - Get user points
- `associate/status.cjs` - Get associate status

#### 2. Convert agnes-next Routes to Proxies

**Files to update:**
- `agnes-next/src/app/api/contest/login/route.ts` → Proxy to `deepquill/api/contest/login`
- `agnes-next/src/app/api/signal/create/route.ts` → Proxy to `deepquill/api/signal/create`
- `agnes-next/src/app/api/reviews/create/route.ts` → Proxy to `deepquill/api/reviews/create`
- `agnes-next/src/app/api/points/route.ts` → Proxy to `deepquill/api/points/me`
- `agnes-next/src/app/api/associate/status/route.ts` → Proxy to `deepquill/api/associate/status`

#### 3. Remove Prisma from agnes-next

**After proxying:**
- Remove `@prisma/client` dependency (optional, but cleaner)
- Keep Prisma schema for type generation only (if needed)
- All DB operations happen in deepquill

### Benefits

✅ **No file locking** - Only one process touches DB
✅ **Single source of truth** - deepquill is the vault
✅ **Protected/hardened** - DB access centralized
✅ **Cleaner architecture** - Clear separation of concerns

---

## Migration Path

1. **Phase 1 (Now):** Revert to separate DBs (unblocked)
2. **Phase 2:** Create deepquill API endpoints
3. **Phase 3:** Convert agnes-next routes to proxies
4. **Phase 4:** Remove Prisma from agnes-next (optional)
5. **Phase 5:** Point agnes-next back to vault DB (but via proxies, not direct Prisma)

---

## Current Status

✅ **Immediate fix complete** - agnes-next using own DB
⏳ **Next:** Test flow to verify no crashes
⏳ **Then:** Implement proxy architecture
