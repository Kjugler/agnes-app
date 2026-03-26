# Fulfillment Production Plan: FIFO + Reservation + Auth

**Operational model:** One-order-at-a-time FIFO. Fetch → print → attach → stage → fetch next. No batch fulfillment.

**Goals:** FIFO, reservation/locking, single-worker claim, authentication, preserve simple workflow.

---

## 1. Schema Changes

### Order model (deepquill + agnes-next, same schema)

Add reservation fields:

```prisma
// Add to Order model, in the fulfillment fields section:

  // Reservation (claim when worker fetches; released on print or timeout)
  reservedAt        DateTime?
  reservedById      String?
  reservedBy        FulfillmentUser? @relation("Reserver", fields: [reservedById], references: [id])

  // Existing: labelPrintedAt, labelPrintedById, shippedAt, shippedById, ...
```

Add index:

```prisma
  @@index([reservedById])
  @@index([status, reservedAt])  // For FIFO + expired-reservation queries
```

Add to FulfillmentUser model (if not using separate relation name):

```prisma
  reservedOrders Order[] @relation("Reserver")
```

### Migration SQL (conceptual)

```sql
ALTER TABLE "Order" ADD COLUMN "reservedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "reservedById" TEXT;
-- FK to FulfillmentUser
CREATE INDEX "Order_reservedById_idx" ON "Order"("reservedById");
CREATE INDEX "Order_status_reservedAt_idx" ON "Order"("status", "reservedAt");
```

**Reservation TTL:** 30 minutes. `reservedAt` older than 30 min is treated as expired; order can be re-claimed.

---

## 2. API Changes

### 2.1 `GET /api/fulfillment/next-for-label` → **Command (mutating)**

**Current:** Read-only, returns oldest pending order.  
**New:** Mutating — atomically claim and return.

**Behavior:**
1. Require `fulfillmentUserId` (query param or header).
2. In a transaction:
   - Find oldest order where: `status = 'pending'`, `labelPrintedAt IS NULL`, and (`reservedAt IS NULL` OR `reservedAt < now - 30min`).
   - If none → return `{ order: null }`.
   - Else: `UPDATE` that order SET `reservedAt = now`, `reservedById = fulfillmentUserId`.
   - Return the order.
3. FIFO: `orderBy: { createdAt: 'asc' }`.

**Request:**
- `GET /api/fulfillment/next-for-label?fulfillmentUserId={id}`  
  OR pass `fulfillmentUserId` in header `X-Fulfillment-User-Id`.

**Response:** Same shape as today: `{ order: {...} }` or `{ order: null }`.

---

### 2.2 `POST /api/fulfillment/print-label` — **Enforce reservation**

**Current:** Accepts any `orderId` + `fulfillmentUserId`; updates order.  
**New:** Enforce that the caller owns the reservation.

**Behavior:**
1. Load order by `orderId`.
2. If `order.reservedById !== fulfillmentUserId` and `order.reservedAt` is not expired (within 30 min): return `403` "Order reserved by another worker" or "Order not reserved for you".
3. If reserved by this user (or reservation expired): proceed with current update; clear `reservedAt`, `reservedById`; set `labelPrintedAt`, `labelPrintedById`, `status = 'label_printed'`.
4. Optional: allow "take-over" if reservation expired (another worker can print).

---

### 2.3 `POST /api/fulfillment/release-reservation` — **New (required for Skip)**

Allow worker to release an order without printing (e.g. problem order, wrong item, "Skip / Problem" button).

- `POST` body: `{ orderId, fulfillmentUserId }`.
- Only the reserving worker can release.
- `UPDATE` order SET `reservedAt = NULL`, `reservedById = NULL`.
- **Labels page "Skip / Problem"** must call this before `loadNextOrder()`; otherwise the skipped order stays reserved for 30 min and blocks other workers.

---

### 2.4 `GET /api/fulfillment/to-ship` — **No change**

Still returns orders where `labelPrintedById = fulfillmentUserId` and `shippedAt IS NULL`. FIFO by `labelPrintedAt`. No reservation logic.

---

### 2.5 `POST /api/fulfillment/mark-shipped` — **No change**

Still marks shipped and sends email. No reservation logic.

---

### 2.6 `POST /api/fulfillment/user` — **No change**

Still upserts FulfillmentUser by email. Needed before `next-for-label` (worker must have identity).

---

## 3. Authentication / Access Control

### 3.1 Shared secret

