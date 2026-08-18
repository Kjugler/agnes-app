# Readers Agree v2 — Long-Scroll Ad Landing Study

**Status:** Study only — locked decisions through §11 (2026-08-17)  
**Last revised:** 2026-08-17 (locked `/readers-agree` architecture — three clean purchase buttons)  
**Rule:** No application code, commits, push, or deploy until implementation explicitly approved.

> **Canonical funnel plan:** [`bn-funnel-buy-direct-best-value-plan.md`](bn-funnel-buy-direct-best-value-plan.md) — **supersedes** prior Buy Direct promotional card on `/readers-agree`.

---

## Executive summary

`/readers-agree` is the **primary paid-ad landing page** for Meta, Instagram, and TikTok — a long-scroll **book landing page**, not a static review page.

**The funnel in one line:**

> **Ready to buy?** → Amazon | Barnes & Noble | **Buy Direct** (three clean buttons — no pitch on landing)  
> **Interested but not ready?** → Email → `/sample-chapters` immediately  
> **Best-deal selling** → on **`/catalog`** only · **Story** → on **`/sample-chapters`**

**Page jobs:** `/readers-agree` = **CHOOSE** · `/catalog` = **SELL direct offer** · `/sample-chapters` = **SELL the story**

**Canonical plan:** [`bn-funnel-buy-direct-best-value-plan.md`](bn-funnel-buy-direct-best-value-plan.md)

Friend-referral (`ref`) and Text-a-Friend flows **continue** to use `/readers-agree` with conditional presentation.

`/readers-cant-put-it-down` remains **untouched** until v2 proves itself in measurement.

---

## Locked decisions (2026-08-17)

### 1. Hero — preserve concept; no redesign

**Decision:** Keep the existing **Capitol-building + book** visual concept. Do **not** redesign the hero.

**Asset comparison (study only — no substitution yet):**

| Asset | Path | Description |
|-------|------|-------------|
| **Production hero** | `public/images/rrf/readers-agree-hero-v1.jpg` | Capitol dome center; surveillance monitors left; book mockup right; headline *Find Out Why Readers Can't Put It Down*; subline *Political Thriller • Nearly All ★★★★★ Reviews*; digital grid/circuit overlays |
| **Incoming candidate** | `public/incoming/readers-agree_better.png` | **Same concept** — Capitol center, monitors left, book right, identical headline/subline, same palette and layout intent |
| **Not a hero substitute** | `public/incoming/readers-agree.jpg` | Book-cover-only mockup (silhouette + surveillance screens) — **no Capitol**; different use case |

**Substitution rule:** If `readers-agree_better.png` is promoted to production, treat it as an **asset quality/resolution swap** within the same concept — not a redesign. Side-by-side QA only; no copy/layout change required for substitution.

---

### 2. Top copy — locked

**Three pillars** (dedicated section, readable):

- **Artificial Intelligence**
- **Media Manipulation**
- **Government Corruption**

**Locked paragraph** (verbatim):

> A banking prodigy disappears. A handful of technology experts challenge the most powerful people in America. Orphan boys become part of something no one could have imagined. And somehow, beneath the conspiracy, fraud, and political intrigue, readers discover a story that never loses its heart.

**Typography:** Body copy **~17–18px**; **narrower comfortable measure** (~28–32rem); preserve existing visual identity (scanlines, red accent, dark gradient shell).

---

### 3. Purchase choices — three clean buttons (locked 2026-08-17)

> **Supersedes:** Buy Direct promotional card; tiered “Best Value” hierarchy on `/readers-agree`. Full spec: [`bn-funnel-buy-direct-best-value-plan.md`](bn-funnel-buy-direct-best-value-plan.md).

**Immediately after pillars + locked paragraph:**

```
[ Amazon ]  [ Barnes & Noble ]  [ Buy Direct ]
```

