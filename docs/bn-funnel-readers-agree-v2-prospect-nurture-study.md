# Readers Agree v2 — Prospect Nurture Sequence (Study)

**Status:** Study only — **production copy locked** (2026-08-17)  
**Last revised:** 2026-08-17 (referral compensation business-rule correction)  
**Parent:** [`bn-funnel-readers-agree-v2-study.md`](bn-funnel-readers-agree-v2-study.md)  
**Rule:** Do not implement until lead-capture endpoint (§5 parent study) is approved.

> **Consolidation instruction:** The five-email prospect sequence below is **production copy**, not placeholder copy. Use the exact subject/body/CTA text in the authoritative V2 implementation plan. Timing: Immediate → 48 hours → Day 5 → Day 10 → Day 14. Every CTA routes to `/sample-chapters`. Preserve the lead's original **direct sponsor** referral attribution through nurture return traffic. Do **not** model podcaster/regional compensation as a flat $5 commission — see § Referral compensation.

---

## Executive summary

After a `/readers-agree` v2 lead is captured, begin a **timed prospect nurture sequence** aimed at readers who are interested but have **not yet purchased**.

| Principle | Rule |
|-----------|------|
| CTA destination | Every nurture email links to **`/sample-chapters`** — reader chooses where to continue |
| Attachments | **No PDFs** in email |
| Chapter selection | **Do not** pick a chapter from reading position in v1 |
| Message personalization | Reading/activity **may alter copy** — not routing |
| Purchase suppression | Check purchase status **before every scheduled send**; suppress all remaining emails immediately on purchase |
| Platform | **No separate marketing platform required** — use existing DB + Mandrill + cron/job pattern |

**Verdict:** Existing infrastructure **can support** Immediate / 48 hours / Day 5 / Day 10 / Day 14 with **modest schema additions** and a **new admin/cron job**. Mailchimp Marketing list (`POST /api/subscribe`) is **not** the right backbone for this sequence.

---

## Locked sequence (production)

| Step | Timing | Subject | CTA label | CTA URL |
|------|--------|---------|-----------|---------|
| **0 — Immediate** | On lead submit | Your free chapters are ready | START READING | `/sample-chapters?{attribution}` |
| **1** | **48 hours** after enroll | Something doesn't add up. | KEEP READING | `/sample-chapters?{attribution}` |
| **2** | Day 5 | They're just getting started. | CONTINUE THE STORY | `/sample-chapters?{attribution}` |
| **3** | Day 10 | Readers didn't expect this. | SEE WHY READERS AGREE | `/sample-chapters?{attribution}` |
| **4** | Day 14 | You've only seen the beginning. | CONTINUE THE AGNES PROTOCOL | `/sample-chapters?{attribution}` |

**No PDFs.** **No chapter auto-selection.** Reader chooses where to continue from the hub.

**Tracking on CTA links:** Append enrollment attribution snapshot (`ref`, `utm_*`, and other params needed for referral compensation) so nurture return traffic does not sever the referrer relationship. `visitorId` may remain server-side only.

---

## LOCK FINAL PROSPECT NURTURE COPY

Use **verbatim** in Mandrill builders. Button text is the CTA label; href is always `/sample-chapters` with preserved attribution query params.

### Email 0 — Immediate

**Purpose:** Invitation + Mystery

**Subject:** Your free chapters are ready

**Body:**

> Something happened to Jody Vernon.
>
> Your free chapters of The Agnes Protocol are waiting.

**CTA:** [START READING] → `/sample-chapters?{attribution}`

---

### Email 1 — 48 Hours

**Purpose:** Mystery + Intelligence

**Subject:** Something doesn't add up.

**Body:**

> The deeper you get into The Agnes Protocol, the more you realize very little is happening by accident.

**CTA:** [KEEP READING] → `/sample-chapters?{attribution}`

---

### Email 2 — Day 5

**Purpose:** Character + Excitement

**Subject:** They're just getting started.

**Body:**

> A handful of unlikely people are beginning to realize what they're up against.
>
> And the drama is just getting started.

**CTA:** [CONTINUE THE STORY] → `/sample-chapters?{attribution}`

---

### Email 3 — Day 10

**Purpose:** Reader Proof + Heart

**Subject:** Readers didn't expect this.

