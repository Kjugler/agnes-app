# Signal, Reviews, Admin Migration — Implementation Plan

**Date:** 2025-03-21  
**Goal:** Move Signal, Reviews, Admin Moderation, and Admin Jobs into deepquill; eliminate agnes-next database dependency.

---

## Executive Summary

| Phase | Scope | Risk |
|-------|-------|------|
| 0 | PointAward → Ledger refactor | Low |
| 1 | deepquill schema extension | Low |
| 2 | deepquill Signal/Review routes | Medium |
| 3 | deepquill moderation routes | Low |
| 4 | deepquill admin jobs | Medium |
| 5 | agnes-next proxy replacement | Medium |
| 6 | Data migration | High |

**Order of execution:** 0 → 1 → 2 → 3 → 4 → 5 → 6 (each phase builds on the previous).

---

## Phase 0: PointAward → Ledger Refactor

### 0.1 Problem

`awardPoints.cjs` uses `prisma.pointAward.create()` for signal/review approval idempotency. **PointAward does not exist** in the deepquill Prisma schema—this code path will fail at runtime.

### 0.2 Solution

Replace with Ledger-based idempotency, consistent with the rest of the app.

### 0.3 Schema Changes

**File:** `deepquill/prisma/schema.prisma`

Add to `enum LedgerType`:
```prisma
  SIGNAL_APPROVED   // +100 pts when Signal approved
  REVIEW_APPROVED    // +150 pts when Review approved
```

### 0.4 Code Changes

**File:** `deepquill/lib/points/awardPoints.cjs`

- Replace `awardForSignalApproved` body: call `recordLedgerEntry(prisma, { sessionId: 'signal_approved_' + signalId, userId, type: LedgerType.SIGNAL_APPROVED, points: 100, note: 'Signal approved', meta: { signalId } })`
- Replace `awardForReviewApproved` body: same pattern with `sessionId: 'review_approved_' + reviewId`, `type: LedgerType.REVIEW_APPROVED`, `points: 150`
- Add `user.points` increment (or rely on points rollup—verify how other awards handle this)
- Remove all `prisma.pointAward` usage

**File:** `deepquill/lib/pointsRollup.cjs` (if exists)

- Ensure SIGNAL_APPROVED and REVIEW_APPROVED are included in points aggregation

### 0.5 Migration

```bash
cd deepquill && npx prisma migrate dev --name add_signal_review_ledger_types
```

---

## Phase 1: Deepquill Schema Extension

### 1.1 Signal Model Extension

**File:** `deepquill/prisma/schema.prisma`

Replace existing Signal model with agnes-next equivalent:

```prisma
enum SignalType {
  ARCHIVE
  LOCATION
  VISUAL
  NARRATIVE
  PLAYER_QUESTION
  PODCASTER_PROMPT
  SPECULATIVE
}

enum SignalPublishStatus {
  DRAFT
  PUBLISHED
}

model Signal {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  userId      String?
  user        User?   @relation(fields: [userId], references: [id], onDelete: SetNull)
  author      String?
  isSystem    Boolean @default(false)
  isAnonymous Boolean @default(false)

  text    String
  title   String?
  type    SignalType? @default(NARRATIVE)
  content String?

  mediaType String?
  mediaUrl  String?

  locationTag  String?
  locationName String?
  locationLat  Float?
  locationLng  Float?
  tags         Json?

  discussionEnabled Boolean @default(true)
  publishAt         DateTime?
  publishStatus     SignalPublishStatus? @default(PUBLISHED)

  status     SignalStatus      @default(APPROVED)
  heldReason SignalHeldReason?
  heldAt     DateTime?
  approvedAt DateTime?
  rejectedAt DateTime?

  countryCode String?
  region       String?

  replies      SignalReply[]
  acknowledges SignalAcknowledge[]
  comments     SignalComment[]
  events       SignalEvent[]

  @@index([createdAt])
  @@index([status, createdAt])
  @@index([publishStatus, createdAt])
  @@index([type, createdAt])
}
```

### 1.2 New Models

```prisma
model SignalComment {
  id          String   @id @default(cuid())
  createdAt   DateTime @default(now())
  signalId    String
  signal      Signal   @relation(fields: [signalId], references: [id], onDelete: Cascade)
  userId      String?
  user        User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  commentText String
  upvotes     Int      @default(0)
  isFlagged   Boolean  @default(false)
  flagReason  String?
  upvoteRecords SignalCommentUpvote[]

  @@index([signalId, createdAt])
}

model SignalCommentUpvote {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  commentId String
  comment   SignalComment @relation(fields: [commentId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([commentId, userId])
  @@index([commentId])
}

model SignalEvent {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  signalId  String
  signal    Signal   @relation(fields: [signalId], references: [id], onDelete: Cascade)
  eventText String

  @@index([signalId, createdAt])
}
```