| Rule | Detail |
|------|--------|
| **Visual** | Three **clean, equal-weight** buttons |
| **NOT on `/readers-agree`** | No sales pitch, benefit list, price comparison, Best Value card, FREE eBook copy, or signed-copy promise around Buy Direct |
| **Buy Direct label** | **Buy Direct** → `/catalog?{tracking}` (preserve `ref`, UTMs) |
| **Amazon** | `https://www.amazon.com/dp/B0GWQBDH66` — clean PDP; Amazon Attribution **only when genuine tags exist** (else fallback URL) |
| **B&N** | Canonical B&N PDP (unchanged) |
| **Tracking** | `READERS_AGREE_AMAZON_CLICK`, `READERS_AGREE_BN_CLICK`, Buy Direct click event |
| **Best-deal copy** | **`/catalog` only** — signed paperback, FREE eBook, bookmarks, 15% referral math |

**Retailer return:** Bridge **routes preserved** — Phase D **replaces bridge UI** with light decide-next experience. **No** large return panel on landing. See [`bn-funnel-phase-d-plan.md`](bn-funnel-phase-d-plan.md).

---

### 4. Email capture **is** the Start Reading path

**No separate Start Reading button** competing with the email offer at the top.

**Sequence on page:**

```
1. Hero → 2. Pillars → 3. Locked paragraph
    → 4. Amazon | Barnes & Noble | Buy Direct
    → 5. Email offer (concise benefits)
    → Submit → /sample-chapters?{tracking} + nurture enroll + welcome email
    → suppress mobile Jody gate on this path
```

**Email offer — concise benefits (not a sales section):**

- Free sample chapters
- Upcoming sales / special offers
- Follow-on books
- Author / book-signing appearances
- Occasional *Agnes Protocol* updates

**After successful submit:**

| Requirement | Rule |
|-------------|------|
| Store lead + attribution | First-party durable record — **not Mailchimp-only** (see audit §5) |
| Navigation | **Immediate** `router.push` / assign to `/sample-chapters` with tracking params |
| Confirmation page | **None** |
| Extra click | **None** |
| Welcome email | Email 0 of prospect nurture — **production copy locked**; send concurrently with redirect |

---

### 5. First-party email ownership — subscribe path audit

**Conclusion: `POST /api/subscribe` alone is NOT sufficient** for the business requirement.

#### What `POST /api/subscribe` does today

| Step | Behavior |
|------|----------|
| Client | `subscribeEmail()` → `POST /api/subscribe` (agnes-next proxy → deepquill) |
| Body | **`{ email }` only** — no source, UTM, ref, visitorId, consent |
| Storage | **Mailchimp Marketing API** list member only (`MAILCHIMP_LIST_ID`) |
| New member tag | `deepquill-access` |
| Existing member | Returns `status: 'existing'` — **no tag update**, no DB write |
| Prisma `User` | **Not created** |
| `ReaderProfile` | **Not created** |
| `Customer` | **Not created** |
| Consent record | **Not stored** first-party — only Mailchimp `subscribed` status |
| Attribution | **Not stored** anywhere server-side |
| Welcome email | **Not sent** — no Mandrill/transactional call in `subscribe.cjs` |
| Failure mode | `SUBSCRIBE_FAIL_OPEN` default **true** — returns `ok: true` on Mailchimp errors (“soft-fail”) |
| Dev server | `deepquill/server/index.cjs` has **dev override** that short-circuits to fake success (production router may differ if override removed) |

#### What durable first-party ownership requires (business requirement)

A lead from this form must become a **durable The Agnes Protocol first-party record**, minimally:

1. **`User`** row via `ensureAssociateMinimal(email)` (`deepquill/api/associate/upsert.cjs`) — same pattern as Jody chapter deliver / remember place
2. **`ReaderProfile`** with `source: 'readers-agree-v2'` (or similar), attribution fields, consent timestamp
3. **Funnel `Event`** rows with `visitorId`, `ref`, `utm_*`, `fbclid`
4. **Optional:** Mailchimp list + tag for marketing automation (secondary, not primary)
5. **Welcome email** via **Mandrill** (`MAILCHIMP_TRANSACTIONAL_KEY`) — same stack as purchase/recommendation emails (`deepquill/lib/email/sendEmail.cjs`, `resendPurchaseEmails.cjs`)

