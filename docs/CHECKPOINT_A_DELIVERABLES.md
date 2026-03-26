# Checkpoint A Deliverables

**Migration plan**: Signal & Reviews migration (Phases 0–3)  
**Completed**: Phase 0, 1, 2, 3  
**Status**: Ready for validation before Checkpoint B (proxy replacement, data migration)

---

## Files Changed

### Phase 0 (PointAward → Ledger refactor)

| File | Change |
|------|--------|
| `deepquill/prisma/schema.prisma` | Added `SIGNAL_APPROVED`, `REVIEW_APPROVED` to `LedgerType` enum |
| `deepquill/lib/points/awardPoints.cjs` | Replaced `pointAward` with `recordLedgerEntry`; added `awardForSignalApproved`, `awardForReviewApproved` |

### Phase 1 (Schema extension)

| File | Change |
|------|--------|
| `deepquill/prisma/schema.prisma` | Added `SignalType`, `SignalPublishStatus`; extended `Signal` model; added `SignalComment`, `SignalCommentUpvote`, `SignalEvent` |

### Phase 2 (Signal/Review CRUD)

| File | Change |
|------|--------|
| `deepquill/lib/signalEvent.cjs` | **New** – `createSignalEvent(signalId, customText?)` helper |
| `deepquill/lib/resolveUser.cjs` | **New** – `resolveUserByEmail(req)`, `getEmailFromRequest(req)` |
| `deepquill/server/routes/signals.cjs` | **New** – full Signal CRUD router |
| `deepquill/server/routes/reviews.cjs` | **New** – Review create, list, summary |
| `deepquill/server/index.cjs` | Mounted signals, reviews routers at `/api` |

### Phase 3 (Moderation)

| File | Change |
|------|--------|
| `deepquill/server/routes/moderation.cjs` | **New** – approve-signal, approve-review, approve-all |
| `deepquill/server/index.cjs` | Mounted moderation router at `/api` |

---

## Migrations Applied

| Migration | Description |
|-----------|-------------|
| `20260321180417_extend_signal_add_comment_event` | Extended Signal model; added SignalComment, SignalCommentUpvote, SignalEvent |

**Note**: Phase 0 (LedgerType enum) required no migration for SQLite; enum values were added in-place.

---

## Endpoints Added

### Signals (Phase 2)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/signals` | Public | List published signals (cursor, type filter) |
| `POST` | `/api/signal/create` | Cookie/`x-user-email` | Create signal |
| `POST` | `/api/signal/reply` | Cookie/`x-user-email` | Add reply |
| `POST` | `/api/signal/comment` | Cookie/`x-user-email` | Add comment |
| `POST` | `/api/signal/comment-upvote` | Cookie/`x-user-email` | Upvote comment |
| `POST` | `/api/signal/ack` | Cookie/`x-user-email` | Toggle acknowledge |
| `GET` | `/api/signal/events` | Query: signalId | List ribbon events |
| `GET` | `/api/admin/signals` | `x-admin-key` | Admin list (held/pending) |
| `POST` | `/api/admin/signals` | `x-admin-key` | Admin create system signal |
| `GET` | `/api/admin/signals/:id` | `x-admin-key` | Admin get |
| `PATCH` | `/api/admin/signals/:id` | `x-admin-key` | Admin update |
| `DELETE` | `/api/admin/signals/:id` | `x-admin-key` | Admin delete |
| `POST` | `/api/admin/signals/:id/publish` | `x-admin-key` | Admin publish |
| `GET` | `/api/cron/publish-scheduled-signals` | `Authorization: Bearer ${CRON_SECRET}` | Publish scheduled signals |

### Reviews (Phase 2)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/reviews/create` | Cookie/`x-user-email` | Create/upsert review (one per user) |
| `GET` | `/api/reviews/list` | Public | List approved reviews |
| `GET` | `/api/reviews/summary` | Public | Summary stats (count, average, distribution) |

### Moderation (Phase 3)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/admin/moderation/approve-signal` | `x-admin-key` (or dev) | Approve signal; award +100 pts via Ledger |
| `POST` | `/api/admin/moderation/approve-review` | `x-admin-key` (or dev) | Approve review; award +150 pts via Ledger |
| `POST` | `/api/admin/moderation/approve-all` | `x-admin-key` (or dev) | Approve all held signals and reviews; award points |