### 1.3 User Model Relation Updates

Add to User model in deepquill:
```prisma
  signalComments     SignalComment[]
  signalCommentUpvotes SignalCommentUpvote[]
```

### 1.4 Migration

```bash
cd deepquill && npx prisma migrate dev --name extend_signal_add_comment_event
```

**Risk:** Signal table alter may require data migration if agnes-next has existing Signal rows with different structure. Run migration on empty or compatible data first.

---

## Phase 2: Deepquill Signal & Review Routes

### 2.1 New Route Files

Create under `deepquill/server/routes/` or `deepquill/api/`:

| Route File | Methods | Purpose |
|------------|---------|---------|
| `signals.cjs` | GET /api/signals | List published signals (cursor, type filter) |
| `signal/create.cjs` | POST /api/signal/create | Create signal (auth via email, moderation on create) |
| `signal/reply.cjs` | POST /api/signal/reply | Create reply |
| `signal/comment.cjs` | POST /api/signal/comment | Create comment |
| `signal/comment-upvote.cjs` | POST /api/signal/comment-upvote | Toggle upvote |
| `signal/ack.cjs` | POST /api/signal/ack | Acknowledge |
| `signal/events.cjs` | GET /api/signal/events | List events (ribbon) |
| `reviews/create.cjs` | POST /api/reviews/create | Create/upsert review |
| `reviews/list.cjs` | GET /api/reviews/list | List reviews |
| `reviews/summary.cjs` | GET /api/reviews/summary | Aggregate summary |
| `admin/signals.cjs` | GET, POST /api/admin/signals | Admin list, create |
| `admin/signals-id.cjs` | GET, PATCH, DELETE /api/admin/signals/:id | Admin CRUD |
| `admin/signals-publish.cjs` | POST /api/admin/signals/:id/publish | Publish draft |
| `cron/publish-scheduled.cjs` | GET /api/cron/publish-scheduled-signals | Publish drafts |

### 2.2 Auth / Identity

All routes that require user identity:
- Read `x-user-email` header or cookies (`contest_email`, `user_email`, `associate_email`)
- Resolve via `prisma.user.findFirst({ where: { email } })` (canonical in deepquill)
- No cross-app identity; deepquill owns User

### 2.3 Moderation Logic (Create-Time)

Preserve agnes-next logic in create routes:
- Profanity/link detection → HELD
- Purchase or ReferralConversion check for "contest official" (points >= 250) → possible auto-approve
- Default HELD for user content, APPROVED for system

### 2.4 SignalEvent Creation

Create `deepquill/lib/signalEvent.cjs` (port from agnes-next `signalEvent.ts`):
- `createSignalEvent(signalId, customText?)` — builds event text from signal, creates SignalEvent

---

## Phase 3: Deepquill Admin Moderation Routes