#### Recommended implementation shape (study — not built)

**New endpoint** preferred over extending terminal subscribe:

`POST /api/readers-agree/lead` (or extend deliver pattern)

```
Body: { email, visitorId, ref, utm, consentAccepted, source: 'readers-agree-v2' }
Server:
  1. ensureAssociateMinimal(email)
  2. upsert ReaderProfile (source, consent, attribution snapshot)
  3. recordFunnelEvent READERS_AGREE_EMAIL_SUBMITTED
  4. enqueue/send **Email 0** (prospect nurture — locked copy) via Mandrill
  5. enroll prospect nurture sequence (`prospectNurtureEnrolledAt`)
  6. optional: Mailchimp tag readers-agree-v2-lead
Response: { ok: true, userId }
Client: writeContestEmail(email); set session marker; redirect /sample-chapters?{attribution incl. ref}
```

---

### 6. Mobile / Jody — suppress initial greeting only

**Decision:** Visitor who submitted RA v2 email and lands on `/sample-chapters` → **direct sample experience** — **no initial Jody mobile greeting** (`MobileChapterLanding`).

**Today:** When `NEXT_PUBLIC_JODY_MOBILE_DELIVERY=1`, mobile/tablet `<1024px` shows `MobileChapterLanding` (Jody email gate) **before** chapter PDF on `/sample-chapters/read/[id]` — **always**, regardless of prior email.

**Smallest path-specific marker (study recommendation):**

| Mechanism | Purpose |
|-----------|---------|
| On RA v2 submit | `sessionStorage.setItem('readers_agree_v2_lead', '1')` + `writeContestEmail(email)` |
| Pass through redirect | `/sample-chapters?{tracking}` — hub first per locked flow |
| On `ChapterReaderClient` mount | If marker present → skip rendering `MobileChapterLanding`; show PDF reader |
| Clear marker | After first chapter open or end of session — avoid permanent bypass |

**Preserve:** Jody Concierge exit flow, Phase 2 continuation (when enabled), return/momentum behaviors — only **initial mobile gate** suppressed for this path.

---

### 7. Long-scroll continuation — yes

Page is **not** artificially short.

| Zone | Content |
|------|---------|
| **Top** | Hero, pillars, locked paragraph, **three purchase buttons**, email offer |
| **Scroll** | Testimonials / social proof, author information |
| **Not on RA scroll** | No duplicate Buy Direct pitch — purchase at step 4; best-deal copy on `/catalog` |

Visitors ready to buy use step 4. Visitors not ready use email → `/sample-chapters`.

---

### 8. `/readers-cant-put-it-down` — do not retire yet

**Decision:** **No redirect, no retirement** while v2 `/readers-agree` is built, tested, and measured. Decide future after replacement proves itself.

---

### 9. Referral / Dorothy — preserve

| System | Rule |
|--------|------|
| Text-a-Friend SMS links | Keep `/readers-agree?ref=…` |
| `ref` attribution | Preserve through `buildReadersAgreePathWithTracking` |
| Dorothy bridge + momentum | Preserve for referral retailer clicks |
| Conditional presentation | **`ref` / `code` present** → friend intro + existing bridge behavior |
| Paid ad params only | Omit friend intro; ad-native headline |

#### Referral compensation — NOT contest functionality (locked)

Discontinuing the contest must **not** disable, remove, or alter the existing referral compensation system.

**Do not model podcaster/regional compensation as a flat $5 commission.**

| Mechanism | Amount | Recipient |
|-----------|--------|-----------|
| **Direct referral commission** | **$2.00** | Person who directly sponsored/referred the buyer |
| **Podcaster / regional override** | **$3.00** | Qualified designated rep on qualifying purchases in their **lineage** |

