# Tier 2.4 Fulfillment Source-of-Truth Review

**Objective:** Determine whether fulfillment/order/shipping truth was split between agnes-next and deepquill, and move canonical fulfillment ownership to deepquill where needed.

**Completed:** 2025-03-21

---

## 1. Audit Summary

### Routes Audited

| Route | Method | Type | Owner | Status |
|-------|--------|------|-------|--------|
| `/api/fulfillment/next-for-label` | GET | **Read-only proxy** | deepquill | ✓ Proxy-only |
| `/api/fulfillment/to-ship` | GET | **Read-only proxy** | deepquill | ✓ Proxy-only |
| `/api/fulfillment/print-label` | POST | **Command proxy** | deepquill | ✓ Proxy-only |
| `/api/fulfillment/mark-shipped` | POST | **Command proxy** | deepquill | ✓ Proxy-only |
| `/api/fulfillment/user` | POST | **Command proxy** | deepquill | ✓ Proxy-only |

### Route Classifications

- **Read-only proxies:** `next-for-label`, `to-ship` — no mutations, pass-through to deepquill.
- **Command endpoints:** `print-label`, `mark-shipped`, `user` — mutations in deepquill only.

---

## 2. Findings

### 2.1 agnes-next: No Local Fulfillment Truth

- **No local Prisma reads/writes** for Order, fulfillment, or shipping in agnes-next.
- All fulfillment routes (`print-label`, `mark-shipped`, `next-for-label`, `to-ship`, `user`) are **pure proxies** via `proxyJson()` to deepquill.
- No fallback behavior, no local state mutations, no duplicate fulfillment truth in agnes-next.

### 2.2 deepquill: Canonical Fulfillment Owner

- **fulfillment.cjs** uses `fulfillmentPrisma` for all Order, Customer, FulfillmentUser reads/writes.
- Canonical fields: `status`, `labelPrintedAt`, `labelPrintedById`, `shippedAt`, `shippedById`.
- Presentation-only: UI receives shipping address, order ID, timestamps — no separate presentation schema.

### 2.3 Order Creation Gap (Fixed)

- **Before:** Stripe webhook created Purchase and Customer but **never created Order**. Fulfillment routes expected Order to exist; `next-for-label` would return nothing.
- **After:** Stripe webhook now upserts Order for `product === 'paperback'` when Customer is upserted. Uses `fulfillmentPrisma.order.upsert()` with `stripeSessionId` for idempotency.

### 2.4 Legacy / Duplicate Systems (Unchanged)

- **ordersStore.cjs** + **orders.cjs** (`POST /api/orders/create-from-stripe`) — JSON file store, numeric IDs. Not used by fulfillment UI.
- **adminOrders.cjs** (`GET /api/admin/orders/:id/label`) — uses ordersStore. Unused by current labels/ship pages.
- These were left as-is per “no architecture redesign” and “surgical edits only.”

---

## 3. Files Changed

| File | Change |
|------|--------|
| `deepquill/server/routes/fulfillment.cjs` | Wrapped `next-for-label` response in `{ order: {...} }` to match labels page expectation |
| `deepquill/api/stripe-webhook.cjs` | Added Order upsert for paperback purchases (existing-purchase path + new-purchase path) |

---

## 4. Files Verified Clean

| File | Verification |
|------|---------------|
| `agnes-next/src/app/api/fulfillment/print-label/route.ts` | Proxy-only, no Prisma |
| `agnes-next/src/app/api/fulfillment/mark-shipped/route.ts` | Proxy-only, no Prisma |
| `agnes-next/src/app/api/fulfillment/next-for-label/route.ts` | Proxy-only, no Prisma |
| `agnes-next/src/app/api/fulfillment/to-ship/route.ts` | Proxy-only, no Prisma |
| `agnes-next/src/app/api/fulfillment/user/route.ts` | Proxy-only, no Prisma |
| `agnes-next/src/app/admin/fulfillment/labels/page.tsx` | Calls fulfillment APIs only, no local DB |
| `agnes-next/src/app/admin/fulfillment/ship/page.tsx` | Calls fulfillment APIs only, no local DB |

---

## 5. Remaining Fulfillment Risks

| Risk | Severity | Notes |
|------|----------|-------|
| Order not created when `!buyerUser` | Medium | Webhook returns 500 for no-buyer; Stripe retries. Order only created when buyer attributed. |
| `fulfillmentPrisma` null | Low | Fulfillment routes return 503; Order upserts skipped with log. |
| `FULFILLMENT_DATABASE_URL` ≠ `DATABASE_URL` | Low | Order and Customer must be in same DB (FK). Separate DB would break Order.customerId. |
| Legacy ordersStore / adminOrders | Low | Dead/unused by current flow; can be removed in future cleanup. |

---

## 6. New Deepquill Endpoints

**None.** All fulfillment endpoints already existed in deepquill. No new endpoints added.

---

## 7. Behavior Changes & Edge Cases

| Change | Impact |
|--------|--------|
| `next-for-label` response shape | Labels page now correctly receives `data.order` when an order exists. Previously returned top-level fields; page expected `data.order` and would get `undefined`. |
| Order creation in webhook | Paperback purchases now create Order in DB; `next-for-label` can return orders. Idempotent via `stripeSessionId` upsert. |
| Non-paperback products | No Order created (ebook, audio_preorder). Expected; only paperbacks need shipping. |

---

## 8. Admin/Operator Workflow Preserved

- Labels page: select helper → load next order → print label → assign to user. ✓
- Ship page: select helper → load to-ship list → mark shipped. ✓
- No UI changes. No UX changes.

---

## 9. Canonical vs Presentation Summary

| Data | Canonical Location | Presentation |
|------|--------------------|--------------|
| Order status | deepquill (fulfillmentPrisma) | Returned by next-for-label, to-ship, print-label |
| labelPrintedAt/ById | deepquill | Returned by to-ship |
| shippedAt/ById | deepquill | Updated by mark-shipped |
| FulfillmentUser | deepquill | Created via /api/fulfillment/user |
| Customer | deepquill (prisma) | Used for shipping confirmation email |
