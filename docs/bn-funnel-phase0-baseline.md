# Barnes & Noble Funnel — Phase 0 Baseline

**Captured:** 2026-08-03 (UTC-6)  
**Source:** Production admin dashboards (`/admin/funnel`, `/admin/content`, `/admin/jody`) — screenshots by operator  
**Purpose:** Pre-change production snapshot before Phase 1 Readers Agree B&N funnel redesign.  
**Rule:** Do not modify historical analytics. New events may be added later; existing event types and definitions are frozen for comparison.

---

## Date ranges used

| Report | URL | Date range shown in UI | Notes |
|--------|-----|------------------------|-------|
| **Funnel** | `/admin/funnel` | Default ~30 days ending **2026-08-03** | Conversion path + event breakdown + engagement |
| **Content** | `/admin/content` | **2026-07-04 → 2026-07-20** | Unique-visitor chapter opens; CTA attribution |
| **Jody** | `/admin/jody` | **2026-07-27 → 2026-08-03** | 7-day window (dashboard default) |

When comparing post-launch metrics, use the **same date windows** where possible. Funnel stages are the primary before/after comparison set.

---

## Primary baseline — conversion path (`/admin/funnel`)

| Stage | Count | Notes |
|-------|------:|-------|
| Ad-attributed Readers Agree views | 1,798 | Page views with `utm_*`, `fbclid`, or ad origin params |
| Readers Agree — page viewed | 2,463 | `READERS_AGREE_PAGE_VIEW` |
| Readers Agree — Amazon Reviews clicked | 76 | `READERS_AGREE_AMAZON_CLICK` |
| Readers Agree — B&N Reviews clicked | 20 | `READERS_AGREE_BN_CLICK` |
| Readers Agree — Buy the Book clicked | 26 | `READERS_AGREE_BUY_CLICK` |
| Readers Agree — Sample Chapters clicked | 48 | `READERS_AGREE_SAMPLE_CHAPTERS_CLICK` (pre-redesign label) |
| Sample Chapters — page viewed | 163 | `SAMPLE_CHAPTERS_PAGE_VIEW` |
| Sample Chapters — Chapter 1 opened | 52 | `SAMPLE_CHAPTER_OPEN` (chapterId=1) — see limitation below |
| Sample Chapters — Chapter 2 opened | 6 | |
| Sample Chapters — Chapter 9 opened | 11 | |
| Sample Chapters — Chapter 45 opened | 4 | |
| Sample Chapters — Buy Book clicked | 3 | `SAMPLE_CHAPTERS_BUY_CLICK` |
| Sample Chapters — Hub clicked | 4 | `SAMPLE_CHAPTERS_HUB_CLICK` |
| Checkout started | 10 | `CHECKOUT_STARTED` |
| Purchase completed (client event) | 3 | `PURCHASE_COMPLETED` |
| Purchase recorded (server) | 3 | `Purchase` table — source of truth |
| Recommendation email sent | 16 | `User.readerRecommendationOutreachSentAt` |
| Text a Friend (ledger) | 7 | `TEXT_FRIEND_SHARED` |
| Referral purchase attributed | 2 | `ReferralConversion` |

---

## Event breakdown (`/admin/funnel` — same window)

| Event type | Count |
|------------|------:|
| `READERS_AGREE_TIME_ON_PAGE` | 3,699 |
| `READERS_AGREE_PAGE_VIEW` | 2,463 |
| `READERS_AGREE_SCROLL_DEPTH` | 1,787 |
| `SAMPLE_CHAPTERS_PAGE_VIEW` | 163 |
| `SAMPLE_CHAPTER_TIME_ON_PAGE` | 108 |
| `READERS_AGREE_AMAZON_CLICK` | 76 |
| `SAMPLE_CHAPTER_OPEN` | 73 |
| `READERS_AGREE_SAMPLE_CHAPTERS_CLICK` | 48 |
| `READERS_AGREE_BUY_CLICK` | 26 |
| `READERS_AGREE_BN_CLICK` | 20 |
| `JODY_EMAIL_ENTERED` | 13 |
| `CHECKOUT_STARTED` | 10 |
| `JODY_CHAPTER_COMPLETED` | 6 |
| `JODY_EMAIL_VERIFIED` | 6 |
| `JODY_APPEAR` | 5 |
| `SAMPLE_CHAPTERS_HUB_CLICK` | 4 |
| `SAMPLE_CHAPTERS_BUY_CLICK` | 3 |
| `PURCHASE_COMPLETED` | 3 |
| `JODY_UPDATES_ACCEPT` | 2 |
| `JODY_REMEMBER_PLACE_DECLINE` | 2 |
| `JODY_REMEMBER_PLACE_ACCEPT` | 1 |

