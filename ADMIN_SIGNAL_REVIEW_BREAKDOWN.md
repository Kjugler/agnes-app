# Admin Moderation, Admin Jobs, Signal & Reviews — Dependency Breakdown

**Date:** 2025-03-21  
**Goal:** Clarify what Admin Moderation, Admin Jobs, Signal, and Reviews do—and whether they can move into deepquill before deployment.

---

## 1. Admin Moderation

### 1.1 Routes/Endpoints

| Route | Method | Action | Tied To |
|-------|--------|--------|---------|
| `/api/admin/moderation/approve-signal` | POST | Approve single Signal (HELD → APPROVED) | Signal |
| `/api/admin/moderation/approve-review` | POST | Approve single Review (HELD → APPROVED) | Review |
| `/api/admin/moderation/approve-all` | POST | Approve all HELD Signals and Reviews in batch | Signal + Review |

### 1.2 Supported Actions

| Action | Implementation |
|--------|----------------|
| **Approve** | Sets `status: APPROVED`, `approvedAt: now`, clears `heldAt`, `heldReason` |
| **Delete** | Not in moderation routes. Delete is in `/api/admin/signals/[id]` (DELETE) for Signal only |
| **Flag/Hold** | Done at create time (profanity/link detection). No separate flag endpoint |
| **Reject** | Schema has `REJECTED` but no explicit reject route |

### 1.3 Tables/Models Used

| Route | Read | Write |
|-------|------|-------|
| approve-signal | Signal | Signal |
| approve-review | Review | Review |
| approve-all | Signal, Review | Signal, Review |

All use **agnes-next prisma** (local DB).

### 1.4 Post-Approval: Points Award

After approval, each route calls **deepquill** `/api/points/award` with:
- `type: 'signal_approved'` or `type: 'review_approved'`
- `userId`, `signalId` or `reviewId`

Deepquill `awardPoints.cjs` uses **PointAward** for idempotency. **Note:** `PointAward` is not in the current deepquill Prisma schema—either it comes from an unreviewed migration or this path may fail at runtime.

### 1.5 Auth

- Dev: no header required
- Prod: requires `x-admin-key` header matching `ADMIN_KEY` env

---

## 2. Admin Jobs

### 2.1 List of Jobs

| Job | Route | Purpose |
|-----|-------|---------|
| **Engaged reminders** | `GET /api/admin/jobs/send-engaged-reminders` | Email users who engaged (contest/post/event) but have no purchase and are not in ReferralConversion |
| **Non-participant reminders** | `GET /api/admin/jobs/send-non-participant-reminders` | Email contest joiners with 0 points, no purchase, no posts |
| **No-purchase reminders** | `GET /api/admin/jobs/send-no-purchase-reminders` | Email users with no purchase, entered contest 24h+ ago |
| **Missionary emails** | `GET /api/admin/jobs/send-missionary-emails` | Email readers who purchased 15+ days ago (from Purchase or ReferralConversion) |
| **Seed signal room** | `GET /api/admin/jobs/seed-signal-room` | Create/update system signals (dev/seed) |
| **Publish scheduled signals** | `GET /api/cron/publish-scheduled-signals` | Cron: publish Draft signals when `publishAt` has passed |

### 2.2 What Each Job Does

| Job | Logic | Email Tool |
|-----|-------|------------|
| **send-engaged-reminders** | Users with `contestJoinedAt` or posts or events, no Purchase, not in ReferralConversion, `engagedEmailSentAt` null, created 2d+ ago | Mailchimp Transactional |
| **send-non-participant-reminders** | Contest joiners, points=0, no Purchase, no posts, not in ReferralConversion, `nonParticipantEmailSentAt` null, created 2d+ ago | Mailchimp Transactional |
| **send-no-purchase-reminders** | No Purchase, `noPurchaseEmailSentAt` null, created 24h+ ago | Mailchimp Transactional |
| **send-missionary-emails** | Has Purchase 15d+ ago OR in ReferralConversion 15d+ ago, `missionaryEmailSentAt` null | Mailchimp Transactional |
| **seed-signal-room** | Upsert 5 system Signals by text | — |
| **publish-scheduled-signals** | Find `publishStatus=DRAFT` and `publishAt <= now`, set PUBLISHED, create SignalEvent | — |

### 2.3 Tables/Models Read or Written

| Job | Read | Write |
|-----|------|-------|
| send-engaged-reminders | User, Purchase, ReferralConversion, Event, Post | User (`engagedEmailSentAt`) |
| send-non-participant-reminders | User, Purchase, ReferralConversion, Post | User (`nonParticipantEmailSentAt`) |
| send-no-purchase-reminders | User, Purchase | User (`noPurchaseEmailSentAt`) |
| send-missionary-emails | User, Purchase, ReferralConversion | User (`missionaryEmailSentAt`) |
| seed-signal-room | Signal | Signal |
| publish-scheduled-signals | Signal | Signal, SignalEvent |

