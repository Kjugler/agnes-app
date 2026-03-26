# IBM Terminal Migration Plan: Vite (deepquill) → agnes-next

**Objective:** Eliminate dependency on Vite dev server (port 5173), remove terminal-proxy, and run the IBM terminal directly inside agnes-next.

**Goal:** After migration, the system runs with:
- **agnes-next** (UI + terminal) — port 3002
- **deepquill** (API only) — port 5055

No Vite, no proxy.

---

## 1. Exact Files to Move (Paths and Purpose)

### 1.1 Core Terminal Components (from `deepquill/src/`)

| Source Path | Destination Path | Purpose |
|-------------|------------------|---------|
| `deepquill/src/components/TerminalEmulator.jsx` | `agnes-next/src/components/terminal/TerminalEmulator.tsx` | Main terminal UI, phase state machine, react-terminal-ui |
| `deepquill/src/components/TerminalEmulator.css` | `agnes-next/src/components/terminal/TerminalEmulator.css` | IBM green-on-black terminal styling |
| `deepquill/src/components/EmailModal.jsx` | `agnes-next/src/components/terminal/EmailModal.tsx` | Email capture + contest login, subscribe flow |
| `deepquill/src/components/GlitchIntro.jsx` | `agnes-next/src/components/terminal/GlitchIntro.tsx` | "THE AGNES PROTOCOL" glitch intro (plays once) |
| `deepquill/src/components/LoadingScreen.jsx` | `agnes-next/src/components/terminal/LoadingScreen.tsx` | "AGNES PROTOCOL" typing animation |
| `deepquill/src/components/MobileInputModal.jsx` | `agnes-next/src/components/terminal/MobileInputModal.tsx` | Mobile secret code input modal |

### 1.2 JodyAssistant

| Source Path | Destination Path | Purpose |
|-------------|------------------|---------|
| `deepquill/src/components/JodyAssistant.jsx` | `agnes-next/src/components/terminal/JodyAssistantTerminal.tsx` | Terminal-specific em1/em2 phase behavior. **Note:** agnes-next already has `JodyAssistant.tsx` (share pages). Use deepquill version for terminal (different em1 phase logic). |

### 1.3 API & Logic

| Source Path | Destination Path | Purpose |
|-------------|------------------|---------|
| `deepquill/src/api/subscribeEmail.js` | `agnes-next/src/lib/terminal/subscribeEmail.ts` | Subscribe email via API; will use relative `/api/subscribe` |
| `deepquill/src/lib/abSplit.js` | **Do NOT move** | Only used by Vite App.jsx for direct-entry A/B split. Lightening flow already does variant routing; no AB split needed for `/terminal`. |

### 1.4 Styles

| Source Path | Destination Path | Purpose |
|-------------|------------------|---------|
| `deepquill/src/index.css` (relevant parts) | Merge into `agnes-next/src/styles/terminal.css` | `.reveal`, `.reveal.visible`, `animate-blink`, `animate-loading-bar` |
| `deepquill/src/components/RevealOnScroll.jsx` | `agnes-next/src/components/terminal/RevealOnScroll.tsx` | Used by Home.jsx; Home is trivial (wraps TerminalEmulator only), so we can inline TerminalEmulator and skip RevealOnScroll unless needed |

**Note:** `deepquill/src/App.css` is empty. `deepquill/src/components/sections/Home.jsx` only wraps `<TerminalEmulator />`; no need to move Home separately.

### 1.5 Jody Icons

| Location | Action |
|----------|--------|
| `agnes-next/public/jody-icons/*` | Already present (per .gitignore). Ensure all icons from deepquill exist: `jody-em1.png`, `jody-em2.png`, `jody-fb.png`, `jody-ig.png`, `jody-tiktok.png`, `jody-truth.png`, `jody-ascension.png`, `jody-deepquill-post.png` |

---

## 2. Vite-Specific Dependencies to Replace

### 2.1 Runtime Dependencies (add to agnes-next)

| Package | Version | Purpose |
|---------|---------|---------|
| `react-terminal-ui` | `^1.4.0` | Terminal component used by TerminalEmulator |

```bash
cd agnes-next && npm install react-terminal-ui
```

### 2.2 Environment / Meta

| Vite | Next.js Replacement |
|------|---------------------|
| `import.meta.env?.VITE_AGNES_BASE_URL` | Remove. Use `window.location.origin` (same-origin when terminal is in agnes-next). |
| `import.meta.env?.VITE_*` | `process.env.NEXT_PUBLIC_*` for any client-side env. |
| `window.__API_BASE__` (debug) | Remove or use `process.env.NEXT_PUBLIC_API_BASE_URL`. |

### 2.3 Code Changes

- **EmailModal:** Remove `isTerminalProxy` checks; use relative paths `/api/contest/login`, `/api/track`, `/api/subscribe` (same origin).
- **subscribeEmail:** Change base from `http://localhost:5055` to relative `/api/subscribe` (agnes-next will proxy to deepquill).
- **JodyAssistant (terminal):** Paths like `/jody-icons/...` already work from agnes-next `public/`.