**Body:**

> They expected conspiracy, technology, and political intrigue.
>
> They didn't expect how much they'd care about the people caught inside it.

**CTA:** [SEE WHY READERS AGREE] → `/sample-chapters?{attribution}`

---

### Email 4 — Day 14

**Purpose:** Momentum + Resolution

**Subject:** You've only seen the beginning.

**Body:**

> You've met some of them. You've seen what they're up against.
>
> But you haven't seen what happens next.

**CTA:** [CONTINUE THE AGNES PROTOCOL] → `/sample-chapters?{attribution}`

---

**Voice:** Jody-adjacent mystery/thriller tone — distinct from Phase 2 **Known Reader** continuation nurture (`bn-funnel-phase2-nurture-emails-draft.md`) and from legacy contest **`no-purchase-reminder`** tone.

---

## Behavioral rules (locked)

### CTA — sample hub only

- All nurture emails: primary CTA → **`/sample-chapters`**
- No attached PDFs; no deep-link to `/sample-chapters/read/1` in v1
- Reader chooses chapter from hub

### Activity-informed copy (optional v1)

Before composing a scheduled email, job **may read** recent `Event` rows for `userId` / `visitorId`:

| Signal | Example use in copy |
|--------|---------------------|
| `SAMPLE_CHAPTERS_PAGE_VIEW` | Acknowledge return to hub |
| `SAMPLE_CHAPTER_OPEN` + `chapterId` | Reference that they started (without auto-linking to that chapter) |
| `SAMPLE_CHAPTER_TIME_ON_PAGE` | Light “pick up where you left off” language — hub link only |
| No reading events | Encourage first sample |

**Does not change:** send timing, suppression logic, or CTA URL target.

### Purchase suppression (required)

**Before every send** (including welcome if async):

```text
if userHasPurchase(userId):
    mark prospect nurture suppressed / complete
    skip send
```

Use existing `userHasPurchase()` (`deepquill/lib/readers/readerStatus.cjs`):

- `User.earnedPurchaseBook === true`, **or**
- `Purchase.count({ userId }) > 0`

**On purchase after enrollment:** all remaining steps suppressed — no Day 2/5/10/14.

**Edge case (study):** Guest checkout may create `Purchase` before `User` merge; also check `ReferralConversion.buyerEmail` if email-normalized match — same pattern as `send-engaged-reminders`.

---

## Infrastructure audit

### 1. Database

| Asset | Today | Supports nurture? |
|-------|-------|-------------------|
| **`User`** | Durable email identity; `purchases[]`; `earnedPurchaseBook` | ✓ Purchase check |
| **`ReaderProfile`** | `source`, `readerType`, consent fields, Jody delivery fields | **Partial** — needs nurture step fields or companion table |
| **`Purchase`** | Server source of truth for Owner | ✓ Suppression |
| **`Event`** | Funnel events; `meta` JSON with `visitorId`, UTM, `ref` | ✓ Activity + attribution reporting |
| **Nurture enrollment model** | **Does not exist** | ✗ Must add |

**Existing one-shot email flags on `User` (not suitable for multi-step):**

| Field | Job |
|-------|-----|
| `noPurchaseEmailSentAt` | Single generic contest reminder @ 24h |
| `engagedEmailSentAt` | Single engaged reminder |
| `nonParticipantEmailSentAt` | Single non-participant reminder |
| `missionaryEmailSentAt` | Post-purchase single email |

**Gap:** No `prospectNurtureStep`, `prospectNurtureEnrolledAt`, or send log.

#### Recommended schema (study — minimal)

**Option A — columns on `ReaderProfile` (simplest):**

| Field | Purpose |
|-------|---------|
| `prospectNurtureEnrolledAt` | Sequence start |
| `prospectNurtureStep` | Last completed step (0–4) |
| `prospectNurtureLastSentAt` | Last send timestamp |
| `prospectNurtureSuppressedAt` | Set on purchase or unsubscribe |
| `prospectNurtureSuppressedReason` | `purchased` \| `unsubscribed` \| `manual` |
| `leadAttribution` | JSON snapshot: `utm_source`, `utm_medium`, `utm_campaign`, `ref`, `origin`, `visitorId`, `channel` |

**Option B — `ProspectNurtureSend` log table (better audit):**

