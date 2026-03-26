# Signal Room: Campaign Feed + Quiet Reveal Plan

**Objective:** Reposition Signal Room as a live campaign feed and quiet-reveal channel.  
**Product intent:** Campaign direction, intrigue, live prompts, prize announcements, participation challenges, “radio DJ” style engagement.

---

## 1. Recommended Layout Approach

### Current State
- `SignalRoomClient` already splits `latestSignal` (index 0) and `feedSignals` (rest)
- Latest signal is shown in a hero block labeled "LATEST SIGNAL"
- Media is inline inside each card via `SignalMedia`

### Recommended Changes (surgical)

| Change | Description |
|--------|-------------|
| **Live transmission hero** | Make the latest-signal block visually distinct as the "now live" transmission: larger text, subtle "LIVE" or "ON AIR" indicator, stronger visual hierarchy. |
| **Media beneath text** | Move supporting video/media for the latest signal to sit directly under the signal text in a dedicated block—slightly larger than standard cards. For video, consider `loading="eager"` and optional autoplay mute. |
| **Older signals below** | Keep feed signals in descending order (newest first); these remain card-style, media inline. |
| **Filter behavior** | Keep filter tabs; when filtered, the "live" slot shows the newest signal of that type, or a placeholder if none. |

### Layout Structure
```
┌─────────────────────────────────────────┐
│ Header (Back, Signal, +, ⚡, ⚙)          │
├─────────────────────────────────────────┤
│ Filter tabs (All, Archive, Location…)    │
├─────────────────────────────────────────┤
│ ┌─── LIVE TRANSMISSION ─────────────┐   │
│ │ Newest signal text (prominent)    │   │
│ ├───────────────────────────────────┤   │
│ │ Supporting video/media (featured)  │   │
│ │ (larger, directly beneath text)    │   │
│ ├───────────────────────────────────┤   │
│ │ Upvote | Theory | View | Share     │   │
│ └───────────────────────────────────┘   │
│                                         │
│ Signal Feed (older signals, cards)      │
│ ┌─────────────────────────────────┐     │
│ │ Signal 2                         │     │
│ └─────────────────────────────────┘     │
│ ┌─────────────────────────────────┐     │
│ │ Signal 3                         │     │
│ └─────────────────────────────────┘     │
└─────────────────────────────────────────┘
```

### Files for Layout
- `agnes-next/src/app/signal-room/SignalRoomClient.tsx` – restructure latest-signal block; extract media into its own featured block
- `agnes-next/src/app/signal-room/SignalMedia.tsx` – optional `variant="featured"` for larger video/16:9 in hero

---

## 2. Recommended Access-Control Approach

### Mode-Based Switch (Toggleable)

Gating is controlled by a single env variable. Most of the time the Signal Room is public; during quiet reveal or special campaigns, switch the mode.

| Env Variable | Values | Description |
|--------------|--------|-------------|
| `SIGNAL_ROOM_ACCESS_MODE` | `public` | No access code required. Default; preserves existing experience. |
| | `code` | Valid access code required. Uses `SIGNAL_ROOM_ACCESS_CODE`. |
| | `eligibility` | Backend-approved users only (User flag or allowlist). |
| | `hybrid` | Access code **OR** backend eligibility; either grants access. |

When `code` or `hybrid` is active:
- `SIGNAL_ROOM_ACCESS_CODE` must be set (shared secret for invitees)
- `SIGNAL_ROOM_CODE_TTL_MINUTES` (optional) – TTL in minutes for code grants; supports rotating access during campaigns. When set, code/cookie grants expire after this duration.

| Method | Use Case | Implementation |
|--------|----------|----------------|
| **Access code** | Invite-only, shared secret (e.g. `?code=VOLUNTEER2025`) | Query param or cookie; validated server-side |
| **Backend eligibility** | Invited volunteers, beta participants (by email/userId) | User flag in DB or allowlist |

### Gating Logic by Mode

```
public:      everyone can access (no gate)
code:        access granted iff valid ?code=XXX or cookie matches SIGNAL_ROOM_ACCESS_CODE
eligibility: access granted iff User.signalRoomAccess=true (or in allowlist)
hybrid:      access granted iff valid code OR User.signalRoomAccess=true
```

### Principles
- **Toggleable:** Change mode via env/config; no code deploy to turn gating on/off
- **Same route:** `/signal-room` always; gate or content based on mode + user state
- **No redesign:** Gate view is minimal; full experience when access granted
- **Public default:** `SIGNAL_ROOM_ACCESS_MODE=public` → no gate, existing behavior

### Eligibility Storage (for `eligibility` and `hybrid` modes)
- **Option A:** `User` model: `signalRoomAccess Boolean @default(false)` – simple, per-user
- **Option B:** Allowlist table: `SignalRoomAccess { userId, grantedAt, grantedBy }` – audit trail
- **Option C:** Env allowlist: `SIGNAL_ROOM_ACCESS_EMAILS=a@b.com,b@c.com` – no schema change

