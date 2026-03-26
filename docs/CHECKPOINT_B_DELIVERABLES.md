# Checkpoint B Deliverables

**Migration plan**: Phases 4, 5, 6  
**Completed**: Phase 4 (Deepquill admin jobs), Phase 5 (agnes-next proxy replacement), Phase 6 (data migration script)  
**Status**: Ready for validation

---

## Files Changed

### Phase 4 (Deepquill admin jobs)

| File | Change |
|------|--------|
| `deepquill/lib/email/builders/engagedReminder.cjs` | **New** – email template |
| `deepquill/lib/email/builders/noPurchaseReminder.cjs` | **New** – email template |
| `deepquill/lib/email/builders/nonParticipantReminder.cjs` | **New** – email template |
| `deepquill/lib/email/builders/missionaryEmail.cjs` | **New** – email template |
| `deepquill/server/routes/adminJobs.cjs` | **New** – 5 admin job routes |
| `deepquill/server/index.cjs` | Mounted `/api/admin/jobs` router |

### Phase 5 (agnes-next proxy replacement)

| File | Change |
|------|--------|
| `agnes-next/src/lib/deepquillProxy.ts` | Added `x-admin-key`, `x-vercel-ip-country`, `x-vercel-ip-country-region`; `DEEPQUILL_URL` as base-URL fallback |
| `agnes-next/src/app/api/signals/route.ts` | **Replaced** – proxy to deepquill |
| `agnes-next/src/app/api/signal/create/route.ts` | **Replaced** – proxy |
| `agnes-next/src/app/api/signal/reply/route.ts` | **Replaced** – proxy |
| `agnes-next/src/app/api/signal/comment/route.ts` | **Replaced** – proxy |
| `agnes-next/src/app/api/signal/comment-upvote/route.ts` | **Replaced** – proxy |
| `agnes-next/src/app/api/signal/ack/route.ts` | **Replaced** – proxy |
| `agnes-next/src/app/api/signal/events/route.ts` | **Replaced** – proxy |
| `agnes-next/src/app/api/reviews/create/route.ts` | **Replaced** – proxy |
| `agnes-next/src/app/api/reviews/list/route.ts` | **Replaced** – proxy |
| `agnes-next/src/app/api/reviews/summary/route.ts` | **Replaced** – proxy |
| `agnes-next/src/app/api/admin/moderation/approve-signal/route.ts` | **Replaced** – proxy |
| `agnes-next/src/app/api/admin/moderation/approve-review/route.ts` | **Replaced** – proxy |
| `agnes-next/src/app/api/admin/moderation/approve-all/route.ts` | **Replaced** – proxy |
| `agnes-next/src/app/api/admin/signals/route.ts` | **Replaced** – proxy |
| `agnes-next/src/app/api/admin/signals/[id]/route.ts` | **Replaced** – proxy |
| `agnes-next/src/app/api/admin/signals/[id]/publish/route.ts` | **Replaced** – proxy |
| `agnes-next/src/app/api/admin/jobs/send-engaged-reminders/route.ts` | **Replaced** – proxy |
| `agnes-next/src/app/api/admin/jobs/send-non-participant-reminders/route.ts` | **Replaced** – proxy |
| `agnes-next/src/app/api/admin/jobs/send-no-purchase-reminders/route.ts` | **Replaced** – proxy |
| `agnes-next/src/app/api/admin/jobs/send-missionary-emails/route.ts` | **Replaced** – proxy |
| `agnes-next/src/app/api/admin/jobs/seed-signal-room/route.ts` | **Replaced** – proxy |
| `agnes-next/src/app/api/cron/publish-scheduled-signals/route.ts` | **Replaced** – proxy |

### Phase 6 (Data migration)

| File | Change |
|------|--------|
| `agnes-next/scripts/migrate-signal-review-to-deepquill.cjs` | **New** – migration script |

---

## Routes Replaced

All of these agnes-next routes now proxy to deepquill; paths and methods are unchanged.

