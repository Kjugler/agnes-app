# Terminal + Signal Events Analysis

## Executive Summary

| Issue | Root Cause | Immediate Fix |
|-------|------------|---------------|
| **Terminal 503** | Vite terminal app not running; proxy expects it at `localhost:5173` | Run `cd deepquill && npm run dev` (alongside `npm run start-server`) |
| **signal/events 404** | Deepquill route order fixed in code; server may need restart | Restart deepquill `start-server` to load the route change |

---

## 1. What Currently Powers the IBM Terminal Experience?

### Exact Files

| Role | Path |
|------|------|
| **Terminal UI (Vite app)** | `deepquill/src/App.jsx`, `deepquill/src/main.jsx`, `deepquill/index.html` |
| **Terminal components** | `deepquill/src/components/TerminalEmulator.css`, `deepquill/src/components/GlitchIntro.jsx`, `deepquill/src/components/EmailModal.jsx` |
| **Vite config** | `deepquill/vite.config.js` |
| **Proxy route** | `agnes-next/src/app/terminal-proxy/[[...path]]/route.ts` |
| **Entry pages** | `agnes-next/src/app/lightening/LighteningClient.tsx` (routes to `/terminal-proxy`), `agnes-next/src/app/terminal/page.tsx` (iframe to `/terminal-proxy`) |

### Service / Process

- **Vite dev server**: `cd deepquill && npm run dev` — serves the React terminal app
- **Default port**: 5173 (Vite default)
- **Env override**: `NEXT_PUBLIC_TERMINAL_URL` in agnes-next (not in .env.example)

### Base URL Expected by /terminal-proxy

```
VITE_TERMINAL_URL = process.env.NEXT_PUBLIC_TERMINAL_URL || 'http://localhost:5173'
```

The proxy fetches from this URL. If nothing is listening, `fetch()` gets `ECONNREFUSED` → 503.

---

## 2. Is the Terminal Still Dependent on the Old Vite App?

**Yes.** The terminal is fully dependent on the Vite app in `deepquill`.

### Command to Start It

```bash
cd deepquill && npm run dev
```

This starts Vite on port 5173. The terminal-proxy then forwards requests there.

### What's Missing

If only `deepquill` `npm run start-server` (Express on 5055) is running, the Vite terminal app is **not** running. You need **both**:

1. `npm run start-server` — Express API (contest, signals, etc.)
2. `npm run dev` — Vite terminal UI

---

## 3. Fastest Safe Dev Fix (Right Now)

Run three processes:

```bash
# Terminal 1: agnes-next
cd agnes-next && npm run dev

# Terminal 2: deepquill Express API
cd deepquill && npm run start-server

# Terminal 3: deepquill Vite terminal
cd deepquill && npm run dev
```

Or use a process manager (e.g. `concurrently`) to run all three.

Also restart deepquill `start-server` so the `/api/signal/events` route order change takes effect.

---

## 4. Recommended Long-Term Architecture

**Migrate the terminal into agnes-next.**

### Why Migrate

| Factor | Separate Vite | Migrated to agnes-next |
|--------|---------------|------------------------|
| **Dev setup** | 3 processes | 2 processes |
| **Deployment** | Need Vite build + static hosting | Single Next.js app |
| **CORS/cookies** | Cross-origin issues | Same origin |
| **Path rewriting** | Complex proxy logic | Not needed |
| **Maintenance** | Two frontends | One frontend |

### Why Keep Separate (If You Don’t Migrate)

- Terminal has its own build/deploy pipeline
- Want to reuse the Vite app in other projects
- Migration risk is too high right now

---

## 5. Migration Scope (If Recommended)

### Implementation Scope

1. Move terminal React components from `deepquill/src` into `agnes-next` (e.g. `app/terminal-emulator/`)
2. Replace Vite-specific setup with Next.js patterns (no `@vite/client`, etc.)
3. Remove `terminal-proxy` and serve the terminal as a normal Next.js page
4. Update routing: `/lightening` → `/terminal` (Next page) instead of `/terminal-proxy`
5. Keep API calls to agnes-next `/api/*` routes (no path rewriting)

### Files / Routes Involved

| Action | Path |
|--------|------|
| **Copy/migrate** | `deepquill/src/App.jsx` → agnes-next page or layout |
| **Copy/migrate** | `deepquill/src/components/TerminalEmulator.css` |
| **Copy/migrate** | `deepquill/src/components/GlitchIntro.jsx` |
| **Copy/migrate** | `deepquill/src/components/EmailModal.jsx` |
| **Remove** | `agnes-next/src/app/terminal-proxy/[[...path]]/route.ts` |
| **Update** | `agnes-next/src/app/lightening/LighteningClient.tsx` — route to `/terminal` instead of `/terminal-proxy` |
| **Update** | `agnes-next/src/app/terminal/page.tsx` — render terminal in-page instead of iframe to proxy |

### Risk

- **Medium**: Terminal logic (phases, email flow, TerminalDiscovery) must behave the same
- Possible differences in styling (Tailwind v4 vs agnes-next stack)
- Need to test: email submit, contest login, redirects, cookie behavior

### Estimated Effort

- 1–2 days for migration and parity testing
- Extra time for edge cases and styling adjustments

---

## 6. GET /api/signal/events 404

### Current State

- **agnes-next** has `src/app/api/signal/events/route.ts` — proxies to deepquill
- **deepquill** has `GET /signal/events` defined **before** `GET /signal/:id` in `signals.cjs` (route order fixed)

### Why It Still 404s

Most likely: **deepquill `start-server` not restarted** after the route order change. The old process could still be using the previous router setup where `/:id` matched first.

### Verifying

1. Restart deepquill: `cd deepquill && npm run start-server`
2. Call directly: `curl http://localhost:5055/api/signal/events`
3. If that returns 200, the proxy 404 was from the old server

### If Still 404

- Confirm `DEEPQUILL_URL` in agnes-next points at the running deepquill instance (e.g. `http://localhost:5055`)
- Confirm deepquill signals router is mounted at `/api`

### Restore vs Remove

**Restore.** The route is used by `RibbonTicker` on the Signal Room page. The fix (route order in deepquill) is already in code; it just needs a server restart. No need to remove the route or the RibbonTicker usage.

---

## Exact Next Steps

1. **Terminal 503**
   - Run `cd deepquill && npm run dev` in a separate terminal so the Vite app listens on 5173.
   - Confirm `/terminal-proxy?v=terminal&embed=1&skipLoad=1` loads.

2. **signal/events 404**
   - Restart deepquill: `cd deepquill && npm run start-server`.
   - Confirm `GET /api/signal/events` returns 200 from agnes-next.

3. **Long-term**
   - Plan migration of the terminal into agnes-next and remove the Vite dependency.
   - Track as a separate task/PR.
