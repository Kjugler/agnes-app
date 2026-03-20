# Deploy Baseline Restoration Plan

**Source commit:** `e8ae7b6` (Stress test centralization, contest entry nav fix, signals spec, training video audit)  
**Target:** Current working branch (preserving post-purchase, beta-cap work)

---

## 1. Exact Files in e8ae7b6 Defining the Deploy Baseline

| Concern | File(s) |
|---------|---------|
| **Root `/`** | `agnes-next/src/middleware.ts` |
| **`/entry`, `/start` aliases** | `agnes-next/src/middleware.ts` |
| **Lightening page** | `agnes-next/src/app/lightening/page.tsx`, `agnes-next/src/app/lightening/LighteningClient.tsx` |
| **3-way splitter** | `agnes-next/src/lib/entryVariant.ts` (resolveVariantClient, assignWeightedVariant) |
| **Terminal flow** | `agnes-next/src/app/terminal-proxy/[[...path]]/route.ts`, `agnes-next/src/app/terminal/page.tsx` |
| **Terminal completion cookie** | `agnes-next/src/lib/entryVariant.ts` (checks `terminal_discovery_complete`); set by terminal Vite app after API success |
| **Terminal-proxy** | `agnes-next/src/app/terminal-proxy/[[...path]]/route.ts` |
| **Terminal-discovery API** | `agnes-next/src/app/api/contest/terminal-discovery/route.ts` (proxies to deepquill) |
| **CinematicVideo** | `agnes-next/src/components/CinematicVideo.tsx` |
| **device.ts** | `agnes-next/src/lib/device.ts` (middleware imports `detectDevice`, `isBot`) |
| **Entry page** | `agnes-next/src/app/entry/page.tsx`, `agnes-next/src/app/entry/EntryClient.tsx` |
| **Deepquill terminal-discovery** | `deepquill/api/contest/terminalDiscovery.cjs`, `deepquill/server/index.cjs` (mount) |
| **Schema (terminal)** | `agnes-next/prisma/schema.prisma`, `deepquill/prisma/schema.prisma` (User.terminalDiscoveryAwarded, LedgerType.TERMINAL_DISCOVERY_BONUS) |

---

## 2. Current main vs e8ae7b6

| File | Status | Notes |
|------|--------|-------|
| `agnes-next/src/middleware.ts` | **Differs** | Current: root/start/entry → lightening (simplified). Missing: ngrok origin, terminal-proxy exclusions, device/share logic, ap_ref cookie |
| `agnes-next/src/app/lightening/page.tsx` | **Differs** | Current: inline YouTube client, always → contest. e8ae7b6: thin wrapper, imports LighteningClient |
| `agnes-next/src/app/lightening/LighteningClient.tsx` | **Missing** | Deleted on main |
| `agnes-next/src/lib/entryVariant.ts` | **Differs** | Current: terminal/protocol only, no contest, no resolveVariantClient, no setVariantCookieClient, no terminal_discovery_complete |
| `agnes-next/src/components/CinematicVideo.tsx` | **Missing** | Deleted on main |
| `agnes-next/src/app/terminal-proxy/[[...path]]/route.ts` | **Missing** | Deleted on main |
| `agnes-next/src/app/api/contest/terminal-discovery/route.ts` | **Missing** | Deleted on main |
| `agnes-next/src/app/terminal/page.tsx` | **Missing** | Deleted on main |
| `agnes-next/src/app/entry/page.tsx` | **Missing** | Deleted on main |
| `agnes-next/src/app/entry/EntryClient.tsx` | **Missing** | Deleted on main |
| `agnes-next/src/lib/device.ts` | **Missing** | Deleted on main |
| `agnes-next/src/styles/terminal.css` | **Missing** | Deleted on main (if used by terminal) |
| `deepquill/api/contest/terminalDiscovery.cjs` | **Missing** | Deleted on main |
| `deepquill/server/index.cjs` | **Differs** | Missing terminal-discovery mount |
| `agnes-next/prisma/schema.prisma` | **Differs** | Missing User.terminalDiscoveryAwarded |
| `deepquill/prisma/schema.prisma` | **Differs** | Missing User.terminalDiscoveryAwarded, LedgerType.TERMINAL_DISCOVERY_BONUS |
| `agnes-next/src/lib/shareAssets.ts` | **Partially matches** | Minor diff (x→ig videos, comments). Not critical for entry flow |
| `agnes-next/src/lib/shareHelpers.ts` | **Partially matches** | Used for share links; not critical for entry flow |

---

## 3. Recommended Restoration Method

**Use `git checkout e8ae7b6 -- <path>` for each file** where possible. This is safer than cherry-picking because:

- Cherry-picking e8ae7b6 would pull in unrelated changes (stress test, signals, etc.)
- File checkout restores only the deploy-baseline flow
- Post-purchase work lives in `deepquill/lib/postPurchaseSync.cjs`, `deepquill/api/stripe-webhook.cjs`, `agnes-next/src/app/api/track/route.ts` — none of these are in the checkout set

**Exception:** Schema files require manual merge to avoid dropping post-purchase fields (Order, Purchase, ReferralConversion, etc.).

---

## 4. Exact Restoration Commands

Run from repo root `c:\dev\agnes-app`.

### Phase A: agnes-next — checkout from e8ae7b6

```powershell
cd c:\dev\agnes-app

# Middleware (root, entry, start, terminal-proxy exclusions, ngrok, device)
git checkout e8ae7b6 -- agnes-next/src/middleware.ts

# Lightening: page wrapper + LighteningClient
git checkout e8ae7b6 -- agnes-next/src/app/lightening/page.tsx
git checkout e8ae7b6 -- agnes-next/src/app/lightening/LighteningClient.tsx

# Entry variant (3-way splitter, terminal_discovery_complete, setVariantCookieClient)
git checkout e8ae7b6 -- agnes-next/src/lib/entryVariant.ts

# CinematicVideo component
git checkout e8ae7b6 -- agnes-next/src/components/CinematicVideo.tsx

# Terminal-proxy route
git checkout e8ae7b6 -- agnes-next/src/app/terminal-proxy/[[...path]]/route.ts

# Terminal-discovery API (proxies to deepquill)
git checkout e8ae7b6 -- agnes-next/src/app/api/contest/terminal-discovery/route.ts

# Terminal page (iframe to terminal-proxy)
git checkout e8ae7b6 -- agnes-next/src/app/terminal/page.tsx

# Entry page + EntryClient
git checkout e8ae7b6 -- agnes-next/src/app/entry/page.tsx
git checkout e8ae7b6 -- agnes-next/src/app/entry/EntryClient.tsx

# device.ts (middleware dependency)
git checkout e8ae7b6 -- agnes-next/src/lib/device.ts

# terminal.css (if referenced)
git checkout e8ae7b6 -- agnes-next/src/styles/terminal.css
```

### Phase B: deepquill — checkout + server mount + dependencies

```powershell
# Prisma singleton (terminalDiscovery uses it)
git checkout e8ae7b6 -- deepquill/server/prisma.cjs

# Terminal discovery handler
git checkout e8ae7b6 -- deepquill/api/contest/terminalDiscovery.cjs

# normalize.cjs (terminalDiscovery uses it for email)
git checkout e8ae7b6 -- deepquill/src/lib/normalize.cjs

# Server mount: add terminal-discovery route (manual edit required — see below)
# Then apply terminalDiscovery adaptation (Section 7) to avoid recordLedger dependency
```

**Important:** `recordLedger.cjs` from e8ae7b6 expects Ledger to have `sessionId` and unique constraint `uniq_ledger_type_session_user`. Current schema has neither. **Recommended: Phase B Alternative** — use an adapted `terminalDiscovery.cjs` that uses `prisma.ledger.create` directly (no recordLedger). This avoids Ledger schema changes and matches postPurchaseSync style.

**Manual edit for `deepquill/server/index.cjs`:** Insert after `/api/ebook/download` (or wherever contest routes would go):

```javascript
// Terminal discovery bonus (SPEC 3: +250 pts for hidden path discovery)
const contestTerminalDiscoveryHandler = require('../api/contest/terminalDiscovery.cjs');
app.post('/api/contest/terminal-discovery', contestTerminalDiscoveryHandler);
console.log('✅ Mounted /api/contest/terminal-discovery');
```

**Phase B Alternative (recommended):** Skip `recordLedger.cjs`. Use an adapted `terminalDiscovery.cjs` that:
- Inlines `normalizeEmail` (or add `deepquill/src/lib/normalize.cjs` — it has no schema deps)
- Uses `prisma.ledger.create` and `prisma.user.update` directly (no recordLedger)
- Requires only: User.terminalDiscoveryAwarded, LedgerType.TERMINAL_DISCOVERY_BONUS

Commands for Phase B Alternative:
```powershell
git checkout e8ae7b6 -- deepquill/api/contest/terminalDiscovery.cjs
git checkout e8ae7b6 -- deepquill/src/lib/normalize.cjs
# Then edit terminalDiscovery.cjs: replace recordLedgerEntry call with prisma.ledger.create + prisma.user.update
# (see "terminalDiscovery adaptation" in Conflicts section)
```

### Phase C: Schema — manual merge (do NOT overwrite)

**agnes-next/prisma/schema.prisma:** Add to `User` model:

```prisma
terminalDiscoveryAwarded    Boolean               @default(false)
```