---

## 3. Required Changes for Next.js Compatibility

### 3.1 Client Components

All moved components use hooks (`useState`, `useEffect`), browser APIs (`window`, `localStorage`), or event handlers. Add `'use client'` at the top of:

- `TerminalEmulator.tsx`
- `EmailModal.tsx`
- `GlitchIntro.tsx`
- `LoadingScreen.tsx`
- `MobileInputModal.tsx`
- `JodyAssistantTerminal.tsx`
- `RevealOnScroll.tsx` (if moved)

### 3.2 React 19 Compatibility

- agnes-next uses React 19. Deepquill uses React 18. `react-terminal-ui` should be compatible; test for deprecation warnings.
- Replace default exports with named exports if preferred; both work in Next.js.

### 3.3 CSS Imports

- Import `TerminalEmulator.css` in `TerminalEmulator.tsx` (or in the terminal page layout).
- Merge `index.css` utility classes (`.reveal`, `animate-blink`, etc.) into `agnes-next/src/styles/terminal.css` or `globals.css`.

### 3.4 TypeScript

- Convert `.jsx` → `.tsx`. Add types for props and state; use `any` sparingly for rapid migration.
- `subscribeEmail.ts`: `(email: string, opts?: { apiBase?: string }) => Promise<...>`.

---

## 4. New Route in agnes-next

### 4.1 Route Structure

| Route | Purpose |
|-------|---------|
| `/terminal` | IBM terminal page (replaces terminal-proxy). Accepts `?embed=1&skipLoad=1&v=terminal&ref=...&email=...`. |
| `/ibm-terminal` (optional) | Redirect to `/terminal` for backward compatibility with share links (`TERMINAL_ENTRY_PATH`). |

### 4.2 Page Layout

```
agnes-next/src/app/terminal/
├── page.tsx          # Server component: layout wrapper
├── TerminalClient.tsx # Client component: GlitchIntro, LoadingScreen, TerminalEmulator
```

**TerminalClient logic (from deepquill App.jsx embed flow):**

1. Read `?embed=1`, `?skipLoad=1` from URL.
2. If embed: skip A/B split, show terminal.
3. GlitchIntro: if `localStorage.dq_seen_terminal_intro !== 'true'`, show once, then set.
4. LoadingScreen: if `!skipLoad`, show until complete.
5. Render `TerminalEmulator` when ready.

### 4.3 Entry Flow Updates

| Current | After Migration |
|---------|------------------|
| `/lightening` → Continue (variant=terminal) → `/terminal-proxy?embed=1&skipLoad=1&...` | → `/terminal?embed=1&skipLoad=1&...` |
| `/entry` (variant=terminal) → `/terminal-proxy/?...` | → `/terminal?embed=1&skipLoad=1&...` |
| `/terminal` page (iframe to `/terminal-proxy`) | Render terminal in-page (no iframe). |
| Share link `TERMINAL_ENTRY_PATH` = `/ibm-terminal` | Add redirect `/ibm-terminal` → `/terminal` or update `TERMINAL_ENTRY_PATH` to `/terminal`. |

---

## 5. What to Delete After Migration

### 5.1 agnes-next

| Item | Action |
|------|--------|
| `src/app/terminal-proxy/[[...path]]/route.ts` | **Delete** entire directory |
| `middleware.ts` | Remove terminal-proxy pass-through block (lines 54–61) |
| `src/app/terminal/page.tsx` | Replace iframe with direct `TerminalClient` render |

### 5.2 deepquill (Vite / Terminal)

| Item | Action |
|------|--------|
| `vite.config.js` | **Keep** if deepquill still uses Vite for other pages; **remove** if deepquill becomes API-only. |
| `deepquill/src/App.jsx` | **Keep** for now if deepquill serves other routes; **simplify or remove** when terminal is fully migrated. |
| `deepquill/src/components/sections/Home.jsx` | Can remove once terminal moved. |
| `deepquill/src/components/TerminalEmulator.jsx` | Remove after migration. |
| `deepquill/src/components/EmailModal.jsx` | Remove after migration. |
| `deepquill/src/components/GlitchIntro.jsx` | Remove after migration. |
| `deepquill/src/components/LoadingScreen.jsx` | Remove after migration. |
| `deepquill/src/components/MobileInputModal.jsx` | Remove after migration. |
| `deepquill/src/components/JodyAssistant.jsx` | Remove after migration (or keep if used elsewhere). |
| `deepquill/src/components/RevealOnScroll.jsx` | Remove if unused. |
| `deepquill/src/api/subscribeEmail.js` | Remove after migration. |
| `deepquill/package.json` | Remove `react-terminal-ui` if unused elsewhere. |
| `NEXT_PUBLIC_TERMINAL_URL` / `VITE_TERMINAL_URL` | Remove from env files. |

### 5.3 Env / Config

