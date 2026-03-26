# Database Usage Audit

**Date:** 2025-03-21  
**Goal:** Map all SQLite/database dependencies in deepquill and agnes-next before deployment.

---

## Summary

| App | DB File | Tables/Models | Production-Critical | Deployment Blocker |
|-----|---------|---------------|---------------------|--------------------|
| **deepquill** | `dev.db` (DATABASE_URL) | User, Ledger, Purchase, Customer, Order, FulfillmentUser, FulfillmentPayment, ReferralConversion, Event, Badge, UserBadge, Post, Signal, SignalReply, SignalAcknowledge, Review | **Yes** | **Yes** – all canonical |
| **agnes-next** | `dev-next.db` (DATABASE_URL) | User, Ledger, Purchase, Event, Signal, SignalComment, SignalCommentUpvote, SignalEvent, Review, Customer, Order, FulfillmentUser, FulfillmentPayment | **Mixed** | **Yes** – Signal room, Reviews, Admin jobs |

---

## 1. Deepquill DB Usage

### 1.1 Schema (SQLite via `DATABASE_URL`)

**Provider:** `sqlite` · **Default:** `file:./dev.db` (or env)

| Model | Purpose |
|-------|---------|
| User | Contest players, associates, referral attribution, points, terminal discovery, rabbit |
| Ledger | Points audit trail, idempotency (sessionId+type+userId), purchase points, referral commission |
| Event | Activity tracking |
| Badge, UserBadge | Badge/achievement system |
| Post | Legacy posts |
| Purchase | Stripe checkout sessions → user linkage |
| ReferralConversion | Referral commissions, digest tracking |
| Customer | Stripe Customer → User linkage, shipping |
| Order | Fulfillment: status, shipping, label/ship attribution |
| FulfillmentUser | Helper management, earnings |
| FulfillmentPayment | Helper payments |
| Signal, SignalReply, SignalAcknowledge | Signal room (deepquill has simpler schema) |
| Review | Reviews (one per user) |

**Note:** `PointAward` is referenced in `lib/points/awardPoints.cjs` (signal/review approval awards) but is **not** in the current Prisma schema. If missing, those code paths may fail at runtime.

### 1.2 Fulfillment DB Split

- **`FULFILLMENT_DATABASE_URL`**: When set and ≠ `DATABASE_URL`, fulfillment uses a separate DB.
- **Current setup**: Not set → `fulfillmentPrisma = prisma` → Order, Customer, FulfillmentUser, FulfillmentPayment live in main deepquill DB.

### 1.3 Deepquill Routes / Flows Using DB

| Route/File | Models Used | Classification |
|------------|-------------|-----------------|
| `POST /api/create-checkout-session` | User | **Canonical** – principal resolution |
| `POST /api/stripe-webhook` | User, Ledger, Purchase, ReferralConversion, Customer, Order | **Canonical** – purchase flow |
| `GET /api/contest/score` | User, Purchase, Ledger | **Canonical** – contest score |
| `POST /api/contest/login` | User | **Canonical** – contest identity |
| `POST /api/contest/join` | User, Ledger | **Canonical** – contest join |
| `POST /api/contest/explicit-enter` | User, Ledger | **Canonical** – explicit entry |
| `POST /api/contest/terminal-discovery` | User, Ledger | **Canonical** – 250-pt terminal bonus |
| `GET /api/contest/live-stats` | User, Purchase | **Canonical** – leaderboard |
| `GET /api/associate/status` | User | **Canonical** – associate/referral |
| `POST /api/associate/upsert` | User | **Canonical** – associate upsert |
| `POST /api/points/award` | User, Ledger | **Canonical** – points (shares, contest, etc.) |
| `GET /api/points/me` | User, Ledger | **Canonical** – rabbit + points |
| `POST /api/rabbit/catch` | User | **Canonical** – rabbit mission |
| `GET /api/referral/validate` | User | **Canonical** – referral code |
| `POST /api/refer-friend` | User | **Canonical** – refer flow |
| `POST /api/referral/award-email-points` | Ledger | **Canonical** – share points |
| `POST /api/award-referral-commission` | User, ReferralConversion | **Canonical** – commission |
| `GET /api/fulfillment/*` (all) | FulfillmentUser, FulfillmentPayment, Order, Customer | **Canonical** – fulfillment |
| `POST /api/fulfillment/print-label` | Order, FulfillmentUser | **Canonical** |
| `POST /api/fulfillment/mark-shipped` | Order, FulfillmentUser | **Canonical** |
| `send-daily-digests.cjs` | ReferralConversion (raw SQL) | **Canonical** |
| `webhook-diagnostic.cjs` | Purchase, Ledger | **Dev/diagnostic** |
| `debug/prisma.cjs` | Raw tables | **Dev only** |
| `checkout/verify-session.cjs` | Purchase | **Canonical** |
| `email/purchase-confirmation-status.cjs` | Ledger | **Canonical** |

