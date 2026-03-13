# SPEC 1 — Quick Validation Checklist

Run through these after implementation to confirm the entry funnel works correctly.

---

## Pre-requisites

- Add to `agnes-next/.env.local` (if not present):
  ```
  NEXT_PUBLIC_ENTRY_SPLIT_TERMINAL=25
  NEXT_PUBLIC_ENTRY_SPLIT_PROTOCOL=35
  NEXT_PUBLIC_ENTRY_SPLIT_CONTEST=40
  ```
- Restart Next.js dev server after adding env vars.

---

## Checklist

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 1 | Root loads Lightning | Visit `http://localhost:3002/` | Redirects to `/lightening`, Lightning video plays |
| 2 | Query override: terminal | Visit `/lightening?v=terminal`, click Continue (or let video end) | Goes to `/terminal-proxy` |
| 3 | Query override: protocol | Visit `/lightening?v=protocol`, click Continue | Goes to `/the-protocol-challenge` |
| 4 | Query override: contest | Visit `/lightening?v=contest`, click Continue | Goes to `/contest` |
| 5 | Weighted random | Clear cookies, visit `/lightening`, click Continue 10+ times | ~25% terminal, ~35% protocol, ~40% contest (approximate) |
| 6 | Terminal return | `/lightening?v=terminal` → terminal → submit email | Redirects to `/contest` (not `/lightening`) |
| 7 | Ref survives: terminal | `/?ref=TEST123` → Lightning → terminal → email → contest | Check `ap_ref` cookie = TEST123; ref in contest URL |
| 8 | Ref survives: protocol | `/?ref=TEST123` → Lightning → protocol → contest | Ref preserved |
| 9 | Ref survives: contest | `/?ref=TEST123` → Lightning → contest | Ref preserved |
| 10 | Email recognition | Complete terminal with email, land on contest | Existing email recognition still works (no re-prompt) |

---

## Notes

- **Lightning timing:** Variant routing happens only after video ends or Continue click. User always sees full Lightning first.
- **Same-origin:** `/terminal-proxy` is served by Next.js; browser sees same origin. Cookies (ap_ref, ref, contest_email) work.
- **/entry and /start:** Both redirect to `/lightening`. They do not render.
