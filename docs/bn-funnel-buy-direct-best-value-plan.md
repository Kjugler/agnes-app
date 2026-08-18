# Buy Direct / Funnel Architecture — Canonical Plan

**Status:** **Locked for approval** — documentation only  
**Last revised:** 2026-08-18 (Phase D bridge revision synced)  
**Canonical index:** This document + [`bn-funnel-readers-agree-v2-study.md`](bn-funnel-readers-agree-v2-study.md) + [`bn-funnel-readers-agree-v2-prospect-nurture-study.md`](bn-funnel-readers-agree-v2-prospect-nurture-study.md) + **[`bn-funnel-phase-d-plan.md`](bn-funnel-phase-d-plan.md)** ← authoritative Phase D plan

> **Supersedes:** The prior **large “Buy Direct — Best Value” promotional card** on `/readers-agree` — **NOT approved.** Buy Direct on `/readers-agree` is a **clean third button only**. Best-deal selling lives on **`/catalog`**.

---

## Page responsibilities (locked)

| Page | Job | Tagline |
|------|-----|---------|
| **`/readers-agree`** | **CHOOSE** | Understand the book → Amazon / Barnes & Noble / Buy Direct → email capture |
| **Retailer return bridge** (`/readers-agree/go/amazon`, `/go/bn`) | **DECIDE NEXT** | After retailer visit — compare, Buy Direct, back to retailer, or email capture |
| **`/catalog`** | **SELL the direct offer** | Explain why buying direct is the best-value package; close direct purchase |
| **`/sample-chapters`** | **SELL the story** | Let the prospect experience the book; continue nurture / purchase funnel |

**Funnel principle:** *Always Be Closing* without feeling pushy — provide an obvious purchase path when ready, without forcing persuasion steps on visitors already prepared to buy (newsletter, repeat ads, word-of-mouth).

---

## LOCKED `/readers-agree` page order

### 1. Hero

Keep approved hero:

- Capitol + book + lightning/current visual treatment  
- Conditional headline (referral vs ad/direct) — per v2 study §1, §9  
- No redesign

### 2. Three pillars

- Artificial Intelligence  
- Media Manipulation  
- Government Corruption  

### 3. Locked story paragraph (verbatim)

> A banking prodigy disappears. A handful of technology experts challenge the most powerful people in America. Orphan boys become part of something no one could have imagined. And somehow, beneath the conspiracy, fraud, and political intrigue, readers discover a story that never loses its heart.

Typography: ~17–18px body; ~28–32rem measure; existing dark-shell identity.

### 4. Three clean purchase buttons

**Immediately after the story section** — three simple choices:

```
[ Amazon ]  [ Barnes & Noble ]  [ Buy Direct ]
```

| Rule | Detail |
|------|--------|
| **Visual** | Clean buttons — **equal weight** among the three |
| **NOT on RA** | No sales pitch, benefit list, price comparison, “Best Value” card, FREE eBook explanation, or signed-copy promise around Buy Direct |
| **Philosophy** | Customer chooses the channel they trust |

| Button | Destination | Phase C notes |
|--------|-------------|---------------|
| **Amazon** | `https://www.amazon.com/dp/B0GWQBDH66` (buy PDP) | **Clean product URL is safe fallback.** Amazon Attribution tags applied **only when genuine Amazon-generated values exist** — see § Amazon Attribution |
| **Barnes & Noble** | Canonical B&N PDP | Unchanged |
| **Buy Direct** | `/catalog?{tracking}` | Preserve `ref`, UTMs, visitor attribution |

**Newsletter short path:** `Newsletter → /readers-agree → Buy Direct → /catalog` — no forced sample/email step.

**Dorothy bridge:** Preserve bridge **routes** and popup/return mechanics — **Phase D replaces bridge UI** with light “decide next” experience (see [`bn-funnel-phase-d-plan.md`](bn-funnel-phase-d-plan.md)). **Supersedes** old “Ready to see for yourself?” continuation.

### 5. Email capture (Phase D — replaces Phase C Start Reading placeholder)

Immediately beneath the three purchase buttons — **no** standalone green Start Reading button.

**Direction:** Informal value prop + email field + submit (label may read “Start Reading →” or “Keep Exploring →” on bridge).

On submit: durable lead + nurture Email 0 + redirect **`/sample-chapters`** hub. Full spec: [`bn-funnel-phase-d-plan.md`](bn-funnel-phase-d-plan.md) §2.

### 6. Email submission behavior (Phase D — locked)

On submit:

