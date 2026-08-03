# Barnes & Noble Funnel — Phase 1 Implementation

**Implemented:** 2026-08-03  
**Scope:** `/readers-agree` redesign (synopsis-first, Start Reading → Chapter 1, More Below cue)

## Success metrics (compare to Phase 0 baseline)

Measure funnel **progression**, not vanity time-on-page:

| Stage | Events / sources |
|-------|------------------|
| Readers Agree → Start Reading | `READERS_AGREE_SAMPLE_CHAPTERS_CLICK`, `READERS_AGREE_START_READING_CLICK` |
| Start Reading → Chapter 1 engagement | `SAMPLE_CHAPTER_OPEN` (ch.1), `SAMPLE_CHAPTER_TIME_ON_PAGE` |
| Chapter 1 → Checkout | `CHECKOUT_STARTED` after ch.1 visitors |
| Checkout → Purchase | `CHECKOUT_STARTED` → `PURCHASE_COMPLETED` / `Purchase` |

**Note:** `SAMPLE_CHAPTER_OPEN` still means route arrival (may include mobile email gate).

## Pre-deploy QA matrix

### Desktop: 1920×1080, 1440×900, 1366×768

- [ ] More Below only when **entire** Start Reading button not fully visible
- [ ] Cue dismisses after ~35px scroll; never returns same visit
- [ ] New session shows cue again if button still below fold
- [ ] Cue does not overlap Jody (z-index 2)

### Mobile: iPhone Safari, iPhone Chrome, Android Chrome

- [ ] First viewport: cover + headline + friend intro + 2–3 synopsis lines + cue
- [ ] Cover capped (~200px / 32svh max)
- [ ] Same scroll-cue behavior as desktop

### Funnel

- [ ] Start Reading → `/sample-chapters/read/1?{tracking}`
- [ ] Amazon + B&N separate; Dorothy/legacy bridges work
- [ ] Buy → `/catalog?{tracking}`
- [ ] `/sample-chapters` hub unchanged

## Protected systems (not modified)

Stripe, checkout, success page, webhooks, catalog pricing, referral validation/cookies, Jody, mobile email gate, Dorothy bridges, ad pixels, email automation, historical Event rows, sample hub/chapter routes.
