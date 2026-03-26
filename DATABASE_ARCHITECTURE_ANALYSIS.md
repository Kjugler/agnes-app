# Database Architecture Analysis — Restored Baseline (e8ae7b6)

**Date:** 2026-03-14  
**Branch:** restore-baseline-2026-03-20  
**Purpose:** Determine intended DATABASE_URL for agnes-next vs deepquill and whether shared-DB caused degradation.

---

## 1. In the working baseline, what DATABASE_URL was agnes-next intended to use locally?

**Answer:** `file:./dev-next.db` or `file:./prisma/dev.db` — agnes-next’s own SQLite file.

**Evidence:**
- `agnes-next/prisma/schema.prisma` (lines 8–9): *"DATABASE_URL="file:./dev-next.db" expects the DB file in agnes-next root."*
- `agnes-next/.env.local.example` (at e8ae7b6): `DATABASE_URL="file:./prisma/dev.db"`
- `agnes-next/.gitignore`: `prisma/dev.db` and `prisma/prisma/` — agnes-next expects its DB under its own `prisma/` or root
- `PRISMA_CWD_GUARD.md` (if present): `file:./dev-next.db` in agnes-next root

**Conclusion:** agnes-next was meant to use its own DB file, either `./dev-next.db` (root) or `./prisma/dev.db`.

---

## 2. In the working baseline, what DATABASE_URL was deepquill intended to use locally?

**Answer:** `file:C:/dev/agnes-app/deepquill/dev.db` (or `file:./dev.db` when run from deepquill root).

**Evidence:**
- `deepquill/server/prisma.cjs` (lines 10–12): if `DATABASE_URL` is unset, it defaults to `path.join(__dirname, '..', 'dev.db')` → `deepquill/dev.db`
- `deepquill/.env.local.backup` and `.env.backup`: `DATABASE_URL="file:C:/dev/agnes-app/deepquill/dev.db"`
- `deepquill/.env.example` at baseline: no `DATABASE_URL` — relies on `prisma.cjs` default

**Conclusion:** deepquill was meant to use its own `deepquill/dev.db`.

---

## 3. Which routes/features in agnes-next depend on its own local DB state?

| Route/Feature | Models Used | Purpose |
|--------------|-------------|---------|
| `/api/track` | User, Purchase, Event | Writes User, Purchase, Event on PURCHASE_COMPLETED |
| `/api/points` (GET/POST) | Purchase, User, Event | Reads points by sessionId/email (used by CurrentScoreButton) |
| `/api/points/award` | User, Ledger | Writes for book_purchase, share actions, rabbit; proxies some to deepquill |
| `/api/reviews/*` | Review | List, create, summary, moderation |
| `/api/fulfillment/*` | Order, FulfillmentUser | To-ship, next-for-label, mark-shipped, print-label |
| `/api/admin/*` | Signal, Review, User, ReferralConversion | Moderation, jobs, missionary emails, non-participant reminders |
| `/api/signal/*` | Signal, SignalComment, SignalAcknowledge, SignalCommentUpvote | Create, comment, upvote, ack |
| `/api/associate/upsert` | User | Local upsert before proxy |
| `/api/create-checkout-session` | User | Local user lookup before proxy |
| `/api/rabbit/catch` | User, Ledger | Rabbit bonus |
| `/api/db/diag` | Raw | DB diagnostics |
| **signal-room** (page) | User, Signal | Server component: list signals with publishStatus |
| **signal-room/[id]** | User, Signal | Signal detail |
| **Contest recognition, ascension gating** | User, Ledger, Event | Via associate, points, rabbit |

**Critical:** Signal room uses `publishStatus`, `SignalComment`, `SignalCommentUpvote`, `SignalEvent` — models/columns that exist only in agnes-next’s schema.

---

## 4. Which routes/features in deepquill depend on its own DB state?

| Route/Feature | Models Used | Purpose |
|---------------|-------------|---------|
| `/api/contest/score` | User, Purchase, Ledger, ReferralConversion | Canonical score |
| `/api/points/me` | User, Ledger, ReferralConversion | Points rollup |
| `/api/contest/login` | User | Contest login |
| `/api/contest/explicit-enter` | User, Ledger | Explicit contest entry |
| `/api/contest/terminal-discovery` | User, Ledger | Terminal discovery bonus |
| `/api/contest/live-stats` | User, Purchase | Live stats |
| `/api/associate/status` | User, Ledger | Associate status |
| `/api/associate/upsert` | User | User upsert |
| `/api/points/award` | User, Ledger | Points award |
| `/api/create-checkout-session` | User | Checkout session |
| `/api/stripe/webhook` | User, Purchase, Ledger, ReferralConversion, Customer | Webhook processing |
| `/api/track` (Mailchimp) | — | Mailchimp proxy |
| `/api/send-daily-digests` | ReferralConversion | Digest emails |