One row per attempted send with `step`, `status`, `mandrillId`, `meta` — enrollment fields still on `ReaderProfile`.

**Recommendation:** Option A for v1 + `Event` row per send (`PROSPECT_NURTURE_SENT`); upgrade to Option B if compliance/audit needs grow.

---

### 2. Mandrill (transactional email)

| Piece | Location | Role |
|-------|----------|------|
| Client | `deepquill/lib/email/sendEmail.cjs` | `MAILCHIMP_TRANSACTIONAL_KEY` |
| Admin jobs | `deepquill/server/routes/adminJobs.cjs` | Same client via `getMailchimpClient()` |
| Builders | `deepquill/lib/email/builders/*.cjs` | HTML templates |
| Guards | `guardMailableEmail.cjs` | Blocks synthetic/invalid addresses |
| Banner | `applyGlobalEmailBanner` | Identity wrapper |

**Supports nurture without new platform:** ✓ — HTML emails with link CTAs only.

**Not used for this sequence:** Mailchimp Marketing API (`subscribe.cjs`, `MAILCHIMP_LIST_ID`, tag `deepquill-access`).

---

### 3. Scheduled jobs / cron

| Pattern | Example | Nurture fit |
|---------|---------|-------------|
| **deepquill admin job** | `GET /api/admin/jobs/send-no-purchase-reminders` | ✓ Template for batch send + DB stamp |
| **Vercel cron → proxy** | `agnes-next` `/api/cron/daily-contest-summary` → deepquill job | ✓ Add `/api/cron/prospect-nurture` @ daily |
| **Railway scheduler** | Manual curl to admin jobs | ✓ Alternative if Vercel cron insufficient |
| **In-email scheduling** | — | ✗ Not used today |

**No multi-step scheduler exists today.** v1 approach:

1. **Welcome (step 0):** Send synchronously or fire-and-forget from lead endpoint on enroll.
2. **Steps 1–4:** Daily job selects enrollments where:
   - `prospectNurtureSuppressedAt IS NULL`
   - `userHasPurchase` is false
   - `daysSince(prospectNurtureEnrolledAt) >= threshold` for next step
   - `prospectNurtureStep < nextStep`

Day thresholds: `{ 0: 0, 1: 2, 2: 5, 3: 10, 4: 14 }` (step 1 = **48 hours** / 2 days from enroll).

**Timing granularity:** Daily cron is sufficient (±24h jitter acceptable for v1). Step 1 target is **48 hours**, not calendar “Day 2” ambiguity — implement as `hoursSince(enrolledAt) >= 48` or equivalent day-offset ≥ 2.

---

### 4. Lead capture prerequisite (parent study)

Prospect nurture **depends on** durable first-party lead creation (`POST /api/readers-agree/lead` per parent study):

| Requirement | Why |
|-------------|-----|
| `ensureAssociateMinimal(email)` → `User.id` | Purchase check + email send target |
| `ReaderProfile` with `source: 'readers-agree-v2'` | Cohort filter |
| `leadAttribution` JSON at enroll | Channel reporting |
| `READERS_AGREE_EMAIL_SUBMITTED` event | Funnel analytics |
| Set `prospectNurtureEnrolledAt` | Sequence clock start |

---

## Attribution preservation

### At enrollment (capture once)

Store immutable snapshot on `ReaderProfile.leadAttribution` (or first `Event` meta):

| Field | Source |
|-------|--------|
| `visitorId` | `ap_funnel_vid` |
| `ref` | URL / `ap_ref` cookie / `ref` cookie |
| `code` | URL (referral video links) |
| `utm_source` | URL |
| `utm_medium` | URL |
| `utm_campaign` | URL |
| `origin` | URL |
| `fbclid` | URL (optional) |
| `channel` | Derived enum for reporting |

**Derived `channel` examples (study):**

| Input | `channel` |
|-------|-----------|
| `utm_source=facebook` or `fbclid` | `meta` |
| `utm_source=tiktok` | `tiktok` |
| `utm_campaign` contains `jason` or custom | `jason_newsletter` |
| `ref` present, no paid UTM | `referral` |
| else | `organic` or `unknown` |

### In nurture emails (required)

