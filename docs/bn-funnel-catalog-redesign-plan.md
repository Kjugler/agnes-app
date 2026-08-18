# Catalog Redesign — Canonical Plan

**Status:** **Approved direction — planning only (post Phase D checkpoint)**  
**Last revised:** 2026-08-18  
**Checkpoint:** Phase D preserved on branch `phase-d-checkpoint` — this work is **next**, separate from Phase D  
**Related:** [`bn-funnel-buy-direct-best-value-plan.md`](bn-funnel-buy-direct-best-value-plan.md) · [`bn-funnel-phase-d-plan.md`](bn-funnel-phase-d-plan.md) · bridge CSS reference: `agnes-next/src/app/readers-agree/go/readers-agree-bridge.css`

---

## Role in the funnel

| Page | Job |
|------|-----|
| `/readers-agree` | **Choose** a channel (Amazon \| B&N \| Buy Direct) + email capture |
| Retailer return bridge | **Decide next** after a retailer visit (light honeycomb shell) |
| **`/catalog`** | **Sell the direct offer** — explain why the paperback package is best value; close purchase |
| `/sample-chapters` | **Sell the story** — experience before purchase |

Buy Direct on `/readers-agree` and the bridge **label only**. Value explanation and price math live **here**.

---

## 1. Visual environment — bridge family

Move `/catalog` into the **same visual family** as the Phase D light retailer-return bridge — not the dark `/readers-agree` shell, and not checkout’s dark loading UI.

### Design tokens (align with bridge)

| Token | Bridge reference | Catalog use |
|-------|------------------|-------------|
| Page background | `#f4f5f2` warm off-white | Full-page shell |
| Honeycomb pattern | `.ra-bridge-honeycomb` CSS gradients, ~45% opacity | Subtle full-bleed background (reuse or extract shared class) |
| Primary text | `#1a1f1c` / `#142018` charcoal | Headlines, body |
| Muted text | `rgba(26, 31, 28, 0.72)` | Subcopy, secondary labels |
| Green accent | `#00b35a` (bridge CTA) / `#00ff7f` (hub primary) | **Selective:** prices, borders on hero card, primary CTA, emphasis lines — not full-page fill |
| Card surface | White or near-white | Product cards on honeycomb ground |
| Feel | Bright, trustworthy retail | Continuation of journey after RA + bridge |

### Implementation note

- Extract or share a **`catalog-bridge` theme module** (CSS module or shared partial) so bridge + catalog stay in sync.
- Today: catalog uses `hubTheme.ts` (`#FAFAFA` flat light); bridge uses `readers-agree-bridge.css` honeycomb. **Target:** catalog adopts bridge honeycomb + warm gray, keeps hub typography discipline.
- **Do not** regress Phase D bridge styling when extracting shared tokens.

---

## 2. Product hierarchy — intentional, responsive

Three products; **not equal importance**.

### Desktop / laptop (≥ breakpoint TBD, suggest `720px` to match current catalog)

```
┌─────────────┬─────────────────────────────┬─────────────┐
│   eBook     │  PAPERBACK — BEST VALUE     │  Audiobook  │
│  (left)     │      (CENTER — LEAD)        │  (right)    │
└─────────────┴─────────────────────────────┴─────────────┘
```

Visual merchandising: **eBook → BEST VALUE PAPERBACK ← Audiobook**  
The eye should land on the **center** paperback card.

### Mobile (< breakpoint)

Stack order:

1. **Paperback — BEST VALUE** (first — no “center” on phone)
2. **eBook**
3. **Audiobook Preorder**

### Layout requirement

Paperback must be implemented **responsively**:

- **Desktop:** CSS grid or flex with explicit column order `[ebook, paperback, audio]` — paperback in center column with largest visual weight (scale, border, shadow, badge).
- **Mobile:** Same DOM or `order` utilities so paperback renders **first** without duplicating content.

**Current state:** Paperback is a full-width featured card above a row `[ebook, audio]`. **Target:** true three-column desktop row with paperback centered.

---

## 3. Paperback — BEST VALUE (hero product)

This card does the selling. Tone: explain **what the customer receives** and **why direct is best value** — not an attack on Amazon/B&N.

### Locked label structure

**Eyebrow / badge:** `PAPERBACK — BEST VALUE`

**Title:** `The Complete Agnes Protocol Package`

**Value stack (bullets):**

- Signed paperback
- FREE eBook — $12 value
- Bookmarks to share with friends
- Buy directly from the author
- 15% reader referral discount when applicable

### Pricing display

**Normal visitor:**

```
$26.00
[ Primary CTA ]
```

**Referral visitor (15% active):**

```
$26.00
− $3.90 Reader Discount
$22.10
[ Primary CTA — e.g. Buy Direct — $22.10 ]
```

Reuse existing math: `catalogPricing.ts`, `resolveCatalogReferral.ts`, `PriceStack` behavior — **display only**; Stripe coupon application unchanged in deepquill.

### CTA

- Primary green button (bridge-family green)
- Label reflects discounted price when referral active (existing pattern)

### Trust note (catalog-only, subtle)

Amazon and Barnes & Noble remain excellent buying options. Direct is the **most complete package** — not a channel war.

---

## 4. eBook — second priority