**Combined example (podcaster is also direct sponsor):** $2 direct + $3 override = **$5 total to that person** — two separate payouts, not one “$5 tier.”

**Downline example (someone else is direct sponsor):** direct sponsor gets **$2**; qualified upstream podcaster/regional gets **$3** override — podcaster receives **$3**, not $5.

**V2 scope:** Preserve **direct sponsor** `ref` attribution through lead capture, nurture CTAs, and checkout. At purchase, existing webhook logic independently determines direct $2 commission and qualified $3 override.

**Audit rule:** Locate and document the $3 override/lineage implementation before modifying payout code. If behavior differs from these rules → **stop and report**; do not change payout logic.

Full detail: [`bn-funnel-readers-agree-v2-prospect-nurture-study.md`](bn-funnel-readers-agree-v2-prospect-nurture-study.md) § Referral compensation.

**Referral relationship must survive the full path:**

```
referral link → /readers-agree → lead capture → /sample-chapters → nurture sequence → later qualifying purchase
```

Preserve `ref` (and `code` if present) in: middleware cookies, lead snapshot, post-submit redirect, **every nurture email CTA**, and checkout metadata resolution (`checkout.ts`).

**Purchase** suppresses prospect nurture emails — it does **not** cancel referral attribution for a later qualifying purchase.

---

### 10. Implementation phases

| Phase | Scope |
|-------|--------|
| **A** | Study locked ✓ |
| **B** | Hero, pillars, locked paragraph, typography |
| **C** | Three clean purchase buttons; Amazon/B&N buy PDPs; Buy Direct → `/catalog`; bridge; Amazon Attribution hook (fallback URL until real tags) |
| **C-catalog** | Catalog Best Deal + signed copy restore + value stack + price math |
| **D** | Lead endpoint + nurture + **landing email block** + **bridge redesign** + `/sample-chapters` redirect + Jody suppress — [`bn-funnel-phase-d-plan.md`](bn-funnel-phase-d-plan.md) |
| **F** | Long-scroll testimonials / author on RA |
| **F** | Long-scroll testimonials, author — **no** extra purchase pitch on RA |
| **G** | Point new ads to `/readers-agree`; measure vs Phase 0 baseline |

Optional flag: `NEXT_PUBLIC_READERS_AGREE_V2=1` for staged rollout.

