# SPEC 1 — Entry Funnel Restructure (Lightning-First Architecture)
## Implementation Plan

---

## 1. Executive Summary

This plan restructures the entry funnel so **Lightning** (`/lightening`) becomes the single cinematic entry point. All user paths converge on the Contest Hub (`/contest`). The old intro (black screen → red "The Agnes Protocol" typing) is removed from the main flow but preserved for the secret unlock path.

---

## 2. Files and Routes to Change

### 2.1 Middleware (`agnes-next/src/middleware.ts`)

| Change | Description |
|--------|-------------|
| Root redirect | Change `pathname === '/'` from redirect to `/entry` → redirect to `/lightening` |
| `/entry` redirect | Change from redirect to `/start` → redirect to `/lightening` (preserves ref, backward compat) |
| `/start` redirect | Change from split logic → redirect to `/lightening` (preserves ref, backward compat) |
| Remove `/start` split | Split logic moves to LighteningClient; `/start` becomes a simple redirect to `/lightening` |
| Referral capture | Keep as-is on `/` and `/entry` redirects (ap_ref, ref cookies) |

**Rationale:** Root and legacy routes (`/entry`, `/start`) all funnel to `/lightening`. Referral capture remains in middleware.

---

### 2.2 LighteningClient (`agnes-next/src/app/lightening/LighteningClient.tsx`)

| Change | Description |
|--------|-------------|
| Variant routing | After video ends or Continue click, route based on variant instead of always `/contest` |
| Variant resolution | Implement precedence: `?v=` > variant cookie > random (using configurable split) |
| Split logic | Read `ENTRY_SPLIT_TERMINAL`, `ENTRY_SPLIT_PROTOCOL`, `ENTRY_SPLIT_CONTEST` from env |
| Cookie/localStorage | Store `entry_variant` when assigned (for consistency on refresh) |
| Path mapping | `terminal` → `/terminal-proxy?...`, `protocol` → `/the-protocol-challenge`, `contest` → `/contest` |

**Routing destinations:**
- `terminal` → `/terminal-proxy?embed=1&skipLoad=1&ref=...&variant=terminal` (preserve ref, add variant)
- `protocol` → `/the-protocol-challenge?ref=...&variant=protocol`
- `contest` → `/contest?ref=...`

---

### 2.3 Entry Variant Library (`agnes-next/src/lib/entryVariant.ts`)

| Change | Description |
|--------|-------------|
| Add `contest` variant | Extend type: `'terminal' | 'protocol' | 'contest'` |
| Add weighted random | New function `getWeightedVariant(splits)` using env values |
| Query/cookie support | Support `v=contest` in query and cookie |

---

### 2.4 Environment Configuration

**New env vars** (add to `agnes-next/.env.example`, `agnes-next/.env.local.example`):

```
NEXT_PUBLIC_ENTRY_SPLIT_TERMINAL=25
NEXT_PUBLIC_ENTRY_SPLIT_PROTOCOL=35
NEXT_PUBLIC_ENTRY_SPLIT_CONTEST=40
```

**Default behavior:** If unset, fallback to 25/35/40. `NEXT_PUBLIC_` prefix required for client-side access in LighteningClient.

---

### 2.5 Deepquill Terminal Handoff

#### 2.5.1 LighteningClient → Terminal

When routing to `terminal`, build URL with:

```
/terminal-proxy?embed=1&skipLoad=1&ref={ref}&variant=terminal&email={email if known}
```

- `ref` — from `ap_ref` cookie or query
- `variant` — `terminal`
- `email` — from `readContestEmail()` if available (optional)

#### 2.5.2 EmailModal (`deepquill/src/components/EmailModal.jsx`)

| Change | Description |
|--------|-------------|
| Return path | Change redirect from `/lightening?...` → `/contest?...` |
| Preserve params | Keep `ref`, `variant`, `email`, `src`, `utm_*` in redirect URL |

**Rationale:** Lightning already played before terminal; no need to replay. User goes directly to contest.

#### 2.5.3 Terminal Proxy Route (`agnes-next/src/app/terminal-proxy/[[...path]]/route.ts`)

| Change | Description |
|--------|-------------|
| Forward params | Already forwards query params to Vite; ensure `ref`, `variant`, `email` are passed through (no code change needed; already done) |

**Optional:** If cross-origin cookie issues arise, add signed handoff token generation in Next.js and validation in deepquill. Current setup uses same origin (terminal-proxy is Next.js route proxying to Vite), so cookies should work.

---

### 2.6 Entry Page (Secret Path) — Clarification

**Does `/entry` still render anything directly?** No.

With the new middleware, `/entry` **always redirects** to `/lightening`. The `/entry` page never renders. The browser receives a 307/302 redirect before any page content is served.

**What about EntryClient?** It remains in the codebase as **code for future reuse only**. To use it in a secret path later, you would need to either:
- Add a bypass in middleware (e.g. `/entry?secret=xyz` skips redirect and renders the page), or
- Create a different route (e.g. `/secret-entry`) that renders EntryClient.

**Current state:** `/entry` → redirect → `/lightening`. EntryClient is dormant.

---

### 2.7 ReferActions (`agnes-next/src/app/refer/ReferActions.tsx`)

| Change | Description |
|--------|-------------|
| `handleEnterMystery` | Already routes to `/lightening`; no change needed |

---

### 2.8 Lightning Redirect (`agnes-next/src/app/lightning/page.tsx`)

| Change | Description |
|--------|-------------|
| None | Already redirects `/lightning` → `/lightening`; keep as-is |

---

## 3. Implementation Order