**Recommendation:** Option A (User flag) for flexibility; Option C for zero schema change.

---

## 3. Hiding Signal Room During Quiet Reveal

### Principles
- Route stays `/signal-room` (no breakage)
- Gate behavior controlled by `SIGNAL_ROOM_ACCESS_MODE`; when `public`, no gate
- Unauthorized users get a soft “coming soon” / “transmission secured” page
- Authorized users get full feed
- Links to Signal Room elsewhere still work; they hit the gate

### Approach

| Layer | Behavior |
|-------|----------|
| **Page** | `signal-room/page.tsx` – check access before fetching signals; if denied, render gated view |
| **Links** | Keep links; they route to the same page, which shows gate or content |
| **API** | `/api/signals` – when mode is `public`, open; when gated, require valid session + code/eligibility |

### Gated View (when denied)
- **Themed, consistent with product narrative** – not a generic access-denied screen
- "Transmission secured" messaging (campaign/mystery feel)
- Same header/branding as full Signal Room
- Message: e.g. “Transmission secured. Access by invitation only.”
- When mode is `code` or `hybrid`: “Enter access code” input that posts to `/api/signal-room/verify-code` and sets cookie
- No signal list, no composer

### Env Config

| Variable | Purpose |
|----------|---------|
| `SIGNAL_ROOM_ACCESS_MODE` | `public` \| `code` \| `eligibility` \| `hybrid` – controls gating (default: `public`) |
| `SIGNAL_ROOM_ACCESS_CODE` | Required when mode is `code` or `hybrid`; shared secret for invitees |
| `SIGNAL_ROOM_CODE_TTL_MINUTES` | Optional. TTL in minutes for code grants; enables rotating access during campaigns. Omit = no expiry. |

---

## 4. Files & Routes Involved

### Layout
| File | Change |
|------|--------|
| `agnes-next/src/app/signal-room/SignalRoomClient.tsx` | Restructure latest-signal hero; featured media block |
| `agnes-next/src/app/signal-room/SignalMedia.tsx` | Optional `featured` variant |

### Gating
| File | Change |
|------|--------|
| `agnes-next/src/app/signal-room/page.tsx` | Access check before data fetch; conditional gate vs content |
| `agnes-next/src/app/signal-room/SignalRoomClient.tsx` | Receive `hasAccess` prop or render nothing when gated |
| **New:** `agnes-next/src/app/api/signal-room/verify-code/route.ts` | Validate code, set cookie, return ok/denied |
| `deepquill` schema (optional) | `User.signalRoomAccess` if using backend eligibility |

### Link / Entry Points (for hiding or gating)
| Location | Behavior when gated |
|----------|---------------------|
| `ContestClient.tsx` – “Send Signal” button | Keeps link; page shows gate |
| `ScoreClient.tsx` – Signal Room link | Same |
| `AscensionClient.tsx` – Signal Room link | Same |
| `SignalRoomHeader` – admin link | Admin can stay accessible to admins (separate gate) |

---

## 5. Safest Implementation Order

1. **Layout first (no gating)**  
   - Implement live-transmission hero and featured media.  
   - Verify ordering, mobile, and existing flows.

2. **Gating infra (mode-based)**  
   - Add `SIGNAL_ROOM_ACCESS_MODE` (default: `public`), `SIGNAL_ROOM_ACCESS_CODE` (when code/hybrid).  
   - Implement gate view and code verification API.  
   - Access check reads mode; when `public`, bypass gate entirely.

3. **Backend eligibility (for `eligibility` and `hybrid` modes)**  
   - Add User flag or allowlist if needed.  
   - Integrate into access check.

4. **Enable gating (toggle on)**  
   - Set `SIGNAL_ROOM_ACCESS_MODE=code` or `hybrid` when starting quiet reveal.  
   - Set `SIGNAL_ROOM_ACCESS_CODE` if using code.  
   - Distribute code or add users to allowlist.

5. **Disable gating (toggle off)**  
   - Set `SIGNAL_ROOM_ACCESS_MODE=public` when going public.  
   - No code deploy required; config-only change.

---

## 6. Website vs Elsewhere

**Recommendation: Keep on the website (agnes-next).**

| Factor | Website | External |
|--------|---------|----------|
| Identity | Reuses contest/auth | New auth needed |
| Links | Contest, score, ascension already point here | More integration work |
| Gating | Server + client checks | Separate infra |
| Campaign flow | Part of contest journey | Disconnected |

---

## 7. Summary

| Item | Recommendation |
|------|----------------|
| **Layout** | Hero for newest signal, featured media directly beneath, older signals in feed below |
| **Gating** | Mode-based: `SIGNAL_ROOM_ACCESS_MODE` = `public` \| `code` \| `eligibility` \| `hybrid`; toggleable via config |
| **Hide from public** | Gated view on same route when mode is `code`, `eligibility`, or `hybrid`; links stay, page shows gate |
| **Implementation order** | Layout → gating infra → backend flag (optional) → enable gating |
| **Location** | On website (agnes-next) |

