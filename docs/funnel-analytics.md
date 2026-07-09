# Reader Funnel Analytics

First-party analytics for `/readers-agree`, `/sample-chapters`, and the full conversion path through purchase and referral.

Events are stored in the **deepquill `Event` table** (same infrastructure as admin audit events). Downstream stages join **Purchase**, **ReferralConversion**, **Ledger** (`TEXT_FRIEND_SHARED`), and **User.readerRecommendationOutreachSentAt**.

---

## Audit summary (before this work)

| Event | Status before | Status now |
|-------|---------------|------------|
| **Readers Agree — page viewed** | Meta/TikTok `ViewContent` only | `READERS_AGREE_PAGE_VIEW` → Event |
| **Readers Agree — time on page** | Not tracked | `READERS_AGREE_TIME_ON_PAGE` → Event |
| **Readers Agree — scroll depth** | Not tracked | `READERS_AGREE_SCROLL_DEPTH` → Event (25/50/75/100%) |
| **Readers Agree — Amazon clicked** | Not tracked | `READERS_AGREE_AMAZON_CLICK` → Event |
| **Readers Agree — B&N clicked** | Not tracked | `READERS_AGREE_BN_CLICK` → Event |
| **Readers Agree — Sample Chapters clicked** | Not tracked | `READERS_AGREE_SAMPLE_CHAPTERS_CLICK` → Event |
| **Sample Chapters — page viewed** | Meta/TikTok `ViewContent` only | `SAMPLE_CHAPTERS_PAGE_VIEW` → Event |
| **Sample Chapters — Chapter 1/2/9/45 opened** | Meta/TikTok per chapter only | `SAMPLE_CHAPTER_OPEN` → Event (`meta.chapterId`) |
| **Sample Chapters — Buy Book clicked** | Not tracked | `SAMPLE_CHAPTERS_BUY_CLICK` → Event |
| **Sample Chapters — Hub clicked** | Not tracked | `SAMPLE_CHAPTERS_HUB_CLICK` → Event |
| **Checkout started** | Mailchimp `/api/track` only (no DB) | `CHECKOUT_STARTED` → Event |
| **Purchase completed (client)** | Mailchimp `/api/track` only | `PURCHASE_COMPLETED` → Event |
| **Purchase recorded (server)** | Already tracked | `Purchase` + `PURCHASE_RECORDED` ledger |
| **Recommendation email sent** | Already tracked | `User.readerRecommendationOutreachSentAt` |
| **Text a Friend** | Partial (`TEXT_FRIEND_SHARED` ledger when contest email present) | Unchanged — ledger row |
| **Referral purchase** | Already tracked | `ReferralConversion` |
| **Ad click / landing** | Meta/TikTok pixels only | Subset: Readers Agree views with `utm_*`, `fbclid`, or ad `origin` |

**Still third-party only:** Meta/TikTok/Microsoft global PageView and ViewContent (kept alongside first-party events).

**Still missing:** per-visitor session stitching across email forwards; `/text-a-friend` page visit (out of this page scope).

---

## Architecture

| Layer | Path |
|-------|------|
| Client tracker | `agnes-next/src/lib/funnelTracking.ts` |
| Ingest proxy | `POST /api/funnel/event` → deepquill `POST /api/funnel/event` |
| Record | `deepquill/lib/funnel/recordFunnelEvent.cjs` → `Event` row |
| Admin report | `GET /api/admin/funnel-report` |
| Admin UI | `/admin/funnel` |

**Visitor ID:** cookie + localStorage `ap_funnel_vid` (anonymous correlation).

**Attribution:** `ref`, `utm_*`, `fbclid`, `src`, `origin` captured in `Event.meta` from URL or cookies.

---

## Full conversion path (admin report)

The report at **`/admin/funnel`** shows stage counts for:

1. Ad-attributed Readers Agree views
2. Readers Agree page view
3. Amazon Reviews click
4. B&N Reviews click
5. Sample Chapters click (from Readers Agree)
6. Sample Chapters page view
7. Chapter 1 / 2 / 9 / 45 opened
8. Buy Book click
9. Hub (Back) click
10. Checkout started
11. Purchase completed (client event)
12. Purchase recorded (server `Purchase` count)
13. Recommendation email sent
14. Text a Friend (`TEXT_FRIEND_SHARED` ledger)
15. Referral purchase (`ReferralConversion`)

---

## Querying raw events (SQL)

```sql
SELECT type, COUNT(*) AS n
FROM "Event"
WHERE type IN (
  'READERS_AGREE_PAGE_VIEW',
  'READERS_AGREE_AMAZON_CLICK',
  'SAMPLE_CHAPTERS_PAGE_VIEW',
  'SAMPLE_CHAPTER_OPEN',
  'CHECKOUT_STARTED',
  'PURCHASE_COMPLETED'
)
  AND "createdAt" >= '2026-07-01'
GROUP BY type
ORDER BY n DESC;
```

Chapter opens:

```sql
SELECT meta->>'chapterId' AS chapter, COUNT(*) AS n
FROM "Event"
WHERE type = 'SAMPLE_CHAPTER_OPEN'
GROUP BY 1;
```

---

## Deploy notes

No Prisma migration required — uses existing `Event` model.

After deploy, verify:

```bash
# In browser devtools on /readers-agree — should POST /api/funnel/event
# Admin (fulfillment auth):
# GET /api/admin/funnel-report?start=2026-07-01&end=2026-07-31
```

Pixels remain active; first-party events are additive.

---

## Content performance (`/admin/content`)

**Sample chapters** — per chapter (1, 2, 9, 45):

| Metric | Source |
|--------|--------|
| Opened | Unique `ap_funnel_vid` with `SAMPLE_CHAPTER_OPEN` |
| Average time | Mean `SAMPLE_CHAPTER_TIME_ON_PAGE` (recorded on exit) |
| Conversion | % of openers with `PURCHASE_COMPLETED` after first open |

**Readers Agree CTAs** — Amazon, B&N, Sample Chapters card clicks:

| Metric | Source |
|--------|--------|
| Clicked | Unique visitors with click event |
| Purchased | Same visitor ID with `PURCHASE_COMPLETED` after click |
| Conversion | purchased / clicked |

API: `GET /api/admin/content-report?start=YYYY-MM-DD&end=YYYY-MM-DD`