| Viewport | Position | Emphasis |
|----------|----------|----------|
| Desktop | **Left** card | Moderate — simpler than paperback |
| Mobile | **Second** card | Same |

**Purpose:** Customer who wants the book **immediately** without a physical copy.

**Copy discipline:** Do not oversell. Let the paperback card imply: *“For a little more, look at everything I get.”*

**Price:** $12.00 (from `products.ts`) + referral discount when active.

**CTA:** Primary or secondary green — visually **subordinate** to paperback (smaller card, lighter shadow, no “BEST VALUE” badge).

---

## 5. Audiobook — third priority (preorder)

| Viewport | Position | Emphasis |
|----------|----------|----------|
| Desktop | **Right** card | **Lowest** |
| Mobile | **Third** card | Same |

**Label:** `AUDIOBOOK — PREORDER`

**Rationale:** Product does not exist yet — must not distract from purchasable formats.

### Preserve (do not redesign)

| Contract | Detail |
|----------|--------|
| Product ID | `audio_preorder` |
| Preorder copy | “Preorder now — we'll email you when it's ready.” |
| Checkout path | Same `handleBuyClick('audio_preorder')` → `/checkout` → Stripe |
| Fulfillment | `FULFILLMENT_AUDIO_PREORDER` ledger, webhook, confirmation email |
| Button styling | **Secondary** emphasis (outline/muted vs paperback primary) |

Visual work only — **no** Stripe, webhook, or fulfillment changes.

---

## 6. Merchandising principle

> **eBook → BEST VALUE PAPERBACK ← Audiobook**

Hierarchy should sell before every word is read:

| Signal | Paperback | eBook | Audiobook |
|--------|-----------|-------|-----------|
| Size / shadow | Largest | Medium | Smallest |
| Badge | BEST VALUE | None | PREORDER only |
| CTA weight | Primary filled green | Primary or soft primary | Secondary outline |
| Copy depth | Full value stack | Short | Minimal |

On **desktop**, center position + visual weight = hero.  
On **mobile**, **order** replaces center — paperback first.

---

## 7. Current implementation map

| Area | File | Change in redesign |
|------|------|-------------------|
| Route | `agnes-next/src/app/catalog/page.tsx` | Metadata/OG optional |
| UI | `agnes-next/src/app/catalog/CatalogClient.tsx` | **Major** — layout, theme, copy |
| Theme | `agnes-next/src/lib/hubTheme.ts` | Extend or add `catalogTheme` / shared bridge tokens |
| Bridge CSS | `readers-agree-bridge.css` | Extract honeycomb to shared stylesheet |
| Prices | `agnes-next/src/lib/products.ts` | **No change** (source of truth) |
| Discount | `catalogPricing.ts`, `resolveCatalogReferral.ts` | **No change** (wire to new UI) |
| Checkout | `checkout.ts`, `create-checkout-session` | **Protected** |
| Analytics | TikTok/Meta browse events in `CatalogClient` | Preserve or re-fire |
| Funnel tests | `verify-phase-d-e2e.mjs`, bridge scripts | Update only if catalog copy/structure assertions change |

---

## 8. Suggested implementation phases

| Phase | Scope |
|-------|--------|
| **Catalog-A** | Shared light honeycomb shell + typography tokens (extract from bridge) |
| **Catalog-B** | Responsive three-card grid; mobile stack order |
| **Catalog-C** | Paperback hero copy, value stack, pricing blocks (normal + referral) |
| **Catalog-D** | eBook + Audiobook card simplification; emphasis tuning |
| **Catalog-E** | Verification script updates + visual QA (desktop center, mobile first) |

**Out of scope for this redesign:**

- Stripe / referral commission / payout / fulfillment
- Audiobook backend preorder behavior
- Amazon Attribution (pending Author Central — see attribution study)
- Phase D `/readers-agree` or bridge (checkpoint frozen unless bugfix)

---

## 9. Verification checklist (for implementation)

- [ ] Page background matches bridge family (warm gray + honeycomb)
- [ ] Desktop: eBook left \| Paperback center \| Audiobook right
- [ ] Mobile: Paperback \| eBook \| Audiobook
- [ ] Paperback shows BEST VALUE badge + complete package bullets
- [ ] Referral path shows $26.00 → −$3.90 → $22.10
- [ ] Non-referral shows $26.00 only
- [ ] Audiobook labeled PREORDER; secondary visual weight
- [ ] All three CTAs reach `/checkout?product=...` with attribution params
- [ ] `audio_preorder` preorder flow unchanged end-to-end
- [ ] Phase D funnel tests still pass (Buy Direct → catalog)

---

## 10. Open decisions (minor — resolve at implementation)

1. **Exact green token:** unify on bridge `#00b35a` vs hub `#00ff7f` for catalog CTAs.
2. **Hero header:** keep “YOU'VE FOUND THE BEST DEAL” eyebrow from buy-direct plan vs slimmer catalog headline.
3. **Signed paperback:** confirm cover/fulfillment copy matches ops (restored per buy-direct plan).
4. **Breakpoint:** keep `720px` or align with bridge/tailwind `md`/`lg`.

---

*Phase D checkpoint: `phase-d-checkpoint` @ `9dfd386`. Catalog work branches from that point.*