Every CTA href must re-apply the enrollment snapshot so **two weeks of nurturing does not sever referral or campaign relationships**:

```
/sample-chapters?ref={ref}&utm_source=...&utm_medium=...&utm_campaign=...
```

**Minimum for referral compensation:** preserve `ref` (and `code` if present at enroll) on every nurture CTA. Paid-media UTMs preserved for performance reporting.

**Also persist server-side:** enrollment snapshot on `ReaderProfile` so checkout can resolve referral even if cookies expire — lead endpoint should write `ref` into durable first-party storage, not rely on email links alone.

### Referral path that must survive (locked)

```
referral link → /readers-agree → lead capture → /sample-chapters → nurture sequence → later qualifying purchase
```

| Stage | Referral preservation |
|-------|----------------------|
| `/readers-agree?ref=…` | Middleware sets `ap_ref` / `ref` cookies (`agnes-next/src/middleware.ts`) |
| Lead capture | Snapshot `ref` (+ `code`) into `ReaderProfile.leadAttribution` |
| Immediate redirect | `/sample-chapters?ref=…` (same params) |
| Nurture emails 0–4 | Every CTA → `/sample-chapters?ref=…` (+ UTMs) |
| Checkout | Existing precedence: query `ref`/`code` > `ap_ref` cookie > `localStorage.referral_code` (`agnes-next/src/lib/checkout.ts`) → Stripe metadata → webhook commission |

**Purchase remains the off-switch for prospect nurture** — not for referral attribution. A qualifying purchase should still award the **$2 direct commission** to the preserved direct sponsor (and any separate **$3 override** via existing lineage logic).

### Reporting (future)

```sql
-- Example: sends by channel
SELECT meta->>'channel' AS channel, COUNT(*)
FROM "Event"
WHERE type = 'PROSPECT_NURTURE_SENT'
GROUP BY 1;
```

Join to `PURCHASE_COMPLETED` / `Purchase` / `ReferralConversion` by `userId` for nurture → purchase by Meta vs TikTok vs referral.

---

## Referral compensation — NOT contest functionality

**Locked requirement:** Discontinuing the contest must **not** disable, remove, or alter the existing referral compensation system.

**Do not model or document podcaster/regional compensation as a flat $5 commission.** The business rules are two separate payout mechanisms:

### 1. Direct referral commission ($2)

The person who **directly sponsors/refers** the eventual buyer receives **$2.00** on a qualifying purchase.

This rule continues **independently** of the discontinued contest.

### 2. Podcaster / regional override ($3)

A qualifying designated **podcaster/regional rep** receives a **$3.00 override** on qualifying purchases occurring in that person's **lineage**.

This is **separate** from the $2 direct-referral commission.

**Incentive intent:** Reward podcasters/regional reps for developing productive **downstream referral lines** — not merely for directly referring buyers themselves.

### Payout scenarios (locked)

| Scenario | Direct sponsor | Qualified podcaster/regional in lineage | Total to podcaster/regional |
|----------|----------------|----------------------------------------|----------------------------|
| Podcaster/regional **is** the direct sponsor | **$2** direct commission | **$3** qualified override | **$5** total *(two payouts, not one $5 tier)* |
| Someone **else in the line** is the direct sponsor | That person receives **$2** | Qualified upstream podcaster/regional receives **$3** override | **$3** *(not $5)* |

**Never flatten** direct commission and override into a single “$5 podcaster commission.”

### V2 attribution requirement (locked)

Preserve the original **direct sponsor / referral attribution** through:

```
referral → /readers-agree → lead capture → /sample-chapters → nurture → qualifying purchase
```

At purchase time, allow the **existing lineage/override system** to determine independently:

1. Who receives the **$2** direct commission, and  
2. Whether a qualified upstream person receives the **$3** override.

V2 lead capture and nurture are **attribution carriers only** — they must not merge, replace, or simplify payout logic.

**Implementation rule:** **Audit and preserve** existing payout logic — do **not** recreate or hard-code commission amounts in nurture/lead code.

### Existing implementation to preserve (audit baseline)