All use **agnes-next prisma**.

### 2.4 Scheduling

| Job | Trigger |
|-----|---------|
| send-engaged-reminders | Manual (`GET`) |
| send-non-participant-reminders | Manual (`GET`) |
| send-no-purchase-reminders | Manual (`GET`) |
| send-missionary-emails | Manual (`GET`) |
| seed-signal-room | Manual (`GET`) |
| publish-scheduled-signals | **Cron** (Vercel Cron or external). Requires `Authorization: Bearer ${CRON_SECRET}` |

No `vercel.json` found; cron is assumed configured elsewhere or run manually.

### 2.5 File Locations

```
agnes-next/src/app/api/admin/jobs/
  send-engaged-reminders/route.ts
  send-non-participant-reminders/route.ts
  send-no-purchase-reminders/route.ts
  send-missionary-emails/route.ts
  seed-signal-room/route.ts
agnes-next/src/app/api/cron/
  publish-scheduled-signals/route.ts
```

---

## 3. Signal System

### 3.1 Routes and Models

| Route | Method | Models | Purpose |
|-------|--------|--------|---------|
| `/api/signals` | GET | Signal, SignalReply, User | List published signals (cursor pagination, type filter) |
| `/api/signal/create` | POST | Signal, User, Purchase, ReferralConversion | Create signal (auth via deepquill, moderation on create) |
| `/api/signal/reply` | POST | Signal, SignalReply, User, Purchase, ReferralConversion | Create reply |
| `/api/signal/comment` | POST | Signal, SignalComment, User | Create comment |
| `/api/signal/comment-upvote` | POST | SignalComment, SignalCommentUpvote | Toggle upvote |
| `/api/signal/ack` | POST | SignalAcknowledge, User | Acknowledge (read receipt) |
| `/api/signal/events` | GET | SignalEvent | List events for ribbon ticker |
| `/api/admin/signals` | GET, POST | Signal | Admin: list signals, create system signal |
| `/api/admin/signals/[id]` | GET, PATCH, DELETE | Signal | Admin: get, update, delete |
| `/api/admin/signals/[id]/publish` | POST | Signal, SignalEvent | Admin: publish draft, create event |
| `/api/cron/publish-scheduled-signals` | GET | Signal, SignalEvent | Cron: publish scheduled drafts |

### 3.2 Models Involved

| Model | deepquill Schema | agnes-next Schema | Notes |
|-------|------------------|-------------------|-------|
| **Signal** | ✅ Basic (text, status) | ✅ Extended (title, type, content, media, location, publishStatus, publishAt, etc.) | agnes-next is richer |
| **SignalReply** | ✅ | ✅ | Same structure |
| **SignalAcknowledge** | ✅ | ✅ | Same structure |
| **SignalComment** | ❌ | ✅ | agnes-next only |
| **SignalCommentUpvote** | ❌ | ✅ | agnes-next only |
| **SignalEvent** | ❌ | ✅ | agnes-next only (ribbon ticker) |

### 3.3 Canonical vs Duplicated

| Item | deepquill | agnes-next |
|------|-----------|------------|
| Signal CRUD | ❌ No routes | ✅ All CRUD in agnes-next |
| SignalReply CRUD | ❌ | ✅ |
| SignalAcknowledge CRUD | ❌ | ✅ |
| SignalComment | ❌ | ✅ |
| SignalEvent | ❌ | ✅ |

**Conclusion:** Signal is **agnes-next-only** in practice. Deepquill has Signal/Review in schema but no CRUD routes. Deepquill only receives approval events for point awards.

### 3.4 Identity / Auth

- `resolveIdentityByEmail` → deepquill `/api/associate/status`
- Purchase/ReferralConversion/User for moderation → **agnes-next prisma** (local copy)

---

## 4. Reviews System

### 4.1 Routes and Models

| Route | Method | Models | Purpose |
|-------|--------|--------|---------|
| `/api/reviews/create` | POST | Review, User, Purchase, ReferralConversion | Create/upsert review (one per user) |
| `/api/reviews/list` | GET | Review | List reviews (take param) |
| `/api/reviews/summary` | GET | Review | Aggregate (e.g. rating summary) |
| `/api/admin/moderation/approve-review` | POST | Review | Approve held review |

### 4.2 Relationship to Signal

Reviews are **separate** from Signal. They share:
- Same moderation flow (HELD → APPROVED)
- Same points-award pattern (agnés-next calls deepquill after approval)
- Same identity flow (`resolveIdentityByEmail`)

### 4.3 Current DB Location

**Reviews:** Stored in **agnes-next DB** only. Deepquill has a Review model in schema but no routes read or write it.