---

## Content performance (`/admin/content` — 2026-07-04 → 2026-07-20)

Unique visitors per chapter; purchases matched by `ap_funnel_vid` after first open/click.

### Sample chapters

| Chapter | Opened | Average time | Purchased | Conversion |
|---------|-------:|--------------|----------:|-----------:|
| Chapter 1 | 31 | **6:21** | 0 | 0% |
| Chapter 2 | 6 | 0:44 | 0 | 0% |
| Chapter 9 | 10 | 0:21 | 0 | 0% |
| Chapter 45 | 4 | 1:48 | 0 | 0% |

### Readers Agree CTAs (attributed purchases)

| CTA | Clicked | Purchased | Conversion |
|-----|--------:|----------:|-----------:|
| Amazon Reviews | 49 | 0 | 0% |
| Barnes & Noble Reviews | 15 | 0 | 0% |
| Buy the Book | 25 | 2 | **8%** |
| Sample Chapters | 37 | 0 | 0% |

_Content report uses unique-visitor first-touch; funnel stage counts are raw event totals — expect minor differences (e.g. Ch.1 opened 31 unique vs 52 funnel stage events)._

---

## Jody dashboard (`/admin/jody` — 2026-07-27 → 2026-08-03, 7 days)

| Step | Count | Notes |
|------|------:|-------|
| Readers finishing Chapter 1 | 1 | Basis: `JODY_CHAPTER_COMPLETED` |
| Jody appeared | 1 | `JODY_APPEAR` |
| Remember My Place clicked | 0 | `JODY_REMEMBER_PLACE_ACCEPT` |
| Email entered | 2 | `JODY_EMAIL_ENTERED` |
| Email verified | 0 | `JODY_EMAIL_VERIFIED` |
| Updates accepted | 0 | `JODY_UPDATES_ACCEPT` |
| Returned readers | 0 | `RETURNED_WITH_JODY` |
| Not Now (declines) | 0 | Trust-preserving |
| Updates declined | 0 | |

_For the wider funnel window, event breakdown shows `JODY_EMAIL_ENTERED` = **13** and `JODY_EMAIL_VERIFIED` = **6** over ~30 days._

---

## Core metrics summary (funnel window)

| Metric | Admin source | Report key / event | Count |
|--------|--------------|-------------------|------:|
| Readers Agree views | `/admin/funnel` | `readers_agree_view` | **2,463** |
| Readers Agree Sample/Start clicks | `/admin/funnel` | `readers_agree_sample` | **48** |
| Amazon review clicks | `/admin/funnel` | `readers_agree_amazon` | **76** |
| Barnes & Noble review clicks | `/admin/funnel` | `readers_agree_bn` | **20** |
| Buy clicks (Readers Agree) | `/admin/funnel` | `readers_agree_buy` | **26** |
| Sample Chapters hub views | `/admin/funnel` | `sample_chapters_view` | **163** |
| Chapter 1 route opens | `/admin/funnel` | `sample_chapter_1` | **52** |
| Chapter 1 time-on-page (avg) | `/admin/content` | Chapter 1 `averageTime` | **6:21** |
| Checkout starts | `/admin/funnel` | `checkout_started` | **10** |
| Client purchase completed | `/admin/funnel` | `purchase_completed_event` | **3** |
| Server purchase records | `/admin/funnel` | `purchase_recorded` | **3** |
| Jody email entered (30d events) | `/admin/funnel` | `JODY_EMAIL_ENTERED` | **13** |
| Jody email verified (30d events) | `/admin/funnel` | `JODY_EMAIL_VERIFIED` | **6** |

---

## Derived ratios (funnel window)

| Ratio | Formula | Value |
|-------|---------|------:|
| Sample click rate | 48 ÷ 2,463 | **1.9%** |
| Hub views per RA sample click | 163 ÷ 48 | **3.4×** (hub also reached from non-RA paths) |
| Ch.1 opens per RA sample click | 52 ÷ 48 | **108%** (direct chapter entry also occurs) |
| Ch.1 open rate from hub | 52 ÷ 163 | **31.9%** |
| Checkout rate (from Ch.1 open) | 10 ÷ 52 | **19.2%** |
| Purchase rate (top of funnel) | 3 ÷ 2,463 | **0.12%** |
| RA buy click → purchase (content, unique) | 2 ÷ 25 | **8%** |
| Client vs server purchase delta | 3 − 3 | **0** |

