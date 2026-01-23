# Root Cause Analysis: /the-protocol-challenge Route Failure

## Step 1: Proof of Route Failure ✅

**Build Error:**
```
Module not found: Can't resolve '@/lib/identity/clearIdentity'
```

**Location:** `agnes-next/src/app/the-protocol-challenge/page.tsx:5`

**Import Statement:**
```typescript
import { clearIdentityStorage } from '@/lib/identity/clearIdentity';
```

**Status:** Route **IS BROKEN** - hard compile failure prevents route from building.

---

## Step 2: Splitter Location ✅

**Primary Splitter (Client-Side):**
- **File:** `deepquill/src/App.jsx`
- **Function:** `chooseVariant()` from `deepquill/src/lib/abSplit.js`
- **Logic:** 
  - Checks URL param `?entry=protocol|terminal` (override)
  - Checks cookie `entry_variant` (24h persistence)
  - Checks localStorage (fallback)
  - Random 50/50 split if no existing variant
  - **Redirects to:** `window.location.href = ${nextBase}/the-protocol-challenge` when variant is 'protocol'

**Secondary Splitter (Server-Side):**
- **File:** `agnes-next/src/middleware.ts`
- **Function:** `getEntryVariant()` and `middleware()`
- **Logic:**
  - Checks URL param `?entry=terminal|protocol` (override)
  - Checks cookie `dq_entry_variant` (30 days)
  - Random 50/50 split if no existing variant
  - **Redirects to:** `/the-protocol-challenge` when variant is 'protocol'

**Note:** Both splitters exist but serve different entry points (deepquill root vs agnes-next root).

---

## Step 3: Splitter Behavior Analysis (Theoretical)

**Expected Behavior:**
- Splitter should route 50% to terminal, 50% to protocol
- Protocol variant redirects to `/the-protocol-challenge`

**Actual Behavior (Inferred):**
- Splitter logic is **still functional** (no errors in splitter code)
- However, when splitter redirects to `/the-protocol-challenge`, the route **fails to build/load**
- This causes a **fail-open scenario**:
  - If redirect happens client-side (deepquill), browser may show error page or fallback
  - If redirect happens server-side (middleware), Next.js may show 500 error or fallback to terminal
  - **Effective traffic:** ~100% IBM terminals (because protocol route is broken)

**Failover Mechanism:**
- Client-side (deepquill): Error in redirect target → browser shows error, user may manually navigate
- Server-side (middleware): Next.js build failure → route doesn't exist → likely returns 404/500
- **No intentional fallback** - the splitter doesn't catch route errors

---

## Step 4: Git History Analysis ✅

**Commit:** `ed805d3` - "Decouple emails from points; add guardrail messaging; scope unmute overlay"

**Change:**
- Added import: `import { clearIdentityStorage } from '@/lib/identity/clearIdentity';`
- **Problem:** File `@/lib/identity/clearIdentity.ts` was **never created**
- **Reality:** `clearIdentityStorage` function exists in `@/lib/identity.ts` (line 187)

**Other Files Using Correct Import:**
- `agnes-next/src/app/contest/page.tsx:18` correctly imports: `import { clearIdentityStorage } from '@/lib/identity';`

**Root Cause:** Copy-paste error or incorrect import path assumption when adding the import.

---

## Step 5: Root Cause Statement

### Is /the-protocol-challenge broken?
**YES** - Hard compile failure due to missing module import.

**Why:**
- Import path `@/lib/identity/clearIdentity` points to non-existent file
- Function `clearIdentityStorage` actually exists in `@/lib/identity.ts`
- Next.js cannot build the route, causing it to fail at compile time

### Is splitter still sending 50/50?
**YES** - Splitter logic is intact and functional.

**Why:**
- No errors in `deepquill/src/lib/abSplit.js` or `deepquill/src/App.jsx`
- No errors in `agnes-next/src/middleware.ts`
- Random selection logic (`Math.random() < 0.5`) is unchanged
- Cookie/localStorage persistence logic is unchanged

### If splitter "fails open," explain the mechanism:

**Client-Side Splitter (deepquill):**
- When variant is 'protocol', executes: `window.location.href = '${nextBase}/the-protocol-challenge'`
- Browser navigates to broken route
- Next.js dev server shows build error overlay OR browser shows 404/500
- **No automatic fallback** - user sees error page

**Server-Side Splitter (middleware):**
- When variant is 'protocol', executes: `NextResponse.redirect('/the-protocol-challenge')`
- Next.js tries to serve route
- Route fails to build → Next.js returns 500 error or shows error overlay
- **No automatic fallback** - middleware doesn't catch route build failures

**Effective Result:**
- Splitter **attempts** to send 50% to protocol
- Protocol route **fails to load** (build error)
- Users see error page instead of protocol challenge
- **Effective traffic:** ~0% protocol (because route is broken), ~50% terminal (the half that works), ~50% error pages

---

## Step 6: Minimum Fix Proposal

### Fix 1: Correct Import Path (Required)

**File:** `agnes-next/src/app/the-protocol-challenge/page.tsx`

**Change:**
```typescript
// BEFORE (line 5):
import { clearIdentityStorage } from '@/lib/identity/clearIdentity';

// AFTER:
import { clearIdentityStorage } from '@/lib/identity';
```

**Rationale:**
- Function exists in `@/lib/identity.ts`
- Other files (contest/page.tsx) use this correct import
- Single-line change, minimal risk

### Verification Steps:
1. Fix import path
2. Run `npm run build` - should succeed
3. Test route: `http://localhost:3002/the-protocol-challenge` - should load
4. Test splitter: Visit `http://localhost:5173` (deepquill) - should redirect protocol variant correctly
5. Test override: `http://localhost:5173?entry=protocol` - should redirect to protocol challenge

### Expected Outcome:
- Route builds successfully
- Splitter can successfully redirect to protocol route
- 50/50 split becomes functional again
- No other changes needed

---

## Summary

**Root Cause:** Incorrect import path introduced in commit `ed805d3` - file `@/lib/identity/clearIdentity` doesn't exist, function is in `@/lib/identity.ts`.

**Impact:** Protocol route is completely broken, causing 50% of splitter traffic to fail.

**Fix:** Single-line import path correction.

**Risk:** Very low - correcting import to match existing pattern used elsewhere in codebase.