**Conclusion:** deepquill owns Purchase, Ledger, ReferralConversion, and the canonical User for purchases and score.

---

## 5. Did changing agnes-next to point at deepquill’s DB likely cause the current degradation?

**Yes.**

**Evidence:**

1. **Schema divergence**
   - agnes-next schema: Signal has `publishStatus`, `title`, `type`, `content`, `mediaType`, `mediaUrl`, `locationTag`, `locationName`, `tags`, `discussionEnabled`, `publishAt`; models `SignalComment`, `SignalCommentUpvote`, `SignalEvent`; enums `SignalType`, `SignalPublishStatus`.
   - deepquill schema: Signal has only `text`, `status`, etc.; no `publishStatus`, no `SignalComment`, `SignalCommentUpvote`, `SignalEvent`.

2. **Migration divergence**
   - agnes-next: `20260310170000_signals_spec_v2`, `20260310165333_add_signal_upgrade_fields`, etc.
   - deepquill: `20260312000000_add_terminal_discovery_bonus`, `20260206180916_add_last_referral_fields`, etc.
   - Different migration histories and `_prisma_migrations` state.

3. **Current config**
   - `agnes-next/.env`: `DATABASE_URL="file:C:/dev/agnes-app/deepquill/dev.db"`
   - agnes-next Prisma client expects agnes-next schema; the shared DB is likely migrated by deepquill (simpler schema).

4. **Failure modes**
   - Signal room: `prisma.signal.findMany` with `publishStatus` → column may not exist.
   - Signal comments: `SignalComment`, `SignalCommentUpvote` → tables may not exist.
   - Signal events: `SignalEvent` → table may not exist.
   - Any route using agnes-next-only models/columns will fail or behave incorrectly.

---

## 6. Should agnes-next DATABASE_URL now be restored to file:./dev-next.db (or equivalent) for the baseline test?

**Yes.** Use agnes-next’s own DB for the baseline test.

---

## 7. If yes, what exact env changes should be made, and in which file(s)?

| File | Current | Change To |
|------|---------|-----------|
| `agnes-next/.env` | `DATABASE_URL="file:C:/dev/agnes-app/deepquill/dev.db"` | `DATABASE_URL="file:./dev-next.db"` |
| `agnes-next/.env.local` | (if it overrides DATABASE_URL) | Remove `DATABASE_URL` or set `DATABASE_URL="file:./dev-next.db"` |

**Notes:**
- `file:./dev-next.db` is relative to agnes-next root (where `next dev` runs).
- Alternative: `file:./prisma/dev.db` if you prefer DB under `prisma/`.
- Ensure `agnes-next/.env.local` does not override with deepquill’s path.

---

## 8. After restoring agnes-next’s original DB reference, what specific symptoms should improve immediately if this theory is correct?

| Symptom | Why It Improves |
|---------|-----------------|
| **Signal room load** | agnes-next DB has full Signal schema (publishStatus, etc.) and SignalComment/SignalEvent tables. |
| **Signal comments / upvotes** | `SignalComment`, `SignalCommentUpvote` tables exist in agnes-next DB. |
| **Contest recognition** | User/associate data in agnes-next DB matches what agnes-next routes expect. |
| **Ascension gating** | Ledger/User in agnes-next DB used by rabbit, points/award. |
| **Fulfillment UI** | Order, FulfillmentUser in agnes-next DB. |
| **Admin moderation** | Signal, Review in agnes-next DB. |
| **Score page** | Still proxies to deepquill; no change. Score depends on deepquill DB. |
| **Emails (commission, points, friend savings)** | Sent by deepquill from its DB; no change. |

**Important:** Score, points/me, and emails stay on deepquill. Restoring agnes-next’s DB fixes agnes-next-only features (signal room, reviews, fulfillment, admin, contest recognition, ascension).

---

## Summary

| App | Intended local DB | Current (broken) |
|-----|-------------------|-----------------|
| agnes-next | `file:./dev-next.db` or `file:./prisma/dev.db` | `file:C:/dev/agnes-app/deepquill/dev.db` |
| deepquill | `file:C:/dev/agnes-app/deepquill/dev.db` | (unchanged) |

**Action:** Set `agnes-next` `DATABASE_URL="file:./dev-next.db"` (or `file:./prisma/dev.db`), then run `npx prisma migrate dev` or `npx prisma db push` from `agnes-next` to create/update its own DB. Do not run migrations against deepquill’s DB.