| Step | Behavior |
|------|----------|
| Capture | Durable prospect (`User` + `ReaderProfile` + attribution snapshot) |
| Attribution | Preserve source, campaign, UTMs, `ref`, `visitorId`, agreed fields |
| Nurture | Enroll approved 5-email prospect sequence ([nurture study](bn-funnel-readers-agree-v2-prospect-nurture-study.md)) |
| Redirect | **Immediate** browser redirect to `/sample-chapters?{attribution}` |
| Confirmation | **None** — no intermediate page, no extra click |
| Mobile Jody | **Suppress** mobile Jody Concierge gate — visitor already gave email |
| Email attachment | **No PDF** — welcome/nurture emails link back to `/sample-chapters` |
| Reading | Website remains reading destination; visitor explores chapters, testimonials, author, purchase paths on hub |

---

## `/readers-agree` page map (final)

```
┌─────────────────────────────────────────┐
│ 1. Hero — Capitol + book                │
├─────────────────────────────────────────┤
│ 2. Three pillars                        │
│ 3. Locked story paragraph               │
├─────────────────────────────────────────┤
│ 4. [ Amazon ] [ Barnes & Noble ]        │
│    [ Buy Direct ]   ← three clean CTAs  │
├─────────────────────────────────────────┤
│ 5. Email capture (concise, informal)    │
│    Submit → /sample-chapters (hub)      │
├─────────────────────────────────────────┤
│ Long scroll (Phase F): testimonials,     │
│ author — no duplicate purchase pitch    │
└─────────────────────────────────────────┘
```

**Phase C interim removed in Phase D:** large green **Start Reading →** button below purchase row.

**Explicitly removed from `/readers-agree`:**

- Large Buy Direct “Best Value” card  
- Benefit bullets / price math on landing  
- Bottom-only Buy Direct as primary close (Buy Direct is in step 4, top of funnel)  
- Scroll-zone Buy Direct reinforcement as a second sales block (optional quiet footer link only if needed — default: **none**)

---

## `/catalog` — sell the direct offer (unchanged intent)

`/readers-agree` does **not** explain why Buy Direct is the best deal. **`/catalog` does.**

### Locked catalog positioning

**Eyebrow / hero treatment:** **YOU'VE FOUND THE BEST DEAL** (or equivalent consistent with approved catalog design)

**Direct paperback package includes:**

| Benefit | Copy direction |
|---------|----------------|
| **Signed paperback** | **Restored** — reverses prior removal decision |
| **FREE eBook** | Delivered immediately — read while waiting for paperback |
| **Bookmarks** | To share with friends |
| **15% reader discount** | When valid referral applies |

**Referral price math (when discount active):**

```
List price          $26.00
Reader savings      − $3.90
Your direct price   $22.10
+ FREE eBook ($12 value)
+ shipping at checkout
```

**Catalog may use:** stronger Best Deal / Best Value treatment, benefit explanation, price mathematics, expanded “Why buy direct?” (open by default or always-visible value stack).

**Trust note (catalog only):** Amazon and B&N remain good options for reviews and convenience; direct is the **most complete package**.

---

## Retailer return bridge — decide next (Phase D)

**Goal:** After Amazon/B&N visit, help the shopper **decide what to do next** — not repeat the landing page, not the old generic bridge panel.

| Surface | Treatment |
|---------|-----------|
| **`/readers-agree` (default)** | **No change** on cold visit — clean three-button + email layout |
| **Dorothy bridge** (`/readers-agree/go/amazon`, `/go/bn`) | **New light-theme decide-next page** — Buy Direct + alt retailer + back link + email capture |
| **Visual** | Light gray/off-white, restrained green, subtle CSS honeycomb — **not** black/red landing shell |
| **Merchandising** | Bridge says **Buy Direct** label only — **no** value stack (catalog owns pitch) |

**Supersedes:** “Ready to see for yourself?” + Buy the Book / Read Sample Chapters bridge continuation.

**Full wireframes + flows:** [`bn-funnel-phase-d-plan.md`](bn-funnel-phase-d-plan.md) §3–§8.

**Momentum signals (existing):** `readersAgreeMomentum.ts` — validated / departed / active; timing preserved, UI replaced.

---

## Amazon Attribution

**Status:** **Pending** — Amazon review of Simon McQuade Author Central claim for IngramSpark-distributed title.

| Rule | Detail |
|------|--------|
| **Phase C fallback** | Clean Amazon product URL: `https://www.amazon.com/dp/B0GWQBDH66` |
| **Do not** | Invent, modify, or manufacture `maas` / `aa_*` parameters |
| **Prepare** | Architecture to accept **genuine Amazon-generated** tag URLs/suffixes when Kris provides them ([attribution study](bn-funnel-readers-agree-amazon-attribution-study.md)) |
| **When tags arrive** | Wire via centralized config; pass-through or lookup — never hard-code in components |

---

## Analytics (locked)

Distinct measurement for:

| Action | Event (existing / planned) |
|--------|----------------------------|
| Amazon click | `READERS_AGREE_AMAZON_CLICK` |
| Barnes & Noble click | `READERS_AGREE_BN_CLICK` |
| Buy Direct click | `READERS_AGREE_BUY_DIRECT_CLICK` *(or migrate `READERS_AGREE_BUY_CLICK` with `destination: catalog`)* |
| Email submit (landing) | `READERS_AGREE_EMAIL_SUBMITTED` `{ surface: 'landing' }` |
| Bridge view | `READERS_AGREE_BRIDGE_VIEW` `{ retailerOrigin }` |
| Bridge Buy Direct | `READERS_AGREE_BRIDGE_BUY_DIRECT_CLICK` |
| Bridge alt retailer | `READERS_AGREE_BRIDGE_ALT_RETAILER_CLICK` |
| Bridge back to retailer | `READERS_AGREE_BRIDGE_BACK_TO_RETAILER_CLICK` |
| Bridge email submit | `READERS_AGREE_BRIDGE_EMAIL_SUBMITTED` |
| Sample hub progression | `SAMPLE_CHAPTERS_PAGE_VIEW`, `SAMPLE_CHAPTER_OPEN`, etc. |
| Direct checkout / purchase | `CHECKOUT_STARTED`, `PURCHASE_COMPLETED`, server `Purchase` |

Full event payloads: [`bn-funnel-phase-d-plan.md`](bn-funnel-phase-d-plan.md) §10.

**Superseded:** `READERS_AGREE_RETAILER_RETURN` as analytics-only minimal UI; bridge `READERS_AGREE_BUY_CLICK` on old continuation.

Preserve UTMs / `ref` on internal paths: `/catalog`, `/sample-chapters`, `/checkout`, nurture email CTAs.

**Buy Direct on RA:** Track click only — **no** price/referral pitch meta required on landing (catalog owns price display).

---

## Business rules — protected

Nothing in this correction changes:

| Rule | Detail |
|------|--------|
| 15% reader discount | Valid referral on **direct** checkout |
| $2 direct-sponsor commission | Stripe webhook — unchanged |
| $3 qualified podcaster/regional override | Lineage system — unchanged |
| Stripe checkout / payout | Unchanged |
| Referral `ref` attribution | Preserved across RA → catalog → checkout → nurture |
| Contest retirement | **Must not** be interpreted as retirement of referral compensation |

---

## Implementation phases (revised)

| Phase | Scope |
|-------|--------|
| **A** | Study locked ✓ |
| **B** | Hero, pillars, locked paragraph, typography, conditional referral/ad headline ✓ |
| **C** | Three clean purchase buttons; Amazon URL hook; bridge routes preserved ✓ |
| **C-catalog** | Catalog Best Deal hero + signed copy + value stack + price math |
| **D** | Email capture + **bridge redesign** + lead + nurture + Jody suppress — [`bn-funnel-phase-d-plan.md`](bn-funnel-phase-d-plan.md) |
| **F** | Long-scroll testimonials, author — **no** extra purchase pitch on RA |
| **G** | Point ads to `/readers-agree`; measure |

---

## Superseded (do not implement)

| Prior proposal | Status |
|----------------|--------|
| Full-width **Buy Direct — Best Value** card on `/readers-agree` | **Rejected** |
| Tiered hierarchy (Buy Direct primary, retailers secondary) on RA | **Rejected** — three **equal** clean buttons on RA |
| “Still deciding?” **large panel on landing** | **Rejected** — landing stays clean; decide-next lives on **bridge only** |
| Old bridge **“Ready to see for yourself?”** panel | **Superseded** by Phase D light decide-next bridge |
| Benefit copy / price on RA Buy Direct button | **Rejected** |
| Best Value selling on `/readers-agree` | **Moved to `/catalog` only** |

---

## Related documents

| Document | Role |
|----------|------|
| [`bn-funnel-readers-agree-v2-study.md`](bn-funnel-readers-agree-v2-study.md) | RA v2 locked decisions — synced to this plan |
| [`bn-funnel-readers-agree-v2-prospect-nurture-study.md`](bn-funnel-readers-agree-v2-prospect-nurture-study.md) | Email sequence after lead capture |
| [`bn-funnel-phase-d-plan.md`](bn-funnel-phase-d-plan.md) | **Authoritative Phase D** — email capture + bridge redesign |
| [`bn-funnel-readers-agree-amazon-attribution-study.md`](bn-funnel-readers-agree-amazon-attribution-study.md) | Amazon tags when available |
| [`funnel-analytics.md`](funnel-analytics.md) | Event architecture |

---

*Canonical plan as of 2026-08-18. Phase D planning locked — no implementation until explicitly approved.*