---

## 5. Migration Feasibility

### 5.1 Can Signal + Reviews + Admin Jobs Move to Deepquill?

| Component | Feasible? | Effort |
|-----------|-----------|--------|
| **Signal CRUD** | Yes | Medium–high. Deepquill schema is minimal; agnes-next Signal is richer. Need migrations + routes. |
| **SignalReply, SignalAcknowledge** | Yes | Medium. Add routes, schema already matches. |
| **SignalComment, SignalCommentUpvote, SignalEvent** | Yes | Medium. Add models + routes in deepquill. |
| **Reviews CRUD** | Yes | Low. Review schema exists; add routes. |
| **Admin Moderation** | Yes | Low. Move approve logic; keep deepquill points/award as-is. |
| **Admin Jobs** | Yes | Medium. Jobs need User, Purchase, ReferralConversion—canonical in deepquill. Today they use agnes-next DB (stale copy). |

### 5.2 Dependencies That Would Break

| If moved | Breaks |
|----------|--------|
| Signal CRUD to deepquill | All `/api/signal/*`, `/api/signals`, `/api/admin/signals` must proxy or be rewritten |
| Reviews to deepquill | `/api/reviews/*` must proxy |
| Admin jobs to deepquill | Jobs must call deepquill APIs for User/Purchase/ReferralConversion, or deepquill must expose job endpoints |

### 5.3 What Would Need Proxying

1. **agnés-next → deepquill proxy routes** for:
   - Signal: create, reply, comment, comment-upvote, ack, events, list
   - Admin signals: CRUD, publish
   - Reviews: create, list, summary
   - Moderation: approve-signal, approve-review, approve-all (or move approve logic to deepquill)

2. **Deepquill endpoints to add:**
   - Full Signal CRUD (with extended schema)
   - SignalComment, SignalCommentUpvote, SignalEvent CRUD
   - Review CRUD
   - Moderation approve (or keep in agnes-next and only call deepquill for points)
   - Admin job handlers (or shared query APIs for User/Purchase/ReferralConversion)

3. **`signalEvent.ts`** (`createSignalEvent`): Used by admin and cron. Must run where Signal lives (deepquill if moved).

### 5.4 Schema Gaps (Deepquill)

| Gap | Action |
|-----|--------|
| Signal: no title, type, content, media, location, publishStatus, publishAt | Add fields (or new models) |
| No SignalComment, SignalCommentUpvote, SignalEvent | Add models |
| PointAward missing | Add model or refactor awardPoints to use Ledger |

---

## 6. Summary Tables

### 6.1 Routes by Owner

| Route | Owner | Classification |
|-------|-------|----------------|
| Admin moderation (approve-signal, approve-review, approve-all) | agnes-next | agnes-next-only |
| Admin signals CRUD | agnes-next | agnes-next-only |
| Signal create, reply, comment, ack | agnes-next | agnes-next-only |
| Signal events | agnes-next | agnes-next-only |
| Reviews create, list, summary | agnes-next | agnes-next-only |
| Admin jobs (4 email jobs, seed-signal-room) | agnes-next | agnes-next-only |
| Cron publish-scheduled-signals | agnes-next | agnes-next-only |
| deepquill /api/points/award (type=signal_approved, review_approved) | deepquill | Canonical (points only) |

### 6.2 Models by Owner

| Model | deepquill | agnes-next | Canonical |
|-------|-----------|------------|-----------|
| Signal | Schema only | Full CRUD | agnes-next |
| SignalReply | Schema only | Full CRUD | agnes-next |
| SignalAcknowledge | Schema only | Full CRUD | agnes-next |
| SignalComment | — | Full CRUD | agnes-next |
| SignalCommentUpvote | — | Full CRUD | agnes-next |
| SignalEvent | — | Full CRUD | agnes-next |
| Review | Schema only | Full CRUD | agnes-next |
| User (for jobs) | Canonical | Stale copy read by jobs | deepquill |
| Purchase (for jobs) | Canonical | Stale copy read by jobs | deepquill |
| ReferralConversion (for jobs) | Canonical | Stale copy read by jobs | deepquill |

### 6.3 Migration Candidate Classification

| Component | Classification | Migration candidate |
|-----------|-----------------|---------------------|
| Signal + Reply + Acknowledge | agnes-next-only | ✅ Yes |
| SignalComment + Upvote + Event | agnes-next-only | ✅ Yes |
| Review | agnes-next-only | ✅ Yes |
| Admin moderation | agnes-next-only | ✅ Yes (or proxy) |
| Admin jobs | agnes-next-only, but read canonical User/Purchase/ReferralConversion | ✅ Yes—move to deepquill or proxy to deepquill APIs |
| deepquill points/award (signal_approved, review_approved) | Canonical | Keep in deepquill |