**agnes-next/prisma/schema.prisma:** Add to `LedgerType` enum:

```prisma
TERMINAL_DISCOVERY_BONUS
```

**deepquill/prisma/schema.prisma:** Same two additions.

**Migration:** Create and run migration for both schemas:

```powershell
cd agnes-next
npx prisma migrate dev --name add_terminal_discovery

cd ../deepquill
npx prisma migrate dev --name add_terminal_discovery
```

Or, if using shared DB, run migration once from agnes-next and ensure deepquill schema stays in sync.

### Phase D: Asset — Lightning.mp4

```powershell
git checkout e8ae7b6 -- agnes-next/public/videos/Lightning.mp4
```

**Path alignment:** LighteningClient uses `src="/videos/lightning.mp4"` (lowercase). The restored file is `Lightning.mp4` (capital L). On case-sensitive hosts (Vercel/Linux) this can 404. Fix:

```powershell
# Option 1: Rename to match LighteningClient
Move-Item agnes-next/public/videos/Lightning.mp4 agnes-next/public/videos/lightning.mp4

# Option 2: Or edit LighteningClient.tsx line with src= to use "/videos/Lightning.mp4"
```

---

## 5. Assets Required

| Asset | In e8ae7b6 | In current repo | Action |
|-------|------------|-----------------|--------|
| `agnes-next/public/videos/Lightning.mp4` | Yes | No | `git checkout e8ae7b6 -- agnes-next/public/videos/Lightning.mp4` then align path (see Phase D) |
| `agnes-next/public/videos/lightning.mp4` | N/A (capital L) | No | Use Lightning.mp4 and fix path or rename |

---

## 6. Smoke-Test Checklist

After restoration:

| # | Test | Expected |
|---|------|----------|
| 1 | Visit `http://localhost:3002` | Redirect to `/lightening` |
| 2 | Visit `http://localhost:3002/start` | Redirect to `/lightening` |
| 3 | Visit `http://localhost:3002/entry` | Redirect to `/lightening` |
| 4 | On lightening page: play video or click Continue | 3-way split: terminal, protocol, or contest (25/35/40 default) |
| 5 | In incognito: lightening → Continue | 3-way split (can land on terminal) |
| 6 | If terminal variant: `/terminal-proxy` loads | Vite terminal app (or 503 if Vite not running) |
| 7 | Complete terminal discovery, get points | API awards 250 pts; `terminal_discovery_complete` cookie set |
| 8 | With `terminal_discovery_complete` cookie: lightening → Continue | 2-way split only (protocol or contest), never terminal |
| 9 | kris.k.jugler@gmail.com (with cookie): lightening → Continue | 2-way split (protocol or contest) |
| 10 | Post-purchase: complete checkout | Order, Purchase, Ledger, ReferralConversion created (unchanged) |

---

## 7. terminalDiscovery Adaptation (Phase B Alternative)

If using Phase B Alternative, after `git checkout e8ae7b6 -- deepquill/api/contest/terminalDiscovery.cjs`, replace the `recordLedgerEntry` block with:

```javascript
// Replace: await recordLedgerEntry(prisma, { ... });
// With:
await prisma.$transaction([
  prisma.ledger.create({
    data: {
      userId: user.id,
      type: 'TERMINAL_DISCOVERY_BONUS',
      points: TERMINAL_BONUS_POINTS,
      note: 'Terminal Discovery Bonus',
    },
  }),
  prisma.user.update({
    where: { id: user.id },
    data: {
      terminalDiscoveryAwarded: true,
      points: { increment: TERMINAL_BONUS_POINTS },
    },
  }),
]);
```

Remove the `recordLedgerEntry` import. Keep `normalizeEmail` from `../../src/lib/normalize.cjs` (or inline it).

---

## 8. Conflicts to Avoid

- **Do not** overwrite `deepquill/lib/postPurchaseSync.cjs`
- **Do not** overwrite `deepquill/api/stripe-webhook.cjs`
- **Do not** overwrite `agnes-next/src/app/api/track/route.ts`
- **Do not** overwrite schema models: Order, Purchase, ReferralConversion, Customer, Event
- **Do not** overwrite `agnes-next/prisma/schema.prisma` fully — only add `terminalDiscoveryAwarded` and `TERMINAL_DISCOVERY_BONUS`

---

## 9. Deepquill Dependencies for terminalDiscovery.cjs

`terminalDiscovery.cjs` uses:

- `recordLedgerEntry` from `../../lib/ledger/recordLedger.cjs`
- `LedgerType.TERMINAL_DISCOVERY_BONUS` from Prisma
- `normalizeEmail` from `../../src/lib/normalize.cjs`

If `recordLedger.cjs` or `normalize.cjs` differ on main, verify compatibility or restore those from e8ae7b6 only if needed.