- Remove `NEXT_PUBLIC_TERMINAL_URL` (used only by terminal-proxy).
- Remove any `VITE_*` vars used solely by terminal.

---

## 6. New API Route: /api/subscribe

agnes-next does **not** currently have `/api/subscribe`. Add a proxy:

```
agnes-next/src/app/api/subscribe/route.ts
```

- **Method:** POST
- **Body:** `{ email: string }`
- **Logic:** Proxy to `deepquill /api/subscribe` using `proxyJson` from `@/lib/deepquillProxy`.
- **Purpose:** EmailModal `subscribeEmail()` will call `/api/subscribe` (same origin); agnes-next proxies to deepquill.

---

## 7. Step-by-Step Implementation Plan (Safe Order)

### Phase 1: Add Support Without Breaking Current Flow

1. **Add `react-terminal-ui` to agnes-next.**
   ```bash
   cd agnes-next && npm install react-terminal-ui
   ```

2. **Create `/api/subscribe` proxy** in agnes-next (same pattern as `contest/terminal-discovery`).

3. **Create `agnes-next/src/components/terminal/`** and copy/convert files:
   - TerminalEmulator.tsx (+ CSS)
   - EmailModal.tsx
   - GlitchIntro.tsx
   - LoadingScreen.tsx
   - MobileInputModal.tsx
   - JodyAssistantTerminal.tsx
   - subscribeEmail.ts

4. **Apply Next.js compatibility:**
   - Add `'use client'` to all client components.
   - Replace `import.meta.env` with `process.env.NEXT_PUBLIC_*` or `window.location.origin`.
   - Replace `subscribeEmail` base with `/api/subscribe`.
   - Remove `isTerminalProxy` logic; use relative paths.

5. **Merge utility CSS** (`.reveal`, `animate-blink`, etc.) into `agnes-next/src/styles/terminal.css` or `globals.css`.

6. **Create `TerminalClient.tsx`** with embed/skipLoad/GlitchIntro/LoadingScreen/TerminalEmulator logic.

7. **Create new `/terminal` page** that renders `TerminalClient` (alongside existing terminal-proxy route).

8. **Add `/terminal` as alternate route** — update LighteningClient and EntryClient to use a feature flag or env: e.g. `USE_NATIVE_TERMINAL=true` → route to `/terminal` instead of `/terminal-proxy`. This allows A/B testing before full cutover.

### Phase 2: Cutover and Cleanup

9. **Switch routing** — LighteningClient and EntryClient: change terminal URL from `/terminal-proxy?...` to `/terminal?...`.

10. **Update `/terminal` page** — Replace iframe with direct `TerminalClient` render.

11. **Add `/ibm-terminal` redirect** (optional) — middleware or page: `/ibm-terminal` → `/terminal` with query params preserved. Or update `TERMINAL_ENTRY_PATH` to `/terminal`.

12. **Delete terminal-proxy:**
    - Remove `src/app/terminal-proxy/[[...path]]/route.ts`.
    - Remove terminal-proxy pass-through from middleware.

13. **Clean up deepquill:**
    - Remove terminal components from deepquill (or leave as dead code initially).
    - If deepquill becomes API-only, remove Vite config and `npm run dev` (Vite) from deepquill scripts.

14. **Remove env vars:** `NEXT_PUBLIC_TERMINAL_URL`, any `VITE_TERMINAL_URL`.

### Phase 3: Verification

15. **Smoke test:**
    - `/lightening` → Continue (terminal) → `/terminal` loads.
    - Secret code, email modal, contest login, redirect to `/contest`.
    - `/api/subscribe`, `/api/contest/login`, `/api/track` all work (proxied to deepquill).
    - Jody icons load from `/jody-icons/*`.
    - Mobile flow (secret modal, NEXT button) works.

16. **Regression test:**
    - Signal Room, contest flows, protocol challenge unchanged.
    - No references to `terminal-proxy` or Vite port 5173.

---

## 8. Constraints (Preserved)

- **Signal Room:** No changes to Signal Room or contest flows.
- **Terminal behavior:** Phases (intro → terminal1 → terminal2 → lightning), email flow, redirects identical.
- **Styling:** IBM green-on-black, TerminalEmulator.css, terminal2-root unchanged.

---

## 9. Summary Checklist

| # | Task |
|---|------|
| 1 | Add `react-terminal-ui` to agnes-next |
| 2 | Add `/api/subscribe` proxy in agnes-next |
| 3 | Create `components/terminal/*` with converted components |
| 4 | Create `TerminalClient.tsx` |
| 5 | Create `/terminal` page |
| 6 | Update LighteningClient + EntryClient to route to `/terminal` |
| 7 | Update `/terminal` page (no iframe) |
| 8 | Add `/ibm-terminal` redirect (or update TERMINAL_ENTRY_PATH) |
| 9 | Delete terminal-proxy route and middleware references |
| 10 | Clean up deepquill terminal code and Vite (if API-only) |
| 11 | Remove `NEXT_PUBLIC_TERMINAL_URL` from env |