**Conclusion:** Deepquill DB is **canonical** for User, Ledger, Purchase, Order, Customer, ReferralConversion, and fulfillment. All production flows depend on it.

---

## 2. Agnes-Next DB Usage

### 2.1 Schema (SQLite via `DATABASE_URL`)

**Provider:** `sqlite` · **Default:** `file:./dev-next.db`

agnes-next uses a **nearly duplicated** schema (User, Ledger, Purchase, etc.) plus Signal-room extensions: `SignalComment`, `SignalCommentUpvote`, `SignalEvent`, and expanded `Signal` fields.

### 2.2 Routes/Features Using agnes-next Prisma (Local DB)

| Route/File | Models Used | Classification |
|------------|-------------|-----------------|
| `GET /api/points` | Purchase, User, Event | **Presentation** – points display; should proxy to deepquill |
| `GET /api/signals` | Signal | **Presentation** – Signal room list |
| `POST /api/signal/create` | Signal, User, Purchase, ReferralConversion | **Production** – Signal creation |
| `POST /api/signal/reply` | Signal, SignalReply, User, Purchase, ReferralConversion | **Production** |
| `POST /api/signal/comment` | Signal, SignalComment, User | **Production** |
| `POST /api/signal/comment-upvote` | SignalComment, SignalCommentUpvote | **Production** |
| `POST /api/signal/ack` | SignalAcknowledge, User | **Production** |
| `GET /api/signal/events` | SignalEvent | **Production** |
| `GET /api/reviews/list` | Review | **Production** |
| `GET /api/reviews/summary` | Review | **Production** |
| `POST /api/reviews/create` | Review, User, Purchase, ReferralConversion | **Production** |
| `signal-room/page.tsx` | User, Signal | **Production** |
| `signal-room/[id]/page.tsx` | User, Signal | **Production** |
| `PATCH/DELETE /api/admin/signals/[id]` | Signal | **Production** |
| `POST /api/admin/signals` | Signal | **Production** |
| `api/cron/publish-scheduled-signals` | Signal | **Production** |
| `api/admin/moderation/*` | Signal, Review | **Production** |
| `api/admin/jobs/send-engaged-reminders` | User, ReferralConversion | **Production-critical** |
| `api/admin/jobs/send-non-participant-reminders` | User, ReferralConversion | **Production-critical** |
| `api/admin/jobs/send-no-purchase-reminders` | User | **Production-critical** |
| `api/admin/jobs/send-missionary-emails` | User, ReferralConversion | **Production-critical** |
| `api/admin/jobs/seed-signal-room` | Signal | **Dev/seed** |
| `lib/associatePublisher.ts` | User | **Read-only** – referral code |
| `lib/associate.ts` | User | **Legacy** – ensureAssociate, upsertAssociate (may still be imported) |
| `GET /api/db/ping` | User | **Dev/diagnostic** |
| `GET /api/db/diag` | Raw tables | **Dev/diagnostic** |
| `GET /api/debug/prisma` | Signal, User | **Dev/diagnostic** |

### 2.3 Routes That Proxy to Deepquill (No Local DB for That Flow)

| Route | Proxies To | Notes |
|-------|------------|-------|
| `POST /api/create-checkout-session` | deepquill | No local DB |
| `POST /api/stripe/webhook` | deepquill | No local DB |
| `GET /api/checkout/verify-session` | deepquill | No local DB |
| `POST /api/contest/login` | deepquill | No local DB |
| `POST /api/contest/join` | deepquill | No local DB |
| `POST /api/contest/explicit-enter` | deepquill | No local DB |
| `GET /api/contest/score` | deepquill | No local DB |
| `POST /api/contest/terminal-discovery` | deepquill | No local DB |
| `GET /api/contest/live-stats` | deepquill | No local DB |
| `GET /api/associate/status` | deepquill | No local DB |
| `POST /api/associate/upsert` | deepquill | No local fallback |
| `POST /api/points/award` | deepquill | No local DB |
| `GET /api/points/me` | deepquill | No local DB |
| `GET /api/rabbit/state` | deepquill | No local DB |
| `POST /api/rabbit/catch` | deepquill | No local DB |
| `GET /api/email/purchase-confirmation/status` | deepquill | No local DB |
| All `/api/fulfillment/*` | deepquill | No local DB |

---

## 3. IBM Terminal / Emulator Flow

### 3.1 Terminal Discovery Bonus (250 pts)