| Component | Location | Role |
|-----------|----------|------|
| Referral cookies | `agnes-next/src/middleware.ts` | `ap_ref` / `ref` from `?ref=` |
| Client attribution | `agnes-next/src/lib/funnelTracking.ts` | `getAttributionFromPage()` — URL + cookies |
| Checkout metadata | `agnes-next/src/lib/checkout.ts` | `ref`/`code` → Stripe session metadata |
| Direct commission | `deepquill/api/stripe-webhook.cjs` → `processReferralCommission()` | `COMMISSION_CENTS = 200` ($2) → `ReferralConversion`, earnings, ledger |
| Override payout | Same webhook → override block | `OVERRIDE_POOL_CENTS = 300` ($3 pool) split across eligible regional/podcaster reps in upline |
| Commission API (legacy) | `deepquill/api/award-referral-commission.cjs` | Idempotent conversion insert |
| Validation | `deepquill/api/referral/validate.cjs` | Referrer lookup by `code` / `referralCode` |
| Rep designation | `User.overrideRepRole` (`regional` \| `podcaster`), `overrideEligible` | Qualification for override lineage |
| Records | `ReferralConversion.commissionCents`, `User.referralEarningsCents`, ledger `REFERRAL_COMMISSION_EARNED` / `OVERRIDE_PAYOUT_SPLIT` | Audit trail |

### Audit requirement (locked — stop if mismatch)

During later referral implementation/audit:

1. **Locate and document** the existing **$3 override/lineage** implementation before modifying any payout code.  
2. **Verify** behavior matches the locked scenarios above (direct $2 + separate override $3; combined $5 only when same person is both direct sponsor and qualified override recipient).  
3. If the $3 override mechanism **cannot be located**, or its behavior **differs** from these business rules → **stop and report the discrepancy**. Do **not** change payout logic to “fix” documentation.

**Study note (code audit 2026-08-17):** `stripe-webhook.cjs` shows direct `COMMISSION_CENTS = 200` and override `OVERRIDE_POOL_CENTS = 300` with upline regional/podcaster split — consistent with locked rules at high level. Full lineage behavior must be verified in implementation audit before any payout changes.

**Explicit non-goals for RA v2 / nurture work:**

- Do not tie referral payouts to contest points, contest entry, or contest sunset
- Do not replace webhook commission/override logic with nurture-job logic
- Do not strip `ref` from nurture CTAs to “clean up” URLs
- Do not document or implement a flat **$5 podcaster commission**

---

## Conflicts with existing email jobs

| Existing job | Conflict | Mitigation |
|--------------|----------|------------|
| `send-no-purchase-reminders` | Fires **24h after User.createdAt** for **any** non-purchaser — **will hit RA v2 leads** with contest copy | **Exclude** `ReaderProfile.source = 'readers-agree-v2'` OR `prospectNurtureEnrolledAt IS NOT NULL` |
| `send-engaged-reminders` | Contest-focused | Unlikely overlap unless lead joins contest |
| Phase 2 continuation nurture | Different cohort (`continuation_finish`) | Enroll only one sequence per user; precedence rules TBD |
| Mailchimp `subscribe.cjs` | Separate marketing list | Do not enroll RA v2 leads here if Mandrill sequence is primary |

**Critical:** Implement exclusion **before** RA v2 ads go live — otherwise the 24h contest reminder collides with Email 1 (48h).

---

## Distinction from Phase 2 Known Reader nurture

| | **RA v2 prospect nurture** | **Phase 2 Known Reader nurture** |
|---|---------------------------|----------------------------------|
| Trigger | Email on `/readers-agree` v2 | Finish Chapter 1 at breakpoint |
| Lifecycle stage | Anonymous → interested lead | Known Reader |
| PDF in email | **No** | Yes (chapter deliver) |
| CTA | `/sample-chapters` | Continue / catalog paths |
| Copy doc | This study ✓ **production copy locked** | `bn-funnel-phase2-nurture-emails-draft.md` ✓ approved |
| Suppression | Purchase | Purchase |

Same person could theoretically enter both — **precedence rule (study):** Phase 2 Known Reader nurture **supersedes** prospect nurture (suppress prospect sequence on `saveChapterDelivery`).

---

## Proposed implementation shape (study — not built)

### Enrollment (lead endpoint)

```
POST /api/readers-agree/lead
  → User + ReaderProfile (source, leadAttribution, consent)
  → prospectNurtureEnrolledAt = now, step = 0
  → Event READERS_AGREE_EMAIL_SUBMITTED
  → send Email 0 (production copy) via Mandrill — async OK
  → client redirect /sample-chapters?{attribution}
```

