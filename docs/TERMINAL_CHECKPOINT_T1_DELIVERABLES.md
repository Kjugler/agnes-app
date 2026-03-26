# Checkpoint T1: IBM Terminal Migration — Deliverables

**Status:** Complete (terminal migration implemented)

---

## 1. Files Changed

### New Files Added

| File | Purpose |
|------|---------|
| `agnes-next/src/app/api/subscribe/route.ts` | Proxy POST /api/subscribe → deepquill |
| `agnes-next/src/lib/terminal/subscribeEmail.ts` | subscribeEmail() using /api/subscribe (same-origin) |
| `agnes-next/src/components/terminal/TerminalEmulator.tsx` | Main terminal UI, phase state machine |
| `agnes-next/src/components/terminal/TerminalEmulator.css` | Full IBM terminal + mobile styles |
| `agnes-next/src/components/terminal/TerminalClient.tsx` | GlitchIntro, LoadingScreen, TerminalEmulator orchestration |
| `agnes-next/src/components/terminal/EmailModal.tsx` | Email capture, contest login, subscribe |
| `agnes-next/src/components/terminal/GlitchIntro.tsx` | "THE AGNES PROTOCOL" glitch intro |
| `agnes-next/src/components/terminal/LoadingScreen.tsx` | "AGNES PROTOCOL" typing animation |
| `agnes-next/src/components/terminal/MobileInputModal.tsx` | Mobile secret code input |
| `agnes-next/src/components/terminal/JodyAssistantTerminal.tsx` | Terminal-specific Jody em1/em2 variant |

### Files Modified

| File | Change |
|------|--------|
| `agnes-next/src/app/terminal/page.tsx` | Replaced iframe with direct TerminalClient render |
| `agnes-next/src/app/lightening/LighteningClient.tsx` | Terminal URL: `/terminal-proxy` → `/terminal` |
| `agnes-next/src/app/entry/EntryClient.tsx` | Terminal URL: `/terminal-proxy/` → `/terminal` |
| `agnes-next/src/styles/terminal.css` | Added `animate-blink`, `animate-loading-bar` keyframes |
| `agnes-next/src/app/signal-room/EditReviewModal.tsx` | Added missing `onSuccess` prop destructuring (pre-existing type fix) |
| `agnes-next/src/app/lightening/LighteningClient.tsx` | `ref` type annotation for params.get() (pre-existing type fix) |

---

## 2. Routes Added

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/subscribe` | POST | Proxy email subscription to deepquill |
| `/terminal` | GET | IBM terminal page (native Next.js, no iframe) |

**Note:** `terminal-proxy` route remains in place (unchanged, not removed).

---

## 3. Dependencies Added

| Package | Version | Purpose |
|---------|---------|---------|
| `react-terminal-ui` | ^1.4.0 | Terminal component (Terminal, ColorMode, TerminalOutput) |

---

## 4. Env Changes

**None required.** Existing `DEEPQUILL_URL` / `NEXT_PUBLIC_API_BASE_URL` (for deepquill proxy) is used by `/api/subscribe`. No new env vars added. `NEXT_PUBLIC_TERMINAL_URL` is **not** removed (Checkpoint T2).

---

## 5. Test Checklist: Terminal Behavior in agnes-next

### Prerequisites

- agnes-next: `npm run dev` (port 3002)
- deepquill API: `npm run start-server` (port 5055)
- **Vite dev server (port 5173) NOT required**

### 5.1 Entry Flow

| # | Action | Expected |
|---|--------|----------|
| 1 | Visit `/lightening` | Lightning video plays |
| 2 | Click Continue (or let video end) with `v=terminal` | Redirects to `/terminal?embed=1&skipLoad=1&v=terminal` |
| 3 | Visit `/lightening?v=terminal` then Continue | Same as above |
| 4 | Visit `/entry?v=terminal` | Entry glitch → redirect to `/terminal?...` (terminal variant) |
| 5 | Visit `/entry?v=protocol` | Entry glitch → redirect to `/the-protocol-challenge?...` (unchanged) |

### 5.2 Terminal UI

| # | Action | Expected |
|---|--------|----------|
| 6 | Land on `/terminal?embed=1&skipLoad=1` (first time) | GlitchIntro "THE AGNES PROTOCOL" plays once |
| 7 | Reload same URL | GlitchIntro skipped (localStorage `dq_seen_terminal_intro`) |
| 8 | Land on `/terminal` (no params) | LoadingScreen "AGNES PROTOCOL" then TerminalEmulator |
| 9 | Terminal shows intro lines | "VERIFYING SECURITY ID...", "Accessing Agnes Protocol Layer: REDACTED", etc. |
| 10 | Typing wrong code | "You weren't ready..." on first try, "Most never make it..." on second |
| 11 | Typing `#whereisjodyvernon` or `where is jody vernon` | "Access Granted.", "authenticating...", phase → terminal2 |
| 12 | Phase terminal2 | Download progress bar, then EmailModal |
| 13 | JodyAssistant (em1) | Icon, bubbles (Hi! I think I can help., #WhereIsJodyVernon), DeepQuill image cycle |

### 5.3 Email Modal & APIs

| # | Action | Expected |
|---|--------|----------|
| 14 | Submit email in EmailModal | POST /api/subscribe (proxied), POST /api/contest/login (proxied) |
| 15 | Successful login | Redirect to `/contest?email=...&v=terminal` |
| 16 | JodyAssistant (em2) in EmailModal | "Wondering if you should enter your email?" bubble |

### 5.4 Mobile

| # | Action | Expected |
|---|--------|----------|
| 17 | Resize to mobile width (≤520px) or `?mobile=1` | `mobile-terminal` class on body, mobile secret modal, NEXT button |
| 18 | Mobile: NEXT during intro | Skips to hint, shows secret modal |
| 19 | Mobile: Submit secret in modal | Same as desktop secret entry |
| 20 | Mobile: SIMPLE/FULL toggle | Reduces terminal output to last 6 lines (simple) |

### 5.5 Assets & Styling

| # | Action | Expected |
|---|--------|----------|
| 21 | Jody icons | `/jody-icons/jody-em1.png`, etc. resolve (from `public/`) |
| 22 | Terminal 2 theme | IBM green (#00ff66) on black, no rounded corners |
| 23 | Cursor | White block cursor, blink animation |

### 5.6 Regressions (Must Not Break)

| # | Check | Expected |
|---|-------|----------|
| 24 | Visit `/contest` | Contest page loads |
| 25 | Visit `/the-protocol-challenge` | Protocol challenge loads |
| 26 | Signal Room | Signal list, detail, create, edit work |
| 27 | `/terminal-proxy` | Still works (Vite fallback if Vite running) |

---

## 6. Not Done in T1 (Reserved for T2)

- Remove `terminal-proxy` route
- Remove terminal-proxy middleware handling
- Remove terminal-specific deepquill/Vite code
- Remove `NEXT_PUBLIC_TERMINAL_URL` and related config
