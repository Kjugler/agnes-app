# Reader Recommendation Email Outreach

Operational guide for sending **“Recommend The Agnes Protocol”** emails in controlled production batches.

This campaign asks readers who enjoyed the book to recommend it to **one friend** via the **Text-a-Friend** flow (`/text-a-friend?ref=…&email=…` → green button → SMS with `/readers-agree?ref=…`).

---

## Quick reference — send the next batch (Batch 2+)

**On Railway (deepquill), after `prisma migrate deploy`:**

```bash
# 1. Preview next 10 purchasers (no sends)
node scripts/send-reader-recommendation-batch.cjs --dry-run

# 2. Live send (requires TRANSACTIONAL_EMAIL_ENABLED=1)
node scripts/send-reader-recommendation-batch.cjs --live
```

**Defaults:**

| Setting | Default |
|---------|---------|
| Batch label | `Recommendation Email Batch 2` |
| Batch size | 10 |
| Template | `current` (Batch 2 subject + forward instruction) |
| Recipients | Purchasers only |
| Exclude prior batches | Yes |

**Custom future batch (Batch 3 example):**

```bash
node scripts/send-reader-recommendation-batch.cjs --dry-run \
  --batch "Recommendation Email Batch 3" \
  --limit 10 \
  --template current

node scripts/send-reader-recommendation-batch.cjs --live \
  --batch "Recommendation Email Batch 3" \
  --limit 10 \
  --template current
```

---

## Architecture

| Layer | Location |
|-------|----------|
| Email builder | `deepquill/lib/email/builders/readerRecommendationOutreach.cjs` |
| Batch config / parsing | `deepquill/lib/email/readerRecommendationOutreachConfig.cjs` |
| Job orchestration | `deepquill/lib/email/runReaderRecommendationOutreach.cjs` |
| CLI | `deepquill/scripts/send-reader-recommendation-batch.cjs` |
| Admin API | `GET/POST /api/admin/jobs/send-reader-recommendation-outreach` |
| agnes-next proxy | `agnes-next/src/app/api/admin/jobs/send-reader-recommendation-outreach/route.ts` |
| DB fields | `User.readerRecommendationOutreachSentAt`, `User.readerRecommendationOutreachBatch` |

**Mailchimp metadata** on each send:

- `campaign`: `reader_recommendation_outreach`
- `batch`: e.g. `Recommendation Email Batch 2`
- `template`: `batch_1` or `current`

---

## Selecting recipients

The job walks **active `ReaderProfile` rows** linked to a `User`, then applies filters in order:

### Included (Batch 2+ defaults)

- **Purchased the book** — at least one `Purchase` row for the user (`requirePurchase=true`)
- **Active** Reader Manager status
- **Real mailable email** (not `@reader.crm` synthetic)
- **Valid email** — passes outreach validation (blocks placeholders like `me@here.com`, domain typos like `gmail.comh`)
- **Referral code** present on `User`
- **Not fulfillment/admin staff** (`FulfillmentUser` emails)
- **Not Mailchimp suppressed** (rejects list)

### Excluded automatically

- Anyone with **`readerRecommendationOutreachSentAt` set** (all prior batches), when `excludePreviousBatches=true`
- Synthetic, `@example.com`, placeholder, or invalid emails
- Inactive profiles
- Phone-only readers (no mailable email)

### Ordering

When `requirePurchase=true`, eligible purchasers are ordered by **earliest purchase date** (oldest buyers first among those still unsent).

### Batch 1 note (historical)

Batch 1 (July 2, 2026) used the original job **without** the purchaser-only filter — it targeted the first 10 eligible Reader Manager contacts with mailable email. Batch 2+ defaults to **purchasers only**.

---

## Email templates

| Template ID | Subject | Extra copy |
|-------------|---------|------------|
| `batch_1` | Would you do me a small favor? | Original body |
| `current` | Someone you know would love The Agnes Protocol | After greeting: *Please don't forward this email…* (Batch 2+) |

Pass `--template batch_1` to resend the original copy (rare).

---

## Sending (three ways)

### 1. CLI (recommended for production batches)

```bash
cd deepquill
node scripts/send-reader-recommendation-batch.cjs --dry-run   # preview
node scripts/send-reader-recommendation-batch.cjs --live      # send
```

### 2. Admin HTTP job (deepquill)

Requires `x-admin-key` in production.

```http
GET /api/admin/jobs/send-reader-recommendation-outreach?dryRun=1&limit=10&batch=Recommendation%20Email%20Batch%202&template=current&requirePurchase=1&excludePreviousBatches=1
```

Live send: `dryRun=0` (and `TRANSACTIONAL_EMAIL_ENABLED=1` on deepquill).

### 3. agnes-next proxy (fulfillment cookie + ADMIN_KEY)

Same query string via:

```http
GET /api/admin/jobs/send-reader-recommendation-outreach?dryRun=1&limit=10&...
```

(requires fulfillment auth cookie)

---

## Logging & excluding future batches