### Daily job

```
GET /api/admin/jobs/send-prospect-nurture  ( + Vercel cron proxy )
  FOR each eligible ReaderProfile:
    IF userHasPurchase → suppress, CONTINUE
    IF next step due → build email (locked production copy; optional activity-aware preamble only)
    → send Mandrill
    → prospectNurtureStep++, lastSentAt
    → Event PROSPECT_NURTURE_SENT { step, channel, ... }
```

### Additive event types

| Event | When |
|-------|------|
| `READERS_AGREE_EMAIL_SUBMITTED` | Lead captured |
| `PROSPECT_NURTURE_SENT` | Each email sent (meta: `step`, `channel`) |
| `PROSPECT_NURTURE_SUPPRESSED` | Purchase or manual suppress (meta: `reason`) |

---

## Can we avoid a separate marketing platform?

**Yes — for v1.**

| Need | Solution |
|------|----------|
| Send email | Mandrill transactional (already production) |
| Store leads | `User` + `ReaderProfile` (existing + new columns) |
| Schedule | Daily cron + day-offset logic |
| Suppress on purchase | `userHasPurchase` + `Purchase` table |
| Attribute by channel | JSON snapshot at enroll + `Event` meta |
| Unsubscribe | **Gap** — need link or Mandrill suppression list check; `guardMailableEmail` + rejects list partially exists |
| A/B testing | Not in v1 — manual copy changes only |
| Visual template editor | Not in v1 — builder functions in code |

Mailchimp Marketing **optional** as secondary sync for newsletter audience — not required for sequence execution.

---

## Remaining technical questions

| # | Question | Status |
|---|----------|--------|
| 1 | **Email 0 timing:** Synchronous before redirect, or async after redirect? | Open |
| 2 | **Unsubscribe / consent:** One checkbox on RA form sufficient for all 5 emails? | Open |
| 3 | **Referral leads (`ref`):** Same five-email sequence | **Locked:** same sequence; preserve `ref` on every CTA |
| 4 | **Double enrollment:** User submits RA form twice — reset clock or ignore? | Open |
| 5 | **Step 1 timing:** 48 hours from enroll | **Locked** |
| 6 | **Copy** | **Locked** — see § LOCK FINAL PROSPECT NURTURE COPY |
| 7 | **Mandrill template count:** Five builder functions vs one parameterized template? | Open (implementation) |
| 8 | **Webhook fast-path:** On purchase, proactively suppress nurture without waiting for cron? | Recommended enhancement |
| 9 | **$3 override / lineage:** Locate and document existing implementation; verify against locked payout scenarios | Audit during Phase D — **stop if mismatch** |

---

## Safest implementation order

1. Lead endpoint + attribution snapshot incl. `ref` (parent study Phase D)  
2. Schema migration — nurture fields on `ReaderProfile`  
3. Five Mandrill builders using **locked production copy** + attribution-aware CTA URLs  
4. Email 0 on enroll + exclude RA v2 cohort from `send-no-purchase-reminders`  
5. Daily job emails 1–4 (48h / Day 5 / 10 / 14) + cron route  
6. Audit referral path unchanged end-to-end ($2 direct + $3 override lineage — document, do not rewrite)  
7. Additive funnel events + admin report slice (optional v1.1)  
8. Stripe webhook → immediate nurture suppression (enhancement)  

---

## Related documents

| Document | Relationship |
|----------|--------------|
| [`bn-funnel-readers-agree-v2-study.md`](bn-funnel-readers-agree-v2-study.md) | Landing page + lead capture |
| [`bn-funnel-phase2-nurture-emails-draft.md`](bn-funnel-phase2-nurture-emails-draft.md) | Separate Known Reader sequence |
| [`bn-funnel-phase2-nurturing-audit.md`](bn-funnel-phase2-nurturing-audit.md) | Existing email landscape |
| [`docs/backlog.md`](backlog.md) | Cron/automation patterns |

---

*Study only. Production nurture copy locked. Referral compensation: $2 direct + $3 override (separate mechanisms). Mandrill + Prisma + daily job sufficient for v1.*