Use one of:
- `ADMIN_KEY` (already used for moderation)
- `FULFILLMENT_ACCESS_TOKEN` (separate, recommended for isolation)

Set in both agnes-next and deepquill env.

### 3.2 API protection

**All** `/api/fulfillment/*` routes require:

- Header: `x-fulfillment-token: <FULFILLMENT_ACCESS_TOKEN>`

Or, if reusing admin:

- Header: `x-admin-key: <ADMIN_KEY>`

If missing or invalid → `401 Unauthorized`.

### 3.3 Page protection

**Routes:** `/admin/fulfillment/labels`, `/admin/fulfillment/ship`

**Option A — Query param (simplest):**
- First visit: redirect to `/admin/fulfillment/auth?redirect=/admin/fulfillment/labels` (or similar).
- Auth page: single input for token; on submit, set `fulfillment_access` httpOnly cookie (or session) and redirect to intended page.
- Middleware for `/admin/fulfillment/*`: if no valid auth cookie/session, redirect to auth page.
- Token checked server-side against `FULFILLMENT_ACCESS_TOKEN`.

**Option B — Middleware + cookie:**
- Middleware for `/admin/fulfillment/*` checks cookie `fulfillment_verified=1` (set by one-time token entry).
- Simple auth page: enter token → if valid, set cookie, redirect to labels/ship.
- No change to worker flow after first auth.

### 3.4 Preserving simple workflow

After one-time auth (per device/session):
- Worker opens `/admin/fulfillment/labels`.
- Selects name from list (Carly, Denise, etc.) — same as today.
- Fetches next, prints, stages, fetches next — unchanged.

No per-request token entry. Token in cookie or session; API routes get token from header — agnes-next proxy adds `x-fulfillment-token` from cookie/session when forwarding to deepquill.

---

## 4. Exact Change Summary

### Schema (Prisma)

| Model  | Change |
|--------|--------|
| Order  | Add `reservedAt`, `reservedById`; add relation and indexes |
| FulfillmentUser | Add `reservedOrders` relation |

### Deepquill API

| Endpoint | Change |
|----------|--------|
| `GET /next-for-label` | Require `fulfillmentUserId`; mutate: claim order atomically; apply 30-min TTL for expired reservations |
| `POST /print-label` | Enforce reservation ownership; clear reservation on success |
| `POST /release-reservation` | New optional endpoint |
| All fulfillment routes | Require `x-fulfillment-token` (or `x-admin-key`) |

### Agnès-next

| Item | Change |
|------|--------|
| `/admin/fulfillment/*` middleware | Require auth; redirect to auth page if missing |
| `/admin/fulfillment/auth` page | New: token entry, set cookie, redirect |
| Proxy routes `/api/fulfillment/*` | Forward `x-fulfillment-token` from cookie/session |
| Labels page | Call `next-for-label` with `fulfillmentUserId` (already has user) |

### Environment

| Variable | Purpose |
|----------|---------|
| `FULFILLMENT_ACCESS_TOKEN` | Shared secret for fulfillment; set in agnes-next and deepquill |

---

## 5. Concurrency Behavior

| Scenario | Result |
|----------|--------|
| Worker A fetches next | Order X reserved for A |
| Worker B fetches next | Gets Order Y (X excluded; reserved) |
| Worker A prints X | Reservation cleared; X has `labelPrintedById = A` |
| Worker A abandons for 30 min | Reservation expires; next fetch can return X |
| Worker B calls print-label on X (while A has it reserved) | 403 "Order reserved by another worker" |

---

## 6. Implementation Order

1. Schema migration (add `reservedAt`, `reservedById`).
2. Deepquill: update `next-for-label` (claim logic) and `print-label` (reservation check); add auth middleware.
3. Agnès-next: fulfillment auth page + middleware; proxy forwards token.
4. Agnès-next labels page: pass `fulfillmentUserId` to `next-for-label`.
5. Optional: `release-reservation` endpoint and "Release" button for problem orders.

---

## 7. Safety Notes

- **Transaction:** Use Prisma `$transaction` for the claim in `next-for-label` (find + update atomically).
- **SQLite:** `$transaction` works; no `SELECT FOR UPDATE` in SQLite, but serialized transactions reduce race window.
- **Idempotency:** `print-label` with same `orderId` twice by same user is effectively idempotent (already printed).
- **TTL:** 30 min balances abandoned reservations vs long staging; configurable via `FULFILLMENT_RESERVATION_TTL_MINUTES` (default 30).