- **Flow:** Contest page with `?v=terminal` → `fetch('/api/contest/terminal-discovery')` → agnes-next proxies to deepquill `POST /api/contest/terminal-discovery`.
- **Storage:** 
  - **deepquill DB:** `User.terminalDiscoveryAwarded` (boolean), `Ledger` (TERMINAL_DISCOVERY_BONUS).
  - **Canonical:** deepquill.

### 3.2 “Do Not Show Again” Logic

- **Storage:** **Cookie** `terminal_discovery_complete=1` (client-side, path=/, 1-year max-age).
- **Not** stored in agnes-next or deepquill DB.

### 3.3 Terminal Emulator State (deepquill)

- **Phase:** `intro` | `terminal1` | `terminal2` | `lightning` (React state only).
- **Storage:** In-memory; no DB writes from TerminalEmulator.

### 3.4 250-Point Award Path

- **Canonical in deepquill** `api/contest/terminalDiscovery.cjs`.
- Uses deepquill `prisma` (main DB), not agnes-next.
- **Note:** 450 pts is used elsewhere (e.g. protocol copy); terminal discovery is **250 pts**.

---

## 4. Deployment Significance

### 4.1 SQLite as Deployment Blocker

| Usage | Blocker? | Reason |
|-------|----------|--------|
| deepquill `dev.db` | **Yes** | Vercel/serverless = ephemeral filesystem; SQLite file is not persistent |
| agnes-next `dev-next.db` | **Yes** | Same as above |
| FULFILLMENT_DATABASE_URL (when same file) | **Yes** | Still file-based SQLite |

### 4.2 Can agnes-next Run Without Its Own DB?

**No**, not in the current design. It still needs DB for:

1. **Signal room** – Signal, SignalReply, SignalAcknowledge, SignalComment, SignalCommentUpvote, SignalEvent (create, read, update).
2. **Reviews** – Review (create, list, summary, moderation).
3. **Admin jobs** – send-engaged, send-non-participant, send-no-purchase, send-missionary (read User, ReferralConversion from agnes-next DB and update User).

**Critical:** Admin jobs read User/ReferralConversion from **agnes-next** DB. Canonical User/ReferralConversion live in **deepquill** DB. This implies either:

- Admin jobs expect a synced/replicated agnes-next DB, or
- They operate on stale/separate data – **potential data inconsistency**.

### 4.3 Harmless / Local-Only Usages

| Route | Classification |
|-------|-----------------|
| `GET /api/db/ping` | Dev – health check |
| `GET /api/db/diag` | Dev – DB introspection |
| `GET /api/debug/prisma` | Dev – debug |
| `api/admin/jobs/seed-signal-room` | Dev – seeding |

### 4.4 Recommended Next Steps by Dependency

| Dependency | Recommended Step |
|------------|------------------|
| deepquill SQLite | Migrate to managed DB (e.g. Supabase, PlanetScale, Neon) before Vercel deploy |
| agnes-next SQLite | Same – migrate to managed DB; or consolidate into single DB and have agnes-next stop using Prisma for User/Purchase/ReferralConversion |
| Signal room (agnes-next) | Keep in agnes-next DB or move to deepquill; decide canonical home |
| Reviews (agnes-next) | Same – centralize in deepquill or keep in agnes-next with clear ownership |
| Admin jobs (User, ReferralConversion) | **High priority** – switch to deepquill API for reads/updates; avoid dual DB for canonical entities |
| `GET /api/points` | Replace with proxy to deepquill `/api/points/me` or equivalent |
| `PointAward` (deepquill) | Confirm if model exists; add migration or refactor awardPoints.cjs to use Ledger |
| associate.ts / ensureAssociate | Audit remaining imports; remove or route through deepquill proxy |

---

## 5. Output Summary

### Models/Tables by App

**Deepquill:** User, Ledger, Event, Badge, UserBadge, Post, Purchase, ReferralConversion, Customer, Order, FulfillmentUser, FulfillmentPayment, Signal, SignalReply, SignalAcknowledge, Review  
**agnes-next:** Same core models + SignalComment, SignalCommentUpvote, SignalEvent, extended Signal

### Classification Summary

| Classification | deepquill | agnes-next |
|----------------|-----------|------------|
| Canonical / production-critical | All main routes | Fulfillment (proxy), Signal room, Reviews, Admin jobs |
| Presentation-only | — | `/api/points` (should proxy) |
| Legacy / dead code | PointAward usage (unclear) | associate.ts, rabbitMissions, dailySharePoints (unused?) |
| Deployment blocker | SQLite file | SQLite file + dual-write risk |

### Migration / Restart Steps

1. **No DB changes required for this audit** – report only.
2. Before production deploy: migrate both apps from SQLite to a managed database.
3. Resolve agnes-next vs deepquill ownership for User, ReferralConversion in admin jobs.