1. **Env vars** — Add `ENTRY_SPLIT_*` to `.env.example` and `.env.local.example`
2. **entryVariant.ts** — Add `contest`, weighted random, env-based splits
3. **LighteningClient** — Variant resolution + post-video routing
4. **Middleware** — Root `/` → `/lightening`; `/entry` → `/lightening`; `/start` → `/lightening`
5. **EmailModal** — Redirect to `/contest` instead of `/lightening`
6. **Smoke test** — Verify all three variants and referral flow

---

## 4. Risk Areas

### 4.1 Referral Tracking

- **Risk:** Referral codes (`ref`, `ap_ref`) could be lost across redirects.
- **Mitigation:** Middleware already captures `ref` on `/` and `/entry`. LighteningClient and EmailModal must preserve `ref` in query params when building redirect URLs. Cookie `ap_ref` is set by middleware; client-side routing should not clear it.
- **Verification:** Test `/?ref=ABC123` → Lightning → terminal/protocol/contest → confirm `ap_ref` cookie and referral attribution.

### 4.2 Variant Consistency

- **Risk:** User gets different variant on refresh (e.g. terminal → protocol).
- **Mitigation:** Set `entry_variant` cookie in LighteningClient when assigning variant (before redirect). Use same cookie name as middleware (`entry_variant`, `dq_entry_variant`).
- **Verification:** Assign variant, refresh, confirm same path.

### 4.3 Terminal Return Path

- **Risk:** Terminal users expect Lightning after email (current behavior). New flow skips Lightning.
- **Mitigation:** Spec explicitly states "deepquill → return → /contest". Document this in UX copy if needed.
- **Verification:** Terminal flow: Lightning → terminal → email → contest (no second Lightning).

### 4.4 Env Var Availability

- **Risk:** `ENTRY_SPLIT_*` read at runtime; Next.js client components need `NEXT_PUBLIC_` prefix for client-side access.
- **Mitigation:** Either (a) use server component or API route to pass splits to client, or (b) add `NEXT_PUBLIC_ENTRY_SPLIT_TERMINAL` etc. if splits must be client-readable. Recommended: keep split logic in LighteningClient and use `NEXT_PUBLIC_ENTRY_SPLIT_*` for client-side routing.

### 4.5 Deepquill Standalone vs Proxied

- **Risk:** When deepquill runs standalone (e.g. `localhost:5173`), `window.location.origin` differs from agnes-next. Cookies may not be shared.
- **Mitigation:** Terminal is served via `/terminal-proxy` in production; same origin. For local dev, ensure both run behind same host (e.g. ngrok) or accept that standalone deepquill may have limited cookie sharing. Pass `ref`, `variant`, `email` in URL as fallback.

---

## 5. Confirmation: Existing Systems Unaffected

| System | Location | Impact |
|--------|----------|--------|
| **Stripe checkout** | `agnes-next/src/app/api/create-checkout-session`, deepquill Stripe handlers | No changes to checkout logic, success/cancel paths |
| **Points ledger** | deepquill `api/points/*`, `api/contest/join` | No changes |
| **Referral tracking** | `ap_ref`/`ref` cookies, middleware, create-checkout-session | Preserved; ref still captured and passed |
| **Contest scoring** | `api/contest/score`, `api/contest/explicit-enter` | No changes |
| **Email recognition** | `api/contest/login`, `readContestEmail`, `writeContestEmail` | No changes; EmailModal still calls login |
| **Protocol Challenge** | `GlitchIntro`, ProtocolChallengeClient | No changes; only entry path changes |
| **Contest Hub** | ContestClient, RequestAccessModal | No changes |

**Scope:** Only entry routing (middleware, LighteningClient, EmailModal redirect, entryVariant) is modified. All downstream systems (Stripe, points, referrals, contest, email) remain unchanged.

---

## 6. Clarifications (Confirmed During Implementation)

### 6.1 Lightning Behavior
**When does variant routing happen?** Only after the video ends or the user clicks Continue. The user lands on `/lightening`, sees the full Lightning experience, and is routed only when they finish (video end) or skip (Continue click). No early redirect.

### 6.2 Query Override Support
These URLs work for testing and override cookie/random:
- `/lightening?v=terminal` → terminal
- `/lightening?v=protocol` → protocol challenge
- `/lightening?v=contest` → contest

### 6.3 Terminal Return
EmailModal redirect preserves: `ref` (from URL or ap_ref/ref cookies), `email`, `variant` (v=terminal). Same-origin: `/terminal-proxy` is a Next.js route that proxies to Vite; the browser sees the page as same-origin. Cookies work. Pass `ref` in URL as fallback if cookie sharing ever fails.

---

## 7. Quick Validation Checklist (Post-Implementation)

| # | Test | Expected |
|---|------|----------|
| 1 | Visit `/` | Loads Lightning (video plays) |
| 2 | `/lightening?v=terminal` → Continue | Goes to terminal |
| 3 | `/lightening?v=protocol` → Continue | Goes to protocol challenge |
| 4 | `/lightening?v=contest` → Continue | Goes to contest |
| 5 | `/lightening` (no cookie, no query) → Continue | Weighted random: ~25% terminal, ~35% protocol, ~40% contest |
| 6 | Terminal path: Lightning → terminal → email submit | Returns to `/contest` (not Lightning) |
| 7 | `/?ref=ABC123` through all 3 paths | Ref survives; check `ap_ref` cookie and contest attribution |
| 8 | Contest hub with known email | Existing email recognition still works |

---

## 8. Appendix: Current vs New Flow

### Current Flow

```
/ → /entry → /start → [50% terminal-proxy | 50% protocol]
Terminal → /lightening → /contest
Protocol → /contest
```

### New Flow

```
/ → /lightening
/entry → /lightening (backward compat)
/start → /lightening (backward compat)

Lightning plays → [25% terminal | 35% protocol | 40% contest]
Terminal → /contest (direct)
Protocol → /contest
Contest → /contest (direct)
```