| Path | Method | Proxies To |
|------|--------|------------|
| `/api/signals` | GET | `/api/signals` |
| `/api/signal/create` | POST | `/api/signal/create` |
| `/api/signal/reply` | POST | `/api/signal/reply` |
| `/api/signal/comment` | POST | `/api/signal/comment` |
| `/api/signal/comment-upvote` | POST | `/api/signal/comment-upvote` |
| `/api/signal/ack` | POST | `/api/signal/ack` |
| `/api/signal/events` | GET | `/api/signal/events` |
| `/api/reviews/create` | POST | `/api/reviews/create` |
| `/api/reviews/list` | GET | `/api/reviews/list` |
| `/api/reviews/summary` | GET | `/api/reviews/summary` |
| `/api/admin/moderation/approve-signal` | POST | `/api/admin/moderation/approve-signal` |
| `/api/admin/moderation/approve-review` | POST | `/api/admin/moderation/approve-review` |
| `/api/admin/moderation/approve-all` | POST | `/api/admin/moderation/approve-all` |
| `/api/admin/signals` | GET, POST | `/api/admin/signals` |
| `/api/admin/signals/[id]` | GET, PATCH, DELETE | `/api/admin/signals/:id` |
| `/api/admin/signals/[id]/publish` | POST | `/api/admin/signals/:id/publish` |
| `/api/admin/jobs/send-engaged-reminders` | GET | `/api/admin/jobs/send-engaged-reminders` |
| `/api/admin/jobs/send-non-participant-reminders` | GET | `/api/admin/jobs/send-non-participant-reminders` |
| `/api/admin/jobs/send-no-purchase-reminders` | GET | `/api/admin/jobs/send-no-purchase-reminders` |
| `/api/admin/jobs/send-missionary-emails` | GET | `/api/admin/jobs/send-missionary-emails` |
| `/api/admin/jobs/seed-signal-room` | GET | `/api/admin/jobs/seed-signal-room` |
| `/api/cron/publish-scheduled-signals` | GET | `/api/cron/publish-scheduled-signals` |

---

## Migration Steps (Phase 6)

**Before running migration**

1. Stop both agnes-next and deepquill servers.
2. Ensure agnes-next DB has the source data.
3. Ensure deepquill DB exists and schema is migrated.
4. Ensure User IDs in agnes-next exist in deepquill (shared User source, or migrate Users first).

**Run migration**

From agnes-next directory:

```bash
cd agnes-next
node scripts/migrate-signal-review-to-deepquill.cjs
```

Or with explicit URLs:

```bash
cd agnes-next
AGNES_DATABASE_URL="file:./dev-next.db" DEEPQUILL_DATABASE_URL="file:../deepquill/dev.db" node scripts/migrate-signal-review-to-deepquill.cjs
```

**Behavior**

- Reads from agnes-next DB; writes to deepquill DB.
- Preserves IDs for Signal, SignalReply, SignalAcknowledge, SignalComment, SignalCommentUpvote, SignalEvent, Review.
- Idempotent: skips rows that already exist.
- If `userId` is not in deepquill User table: Signal/Review/Reply/Comment set `userId` null where nullable; Acknowledge/Upvote/Review skipped.
- Logs stats and errors.

---

## Blockers

None known. Caveats:

1. **User FK** – Migration assumes Users are shared or already present in deepquill. If agnes-next has Users not in deepquill, those Signals/Reviews may be skipped or have null `userId`.
2. **Prisma client paths** – Script expects `agnes-next/node_modules/.prisma/client` and `deepquill/node_modules/.prisma/client`. Run `npx prisma generate` in both apps before migration.
3. **Env** – Proxy base URL: set `DEEPQUILL_URL` or `NEXT_PUBLIC_API_BASE_URL` in agnes-next to point at deepquill.

---

## Verification Checklist

### Phase 4 (Admin jobs in deepquill)

- [ ] `GET /api/admin/jobs/send-engaged-reminders` (with `x-admin-key`) runs in deepquill
- [ ] `GET /api/admin/jobs/seed-signal-room` seeds system signals
- [ ] `GET /api/cron/publish-scheduled-signals` (with `Authorization: Bearer ${CRON_SECRET}`) publishes drafts

### Phase 5 (Proxy)

- [ ] agnes-next UI: list signals, create signal, create review – all work via proxy
- [ ] Admin moderation from agnes-next UI approves and awards points
- [ ] Admin jobs from agnes-next UI hit deepquill and complete

### Phase 6 (Migration)

- [ ] Run `node scripts/migrate-signal-review-to-deepquill.cjs` from repo root
- [ ] Script reports migrated counts; no unexpected errors
- [ ] Migrated signals/reviews appear in deepquill DB and in UI
- [ ] IDs preserved; links and references still valid

### General

- [ ] No UX changes
- [ ] Route paths unchanged
- [ ] agnes-next is UI/proxy only (no direct Signal/Review DB access)