**Protected:** Text-a-Friend, Dorothy bridge, checkout/Stripe/**referral compensation**, Phase 2 spec, `/readers-cant-put-it-down`.

---

### 11. Prospect nurture sequence — production copy locked

After lead capture, enroll in timed prospect nurture. **Full spec + verbatim email copy:** [`bn-funnel-readers-agree-v2-prospect-nurture-study.md`](bn-funnel-readers-agree-v2-prospect-nurture-study.md).

| Rule | Detail |
|------|--------|
| Timing | **Immediate → 48 hours → Day 5 → Day 10 → Day 14** |
| CTA | Every email → `/sample-chapters?{attribution}` — **no PDFs** |
| Copy | **Production copy locked** — not placeholders |
| Suppression | Check purchase before every send; stop all remaining on purchase |
| Attribution | Preserve `ref` + UTMs on every nurture CTA and server-side snapshot |
| Platform | Mandrill + DB + daily cron — no separate marketing platform |

**Email subjects (index):**

0. Your free chapters are ready  
1. Something doesn't add up.  
2. They're just getting started.  
3. Readers didn't expect this.  
4. You've only seen the beginning.

---

## Page map (locked structure — final 2026-08-17)

```
┌─────────────────────────────────────────┐
│ 1. Hero — Capitol + book                │
├─────────────────────────────────────────┤
│ 2. Three pillars                        │
│ 3. Locked story paragraph               │
├─────────────────────────────────────────┤
│ 4. [ Amazon ] [ Barnes & Noble ]        │
│    [ Buy Direct ]                       │
├─────────────────────────────────────────┤
│ 5. Email / free-reading offer           │
│ 6. Submit → /sample-chapters (Phase D)  │
├─────────────────────────────────────────┤
│ Long scroll (Phase F): testimonials,     │
│ author — no duplicate purchase pitch    │
└─────────────────────────────────────────┘
```

**Catalog (`/catalog`):** Best Deal selling — signed copy, FREE eBook, bookmarks, referral price math.

---

## Canonical retailer URLs (v2)

| Retailer | v2 URL | Prior URL (review anchor) |
|----------|--------|---------------------------|
| Amazon | `https://www.amazon.com/dp/B0GWQBDH66` | `…/dp/B0GWQBDH66#customerReviews` |
| B&N | `https://www.barnesandnoble.com/w/the-agnes-protocol-simon-mcquade/1147811774?ean=9798998952609` | Same |
| ISBN | `9798998952609` | — |

---

## Analytics (additive)

| Event | When |
|-------|------|
| `READERS_AGREE_PAGE_VIEW` | Unchanged |
| `READERS_AGREE_AMAZON_CLICK` | Amazon top CTA |
| `READERS_AGREE_BN_CLICK` | B&N top CTA |
| `READERS_AGREE_EMAIL_FORM_SHOWN` | Email section visible |
| `READERS_AGREE_EMAIL_SUBMITTED` | Server-confirmed lead |
| `READERS_AGREE_BUY_CLICK` / `READERS_AGREE_BUY_DIRECT_CLICK` | Buy Direct → `/catalog` |
| `READERS_AGREE_EMAIL_SUBMITTED` | Server-confirmed lead (landing) |
| `READERS_AGREE_BRIDGE_*` | Bridge decide-next events — see [`bn-funnel-phase-d-plan.md`](bn-funnel-phase-d-plan.md) §10 |
| Scroll depth / time on page | Unchanged |

Meta/TikTok `ViewContent` on page mount — unchanged.

---

## Safest implementation plan (revised)

| Phase | Scope | Risk |
|-------|--------|------|
| **A** | Study locked ✓ | — |
| **B** | Hero (asset swap only if approved), pillars, locked paragraph, typography, conditional headline | Low |
| **C** | Three clean buttons; retailers + Buy Direct → catalog; Amazon fallback URL; bridge | Medium |
| **C-catalog** | Catalog Best Deal + signed copy | Medium |
| **D** | Lead endpoint + nurture + email block + `/sample-chapters` redirect + Jody suppress | **High** |
| **E** | Mobile Jody suppress (RA email path) | Low–medium |
| **F** | Long-scroll — no extra RA purchase pitch | Low |
| **G** | Point new ads to `/readers-agree`; measure vs Phase 0 baseline | Config |
| **—** | `/readers-cant-put-it-down` | **No change** until post-measurement decision |

Optional flag: `NEXT_PUBLIC_READERS_AGREE_V2=1` for staged rollout.

**Protected:** Text-a-Friend, Dorothy bridge, checkout/Stripe/referral **compensation**, Phase 2 spec, `/readers-cant-put-it-down`.

---

## Conflicts & remaining technical questions

### Conflicts to resolve before code

| # | Issue | Options |
|---|--------|---------|
| 1 | **`AMAZON_REVIEWS_URL` global constant** still has `#customerReviews`; used by Meta landing, bridge, continue-reading | Add `AMAZON_PRODUCT_URL` for buy PDP; keep review URL for legacy pages OR migrate all to buy PDP |
| 2 | **`POST /api/subscribe` insufficient** | New `/api/readers-agree/lead` (recommended) — do not wire v2 to terminal subscribe |
| 3 | **Welcome email** | **Email 0** — locked production copy; CTA → `/sample-chapters?{attribution}` |
| 4 | **Redirect target** | **Locked:** `/sample-chapters` hub with full attribution — same as all nurture CTAs |
| 5 | **Mobile gate** | Production `JODY_MOBILE_DELIVERY=1` — v2 marker must be implemented before ads launch or mobile users hit double email capture |
| 6 | **Consent copy** | Checkbox vs submit-button consent; text for CAN-SPAM/GDPR-style clarity — legal copy TBD |
| 7 | **Mailchimp role** | Primary DB + Mandrill transactional for nurture; Mailchimp Marketing list optional sync only |
| 8 | **Phase 2 architecture freeze** | RA v2 is landing UX upstream of Phase 2 — does not change breakpoint spec; document as approved product change |
| 9 | **Dorothy + direct Amazon/B&N links** | Paid traffic: external PDP directly vs bridge? Referral: keep bridge. Simplest: bridge only when `ref` present |
| 10 | **Dev subscribe override** | `deepquill/server/index.cjs` dev stub may mask subscribe testing — verify production path separately |
| 11 | **Prospect nurture vs `no-purchase-reminder`** | Must exclude RA v2 cohort before ads live — see prospect nurture study |
| 12 | **Phase 2 vs prospect nurture overlap** | Known Reader continuation should suppress prospect sequence |
| 13 | **Referral compensation ($2 direct + $3 override)** | Contest sunset must not alter — audit webhook; preserve attribution |
| 14 | **Buy Direct card on RA** | **Rejected** — three clean equal buttons only; see canonical plan |

### Prospect nurture sequence (production copy locked)

After v2 lead capture, enroll leads in the **five-email prospect nurture sequence**. Full copy + infrastructure: [`bn-funnel-readers-agree-v2-prospect-nurture-study.md`](bn-funnel-readers-agree-v2-prospect-nurture-study.md).

| Rule | Detail |
|------|--------|
| Timing | **Immediate → 48 hours → Day 5 → Day 10 → Day 14** |
| CTA | Every email → `/sample-chapters?{attribution}` (no PDFs; reader picks chapter) |
| Copy | **Production copy locked** — use verbatim subjects/bodies/CTA labels from nurture study |
| Suppression | Check purchase before **every** send; stop all remaining on purchase |
| Attribution | Preserve `ref` + UTMs on every nurture CTA; server-side snapshot at enroll |
| Referral | Preserve direct-sponsor `ref`; $2 direct + $3 override determined at purchase — not contest-dependent |
| Platform | Mandrill + DB + daily cron job |

**Not sufficient:** `POST /api/subscribe` → Mailchimp Marketing list alone.

### Open product questions (non-blocking for Phase B)

1. ~~Welcome email: link to hub or Chapter 1?~~ **Locked:** hub for Email 0 + all nurture emails  
2. Testimonials: static quotes vs pull from admin/reviews?  
3. ~~Bottom Buy Direct on RA?~~ **Rejected** — three buttons at step 4 only  
4. Email form: single field + submit label (e.g. “Start Reading Free”)?  
5. ~~Prospect nurture copy voice~~ **Locked** — see nurture study  

---

## Related documents

| Document | Relationship |
|----------|--------------|
| `docs/bn-funnel-phase0-baseline.md` | Measurement baseline |
| `docs/bn-funnel-phase1-implementation.md` | Current RA (superseded in part by v2) |
| `docs/bn-funnel-phase2-baseline-specification.md` | Phase 2 frozen; RA as return destination unchanged |
| `docs/funnel-analytics.md` | Event architecture |
| `docs/bn-funnel-readers-agree-v2-prospect-nurture-study.md` | Timed prospect nurture after lead capture |
| `docs/bn-funnel-phase-d-plan.md` | **Authoritative Phase D** — email capture + bridge redesign |
| `docs/bn-funnel-buy-direct-best-value-plan.md` | **Canonical** funnel architecture (RA + catalog + sample-chapters) |
| `docs/bn-funnel-readers-agree-amazon-attribution-study.md` | Amazon Attribution integration (Phase C prep) |
| Purchase-routing audit (2026-08-17) | Superseded: ads → `/readers-agree` not `/catalog` |

---

*Study only. Locked through §11. Production prospect nurture copy locked. Implementation begins after lead-endpoint design approved.*