---

## Test Checklist

### Phase 0 (Ledger)

- [ ] Signal approval awards +100 pts to Ledger; idempotent via `signal_approved_<signalId>`
- [ ] Review approval awards +150 pts to Ledger; idempotent via `review_approved_<reviewId>`
- [ ] Points totals computed from Ledger rollup (not `user.points`)

### Phase 1 (Schema)

- [ ] `npx prisma migrate status` shows applied migrations
- [ ] `SignalComment`, `SignalEvent`, `SignalCommentUpvote` create/read work
- [ ] Extended `Signal` fields (title, type, content, mediaType, etc.) persist correctly

### Phase 2 (CRUD)

**Signals**

- [ ] `GET /api/signals` – returns approved signals with cursor pagination
- [ ] `POST /api/signal/create` – creates signal; HELD if profanity/link, APPROVED if purchase/contest official
- [ ] `POST /api/signal/reply` – adds reply to signal
- [ ] `POST /api/signal/comment` – adds comment
- [ ] `POST /api/signal/comment-upvote` – upvotes comment
- [ ] `POST /api/signal/ack` – toggles acknowledge (unique per signal+user)
- [ ] `GET /api/signal/events?signalId=X` – returns ribbon events
- [ ] Admin: list/create/publish/update/delete signals (with `x-admin-key`)

**Reviews**

- [ ] `POST /api/reviews/create` – upserts review (one per user); HELD/APPROVED logic same as Signal
- [ ] `GET /api/reviews/list` – returns approved reviews only
- [ ] `GET /api/reviews/summary` – returns count, average, distribution

**Auth**

- [ ] User auth via `contest_email`, `user_email`, `mockEmail`, `associate_email` cookies or `x-user-email` header
- [ ] 401 when no valid user

### Phase 3 (Moderation)

- [ ] `POST /api/admin/moderation/approve-signal` – body `{ id }` – status→APPROVED, awards +100
- [ ] `POST /api/admin/moderation/approve-review` – body `{ id }` – status→APPROVED, awards +150
- [ ] `POST /api/admin/moderation/approve-all` – approves all held; awards points for each

**Dev mode**

- [ ] In development, moderation and admin routes succeed without `x-admin-key`

---

## Known Issues

1. **Prisma generate EPERM**: Running `npx prisma generate` while the deepquill server is running may hit EPERM on `query_engine-windows.dll.node`. Stop the server before generating.

2. **agnes-next unchanged**: agnes-next still uses its own DB and API routes. No proxy replacement until Checkpoint B. Fresh Signal/Review activity via deepquill API is independent.

3. **`/api/points/award` legacy**: The existing `/api/points/award` handler (used by agnes-next proxy) remains. Moderation routes call `awardForSignalApproved`/`awardForReviewApproved` directly. Future Checkpoint B will replace agnes-next calls to deepquill moderation.

4. **Geo headers**: `x-vercel-ip-country` and `x-vercel-ip-country-region` are Vercel-provided. For local tests they may be absent; `countryCode`/`region` will be null.

5. **AUTO_APPROVE_USER_CONTENT**: In dev with `AUTO_APPROVE_USER_CONTENT=true`, held content is auto-approved. For moderation testing, set it to `false` or unset.

---

## Confirmation: Fresh Signal/Review Activity in Deepquill

**Before Checkpoint B**: agnes-next UI still talks to agnes-next DB via its own routes. No UX changes.

**For standalone validation of deepquill**:

1. Call deepquill directly (curl/Postman) with cookies or `x-user-email` set to a known user.
2. Create a signal: `POST http://localhost:5055/api/signal/create` with `{ "text": "Test signal" }`.
3. Create a review: `POST http://localhost:5055/api/reviews/create` with `{ "rating": 5, "text": "Great book" }`.
4. Approve held items: `POST http://localhost:5055/api/admin/moderation/approve-signal` with `{ "id": "<signalId>" }`.
5. Confirm Ledger entries exist for `SIGNAL_APPROVED` and `REVIEW_APPROVED`.

**Once Checkpoint A is validated**: Proceed to Checkpoint B (Phase 4 admin jobs, Phase 5 proxy replacement, Phase 6 data migration). Do **not** run Phase 6 until Checkpoint A is confirmed working.