### Success-metric progression (baseline)

| Transition | Baseline |
|------------|----------|
| Readers Agree → Sample/Start click | 48 / 2,463 (1.9%) |
| Sample click → Chapter 1 open | 52 / 48 |
| Chapter 1 open → Checkout started | 10 / 52 (19.2%) |
| Checkout started → Purchase | 3 / 10 (**30%**) |

_Post-redesign: compare the same stages; add `READERS_AGREE_START_READING_CLICK` and hub-bypass effect on sample click → Ch.1 path._

---

## Event definitions (frozen for Phase 0)

| Event | Fires when | Source |
|-------|------------|--------|
| `READERS_AGREE_PAGE_VIEW` | `/readers-agree` mount | `ReadersAgreeLandingClient.tsx` |
| `READERS_AGREE_SAMPLE_CHAPTERS_CLICK` | Sample Chapters / Start Reading CTA | Same |
| `READERS_AGREE_AMAZON_CLICK` | Amazon card or bridge | Landing + `ReviewRedirectClient.tsx` |
| `READERS_AGREE_BN_CLICK` | B&N card or bridge | Same |
| `READERS_AGREE_BUY_CLICK` | Buy the Book | Landing + bridge continuation |
| `SAMPLE_CHAPTERS_PAGE_VIEW` | `/sample-chapters` hub mount | `SampleChaptersClient.tsx` |
| `SAMPLE_CHAPTER_OPEN` | `/sample-chapters/read/{id}` mount | `ChapterReaderClient.tsx` |
| `SAMPLE_CHAPTER_TIME_ON_PAGE` | Chapter exit / visibility flush (≥1s) | Same |
| `CHECKOUT_STARTED` | Before Stripe session create | `checkout.ts` |
| `PURCHASE_COMPLETED` | Success page after `paid: true` | `OrderConfirmationClient.tsx` |
| `JODY_EMAIL_ENTERED` | Server: remember-place or mobile chapter deliver | deepquill jody APIs |
| `JODY_EMAIL_VERIFIED` | Server: verify token | deepquill remember verify |

**Server purchases:** `Purchase` rows from Stripe webhook — not an `Event` type.

---

## Critical analytics limitation

### `SAMPLE_CHAPTER_OPEN` ≠ confirmed reading

`SAMPLE_CHAPTER_OPEN` fires on **mount** of `/sample-chapters/read/{id}`, **regardless of whether the reader sees inline PDF, Open/Download panel, or the mobile email gate** (`MobileChapterLanding` when `NEXT_PUBLIC_JODY_MOBILE_DELIVERY=1`).

- A **Chapter 1 open** may mean **arrival at the email gate**, not immersion in the chapter.
- **`SAMPLE_CHAPTER_TIME_ON_PAGE`** is a better proxy for reading; Chapter 1 mean **6:21** in content report supports some real engagement among those who dwelled.
- Post-redesign comparisons should track funnel stages **and** Ch.1 average time together.

---

## Environment flags at baseline

| Flag | Effect on funnel | Production value |
|------|------------------|------------------|
| `NEXT_PUBLIC_READERS_AGREE_DOROTHY_BRIDGE` | Dorothy vs legacy review redirect | _not recorded in screenshots_ |
| `NEXT_PUBLIC_JODY_MOBILE_DELIVERY` | Mobile email-before-read on chapter routes | _not recorded in screenshots_ |
| `NEXT_PUBLIC_JODY_CONCIERGE_ENABLED` | Remember My Place on Ch.1 exit | _not recorded in screenshots_ |

---

## Screenshot archive

Captured 2026-08-03 and stored with this baseline:

- `/admin/funnel` — conversion path
- `/admin/funnel` — event breakdown
- `/admin/content` — sample chapters + Readers Agree CTAs
- `/admin/jody` — trust funnel (7-day window)

---

## Post-export sign-off

- [x] Funnel report exported (~30 days ending 2026-08-03)
- [x] Content report exported (2026-07-04 → 2026-07-20)
- [x] Jody report exported (2026-07-27 → 2026-08-03)
- [ ] Production feature flags recorded
- [x] Baseline tables filled
- [x] No historical Event rows modified

**Signed / date:** Operator capture 2026-08-03