### 3.1 Route Files

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/admin/moderation/approve-signal` | POST | Approve one HELD Signal |
| `/api/admin/moderation/approve-review` | POST | Approve one HELD Review |
| `/api/admin/moderation/approve-all` | POST | Approve all HELD Signals and Reviews |

### 3.2 Logic

- Auth: `x-admin-key` matching `ADMIN_KEY` (prod) or allow in dev
- Update Signal/Review status to APPROVED
- Call `awardForSignalApproved` / `awardForReviewApproved` (now Ledger-based)

### 3.3 Mount in deepquill server

```javascript
app.post('/api/admin/moderation/approve-signal', ...);
app.post('/api/admin/moderation/approve-review', ...);
app.post('/api/admin/moderation/approve-all', ...);
```

---

## Phase 4: Deepquill Admin Jobs

### 4.1 Job Routes

| Route | Purpose |
|-------|---------|
| GET /api/admin/jobs/send-engaged-reminders | Engaged users, no purchase |
| GET /api/admin/jobs/send-non-participant-reminders | Contest joiners, 0 pts |
| GET /api/admin/jobs/send-no-purchase-reminders | No purchase, 24h+ |
| GET /api/admin/jobs/send-missionary-emails | Purchased 15d+ ago |
| GET /api/admin/jobs/seed-signal-room | Seed system signals |
| GET /api/cron/publish-scheduled-signals | Publish drafts (cron) |

### 4.2 Dependencies

- Mailchimp Transactional (move env from agnes-next or share)
- `getSiteUrl()` equivalent
- Email templates: `buildEngagedReminderEmail`, `buildNonParticipantReminderEmail`, etc.—port or share

### 4.3 Data Source

All jobs use **deepquill prisma** (canonical User, Purchase, ReferralConversion). No agnes-next DB.

### 4.4 Auth

- Email jobs: `x-admin-key` or cron secret
- Cron: `Authorization: Bearer ${CRON_SECRET}`

---

## Phase 5: Agnes-Next Proxy Replacement

### 5.1 Routes to Replace

Replace each route with a proxy to deepquill. Use `proxyJson` (or new `proxyToDeepquill`) and forward:
- Method
- Headers (cookies, x-user-email, x-admin-key)
- Body (for POST/PATCH)
- Query params

| agnes-next Route | Proxy To | Notes |
|------------------|----------|-------|
| GET /api/signals | GET /api/signals | Forward query |
| POST /api/signal/create | POST /api/signal/create | Forward body + headers |
| POST /api/signal/reply | POST /api/signal/reply | |
| POST /api/signal/comment | POST /api/signal/comment | |
| POST /api/signal/comment-upvote | POST /api/signal/comment-upvote | |
| POST /api/signal/ack | POST /api/signal/ack | |
| GET /api/signal/events | GET /api/signal/events | |
| POST /api/reviews/create | POST /api/reviews/create | |
| GET /api/reviews/list | GET /api/reviews/list | |
| GET /api/reviews/summary | GET /api/reviews/summary | |
| POST /api/admin/moderation/approve-signal | POST /api/admin/moderation/approve-signal | |
| POST /api/admin/moderation/approve-review | POST /api/admin/moderation/approve-review | |
| POST /api/admin/moderation/approve-all | POST /api/admin/moderation/approve-all | |
| GET/POST /api/admin/signals | GET/POST /api/admin/signals | |
| GET/PATCH/DELETE /api/admin/signals/[id] | GET/PATCH/DELETE /api/admin/signals/[id] | |
| POST /api/admin/signals/[id]/publish | POST /api/admin/signals/[id]/publish | |
| GET /api/admin/jobs/send-* | GET /api/admin/jobs/send-* | All 4 email jobs |
| GET /api/admin/jobs/seed-signal-room | GET /api/admin/jobs/seed-signal-room | |
| GET /api/cron/publish-scheduled-signals | GET /api/cron/publish-scheduled-signals | Forward cron secret |

### 5.2 Prisma Removal

After proxies are in place:
- Remove `import { prisma } from '@/lib/db'` from all replaced route files
- Optionally remove Signal, Review, SignalComment, SignalCommentUpvote, SignalEvent from agnes-next schema (or keep for data migration read-only)
- Keep `prisma` only for routes that still need it (e.g. `/api/points` if not yet proxied)

### 5.3 DEEPQUILL_URL / NEXT_PUBLIC_API_BASE_URL

Ensure agnes-next uses `DEEPQUILL_URL` or `NEXT_PUBLIC_API_BASE_URL` for proxy base. Deepquill must be reachable from agnes-next (same network or public URL).

---

## Phase 6: Data Migration (agnes-next DB → deepquill DB)

### 6.1 When to Run

After Phase 5 is complete and agnes-next is proxying. Run migration when:
- agnes-next DB has data to preserve
- deepquill DB is target

### 6.2 Migration Script

Create `scripts/migrate-signal-review-to-deepquill.cjs` (or `.ts`):

1. Connect to both DBs (agnés-next SQLite + deepquill SQLite, or use Prisma with two clients)
2. **Signals:** Select all from agnes-next Signal, insert into deepquill Signal (map fields)
3. **SignalReplies:** Same
4. **SignalAcknowledges:** Same
5. **SignalComments:** Same
6. **SignalCommentUpvotes:** Same
7. **SignalEvents:** Same
8. **Reviews:** Same

### 6.3 Field Mapping

- Ensure deepquill schema has all agnes-next columns
- Handle `publishStatus` (DRAFT/PUBLISHED), `type` (SignalType enum), `tags` (Json)
- Preserve IDs or remap FKs (recommend preserving IDs for simpler migration)

### 6.4 User FK

Signal.userId, Review.userId, etc. reference User. If User is in deepquill, ensure user IDs match. If both apps shared User from same source, IDs may already align. If not, you may need a user migration first.

### 6.5 Order of Tables

1. User (if migrating)
2. Signal
3. SignalReply, SignalAcknowledge
4. SignalComment
5. SignalCommentUpvote
6. SignalEvent
7. Review

### 6.6 Rollback

- Keep agnes-next DB snapshot before migration
- Migration script should be idempotent (skip existing by id) or run once

---

## Schema Changes Summary

### Deepquill Prisma

| Change | Type |
|--------|------|
| LedgerType: +SIGNAL_APPROVED, +REVIEW_APPROVED | Enum |
| Signal: +title, type, content, mediaType, mediaUrl, location*, tags, discussionEnabled, publishAt, publishStatus, author | Model |
| SignalType enum | New |
| SignalPublishStatus enum | New |
| SignalComment | New model |
| SignalCommentUpvote | New model |
| SignalEvent | New model |
| User: +signalComments, +signalCommentUpvotes | Relation |

---

## Routes to Add (Deepquill)

| Path | Method |
|------|--------|
| /api/signals | GET |
| /api/signal/create | POST |
| /api/signal/reply | POST |
| /api/signal/comment | POST |
| /api/signal/comment-upvote | POST |
| /api/signal/ack | POST |
| /api/signal/events | GET |
| /api/reviews/create | POST |
| /api/reviews/list | GET |
| /api/reviews/summary | GET |
| /api/admin/moderation/approve-signal | POST |
| /api/admin/moderation/approve-review | POST |
| /api/admin/moderation/approve-all | POST |
| /api/admin/signals | GET, POST |
| /api/admin/signals/:id | GET, PATCH, DELETE |
| /api/admin/signals/:id/publish | POST |
| /api/admin/jobs/send-engaged-reminders | GET |
| /api/admin/jobs/send-non-participant-reminders | GET |
| /api/admin/jobs/send-no-purchase-reminders | GET |
| /api/admin/jobs/send-missionary-emails | GET |
| /api/admin/jobs/seed-signal-room | GET |
| /api/cron/publish-scheduled-signals | GET |

---

## Routes to Replace (agnes-next)

Replace implementation with proxy; keep path and method unchanged.

| Path | Action |
|------|--------|
| /api/signals | Proxy to deepquill |
| /api/signal/create | Proxy |
| /api/signal/reply | Proxy |
| /api/signal/comment | Proxy |
| /api/signal/comment-upvote | Proxy |
| /api/signal/ack | Proxy |
| /api/signal/events | Proxy |
| /api/reviews/create | Proxy |
| /api/reviews/list | Proxy |
| /api/reviews/summary | Proxy |
| /api/admin/moderation/* | Proxy |
| /api/admin/signals | Proxy |
| /api/admin/signals/[id] | Proxy |
| /api/admin/signals/[id]/publish | Proxy |
| /api/admin/jobs/* | Proxy |
| /api/cron/publish-scheduled-signals | Proxy |

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| PointAward missing causes runtime error | Phase 0 refactor before any new routes |
| Schema drift between apps | Align deepquill schema with agnes-next before migration |
| agnes-next reads stale data during cutover | Run migration during low traffic; verify proxies before disabling old routes |
| User ID mismatch (agnes vs deepquill) | Ensure both apps use same User source; migrate users first if needed |
| Email env vars in wrong app | Centralize MAILCHIMP_* in deepquill or pass through |
| Cron secret for publish-scheduled | Set CRON_SECRET in both apps or have agnes cron call deepquill with secret |

---

## Verification Checklist

- [ ] Phase 0: Signal/review approval awards points via Ledger
- [ ] Phase 1: deepquill schema has full Signal + Comment + Event
- [ ] Phase 2: All Signal/Review CRUD works via deepquill
- [ ] Phase 3: Moderation endpoints approve and award points
- [ ] Phase 4: Admin jobs run against deepquill DB
- [ ] Phase 5: agnes-next routes proxy correctly; UI unchanged
- [ ] Phase 6: Data migrated; no data loss
- [ ] agnes-next has no remaining prisma usage for Signal/Review/Jobs

---

## Estimated Effort

| Phase | Effort |
|-------|--------|
| 0 | 1–2 hrs |
| 1 | 2–3 hrs |
| 2 | 1–2 days |
| 3 | 2–4 hrs |
| 4 | 4–8 hrs |
| 5 | 4–6 hrs |
| 6 | 2–4 hrs |

**Total:** ~3–5 days for a single developer.