On each **live** send, the job updates:

```text
User.readerRecommendationOutreachSentAt  → timestamp
User.readerRecommendationOutreachBatch  → e.g. "Recommendation Email Batch 2"
```

**Exclusion rule:** any user with `readerRecommendationOutreachSentAt` set is skipped when `excludePreviousBatches=true` (default).

Migration `20260708120000_reader_recommendation_outreach_batch` backfills **`Recommendation Email Batch 1`** for users already sent before the batch field existed.

---

## Production prerequisites

On **deepquill** (Railway):

| Variable | Purpose |
|----------|---------|
| `TRANSACTIONAL_EMAIL_ENABLED=1` | Allow live sends |
| `MAILCHIMP_TRANSACTIONAL_KEY` | Mandrill API |
| `MAILCHIMP_FROM_EMAIL` | From address |
| `SITE_URL` | `https://www.theagnesprotocol.com` |
| `DATABASE_URL` | Production Postgres |
| `ADMIN_KEY` | Admin job auth |

**Deploy steps for Batch 2:**

1. Deploy agnes-next + deepquill with this code
2. `cd deepquill && npx prisma migrate deploy`
3. Dry-run CLI or admin job — review `recipientSample`
4. Live send when sample looks correct

---

## Reporting & measuring results

### Opens and CTA clicks (email)

**Mailchimp Transactional (Mandrill)** → Messages → search subject:

- Batch 1: `Would you do me a small favor?`
- Batch 2+: `Someone you know would love The Agnes Protocol`

Or search metadata `reader_recommendation_outreach` and filter by send date.

Metrics available:

- **Sent / delivered** (SMTP events)
- **Opens** (unique openers — count recipients with `opens > 0`)
- **Clicks** on green button (tracked link to `/text-a-friend?ref=…`)

### Text launches

Recorded when a reader taps **Text a Friend** on the landing page:

- Ledger type: `TEXT_FRIEND_SHARED`
- Only fires if contest email cookie / identity is present

Query production DB (example):

```sql
SELECT l.*, u.email
FROM "Ledger" l
JOIN "User" u ON u.id = l."userId"
WHERE l.type = 'TEXT_FRIEND_SHARED'
  AND l."createdAt" >= '2026-07-02';
```

### Friend landing visits

`/readers-agree` — **no first-party visit log** today (Meta/TikTok pixels only).

### Referrals & purchases

**ReferralConversion** table — conversions attributed to referrer codes:

```sql
SELECT rc.*, u.email AS referrer_email
FROM "ReferralConversion" rc
JOIN "User" u ON u.id = rc."referrerUserId"
WHERE rc."createdAt" >= '2026-07-02'
ORDER BY rc."createdAt";
```

Referrer commission emails (“Activity on your referral link”, “Another reader discovered…”) in Mandrill also signal a attributed sale.

### Batch 1 results (baseline)

| Metric | Result |
|--------|--------|
| Sent | 10 |
| Delivered (est.) | ~8 (2 bad addresses) |
| Opened | 4 (40%) |
| CTA clicked | 1 |
| Attributed sale | 1 |

---

## Preparing the next batch (checklist)

1. **Clean Reader Manager** — fix/archive placeholder or typo emails (`me@here.com`, etc.)
2. **Migrate** — `npx prisma migrate deploy` if new columns pending
3. **Dry-run** — confirm `wouldSend: 10`, review `recipientSample` emails/names
4. **Check skipped.alreadySent** — should equal all prior batch recipients
5. **Check skipped.placeholder** — should be 0 before live send
6. **Live send** — CLI `--live` or admin `dryRun=0`
7. **Verify** — Mandrill shows 10 new messages; DB shows `readerRecommendationOutreachBatch` updated
8. **Wait 48–72 hours** — measure opens/clicks before changing copy again

---

## Funnel (for interpretation)

```text
Recommendation email
  → open
  → click green CTA (/text-a-friend)
  → tap "Text a Friend" (TEXT_FRIEND_SHARED) — optional observability
  → friend opens /readers-agree — limited observability
  → friend purchases with ref (ReferralConversion)
```

Biggest measurable gaps today: **text launch**, **friend landing**, and **forwards** (not tracked).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `transactionalDisabled: true` | `TRANSACTIONAL_EMAIL_ENABLED` not set on **deepquill** | Set to `1`, redeploy |
| `wouldSend: 0`, high `alreadySent` | Prior batch already marked users | Expected; increase pool or wait for new purchasers |
| `wouldSend: 0`, high `notPurchased` | `requirePurchase=true` but no purchases | Use `--all-readers` only if intentional |
| Bad addresses in sample | Stale CRM data | Fix in Reader Manager before send |

---

## One-command future batches

For Batch 3 and beyond, only change the batch label:

```bash
node scripts/send-reader-recommendation-batch.cjs --live \
  --batch "Recommendation Email Batch 3"
```

Everything else stays at safe defaults: **10 recipients**, **current template**, **purchasers only**, **exclude previous batches**.
