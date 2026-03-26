# Admin Fulfillment Workflow Verification

**Date:** 2025-03-21  
**Scope:** Distributed worker label-printing capability (original design check)

---

## 1. Exact Page/Route(s) Workers Use

| Route | Purpose |
|-------|---------|
| **`/admin/fulfillment/labels`** | Print labels: select worker identity → fetch next order → print label → assign to self |
| **`/admin/fulfillment/ship`** | Mark shipped: select worker identity → list orders printed by self → mark each as shipped |

**API routes called:**
- `POST /api/fulfillment/user` — Create/load FulfillmentUser (name, email)
- `GET /api/fulfillment/next-for-label` — Get oldest pending order needing a label
- `POST /api/fulfillment/print-label` — Mark label printed, assign to worker
- `GET /api/fulfillment/to-ship?fulfillmentUserId={id}` — List worker's printed-but-not-shipped orders
- `POST /api/fulfillment/mark-shipped` — Mark order shipped, send confirmation email

---

## 2. Batch Processing (5 Labels at a Time)

**Status: Does not exist.**

The current UI is **one order at a time**:
- Labels page: Shows 1 order → Worker clicks "Print Label & Assign to Me" → Label opens → `loadNextOrder()` fetches the next one
- No "Print 5 Labels" or batch fetch; no multi-order display for batch printing

Design docs and reports do not mention a 5-label batch. The workflow is **sequential single-order**.

---

## 3. End-to-End API Support

| Endpoint | Supported | Notes |
|----------|-----------|-------|
| `next-for-label` | Yes | Returns `{ order: {...} }` or `{ order: null }` |
| `print-label` | Yes | Assigns order to `fulfillmentUserId` |
| `mark-shipped` | Yes | Updates shipped, sends email |
| `to-ship` | Yes | Filters by `labelPrintedById = fulfillmentUserId` |
| `user` | Yes | Upserts FulfillmentUser by email |

The APIs support the workflow end-to-end; the UI uses them correctly.

---

## 4. Concurrency Protection (Multiple Workers)

**Status: No concurrency protection.**

**Current behavior:**
1. `next-for-label` — Read-only `findFirst` for oldest pending order. **No lock or claim.**
2. Two workers can both get the **same order** before either calls `print-label`.
3. `print-label` — Plain `update`; last writer wins.
4. Race sequence: Worker A and B both receive Order X → both call `print-label` → both succeed → Order X ends up assigned to whoever updated last.

**Effects:**
- Duplicate labels (both workers print the same order)
- Order ownership goes to the last `print-label` call
- One worker’s work is effectively orphaned

**Mitigation today:** Low concurrency in practice; workers rarely hit the same order. No `SELECT FOR UPDATE`, optimistic locking, or reservation.

---

## 5. Authentication / Access Control

**Status: None.**

| Component | Auth |
|-----------|------|
| `/admin/fulfillment/labels` | None — page is public |
| `/admin/fulfillment/ship` | None — page is public |
| `/api/fulfillment/*` | None — no `ADMIN_KEY`, no session check |
| Middleware | Does not protect `/admin/*` |

Anyone with the URL can:
- Create fulfillment users
- Fetch and print labels
- Mark orders shipped

Same pattern as the original design: trust-based, no auth.

---

## 6. Deployment / Config Impact on Worker Access

| Item | Impact |
|------|--------|
| `NEXT_PUBLIC_API_BASE_URL` | Agnès-next must reach deepquill; workers hit agnes-next, which proxies |
| Agnès-next down | Workers cannot use fulfillment |
| Deepquill down | 503 from fulfillment APIs |
| `FULFILLMENT_DATABASE_URL` | If wrong/missing, 503 "Fulfillment database not available" |

Workers only need access to agnes-next (e.g. `https://agnes.example.com/admin/fulfillment/labels`). No worker-specific config.

---

## 7. Summary

| Question | Answer |
|----------|--------|
| Exact page/route(s) | `/admin/fulfillment/labels`, `/admin/fulfillment/ship` |
| 5-label batch workflow | **Does not exist** — one order at a time |
| Concurrency protection | **None** — risk of duplicate labels under concurrent use |
| Auth / access control | **None** — pages and APIs are public |
| Deployment blockers | Agnès-next and deepquill must be up; env vars for DB and API base URL |

---

## 8. Blockers and Risks

| Severity | Issue |
|----------|-------|
| Medium | No concurrency protection — two workers can process the same order |
| Medium | No auth — anyone with URL can use fulfillment |
| Low | No 5-label batch — design may have changed or never implemented |
