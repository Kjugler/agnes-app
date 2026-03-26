# Deepquill Baseline Alignment Plan

**Date:** 2026-03-14  
**Branch:** restore-baseline-2026-03-20  
**Purpose:** Restore deepquill to self-consistent baseline state; fix Prisma client/schema/DB/code mismatches.

---

## 1. Analysis Summary

### Root Cause

The **Prisma client** in `deepquill/node_modules/.prisma/client` was generated from an **older schema** than the current `deepquill/prisma/schema.prisma`. Evidence from the embedded schema in the generated client:

| Component | Generated Client (stale) | Current schema.prisma |
|-----------|--------------------------|------------------------|
| **Ledger** | No `sessionId`, `amount`, `currency`, `meta` | Has all four |
| **LedgerType** | 17 values (no PURCHASE_RECORDED, EMAIL_AP_SALE_NOTIFICATION, etc.) | 25+ values including EMAIL_AP_SALE_NOTIFICATION |
| **User** | No `preferredDiscountCode`, `lastReferredByUserId`, etc. | Has all referral/discount fields |

### Baseline Compatibility

- **deepquill/prisma/schema.prisma** — **baseline-correct**. Matches e8ae7b6 and includes all fields required by the code.
- **Code files** (hasContestJoin, points/me, create-checkout-session) — **correct**. They expect the baseline schema.
- **Prisma client** — **stale**. Regenerate from current schema.
- **deepquill/dev.db** — **unknown**. May have been migrated by agnes-next when DBs were shared. Needs verification.

### Schema Alignment Method

| Option | Use Case | Destructiveness |
|--------|----------|-----------------|
| **prisma generate** | Client out of sync with schema | None — regenerates client only |
| **migrate reset** | DB schema drift; local testing; no data to preserve | **Full wipe** — drops DB, reapplies all migrations |
| **migrate deploy** | DB behind migrations; production | Applies pending migrations only |
| **db push** | Prototype; schema drift; no migration history | Can drop columns/data |

**Recommended for local baseline testing:** `prisma generate` first. If errors persist (DB schema drift), then `migrate reset`.

**Why migrate reset if needed:** For local testing with no data to preserve, a clean slate guarantees schema matches migration history. `migrate deploy` only applies pending migrations and may fail if the DB is in an inconsistent state from shared-DB usage. `db push` bypasses migrations and can cause unexpected data loss.

---

## 2. Exact Commands to Run

### Step 1: Stop deepquill server

Stop the running deepquill process (npm run start-server or similar). The Prisma query engine DLL is locked while the server runs; `prisma generate` will fail with EPERM otherwise.

### Step 2: Regenerate Prisma client

```powershell
cd c:\dev\agnes-app\deepquill
npx prisma generate
```

### Step 3: Align DB (if generate alone doesn't fix runtime errors)

If you still see schema/DB mismatches after regenerate:

```powershell
cd c:\dev\agnes-app\deepquill
$env:DATABASE_URL="file:C:/dev/agnes-app/deepquill/dev.db"
npx prisma migrate reset --force
```

`--force` skips the confirmation prompt. This **wipes** `deepquill/dev.db` and reapplies all migrations.

### Step 4: Restart deepquill

```powershell
cd c:\dev\agnes-app\deepquill
npm run start-server
```

---

## 3. Code Changes (None Required)

The following were analyzed; **no code edits are needed**:

| File | Status |
|------|--------|
| **hasContestJoin.cjs** | Uses `currency: 'points'` — schema has it. Client was stale. |
| **api/points/me.cjs** | Uses `include: { ledger }` — schema has LedgerType. Client was stale. |
| **api/create-checkout-session.cjs** | Uses `preferredDiscountCode`, `lastReferredByUserId`, etc. — schema has them. Client was stale. |

All code matches the baseline schema. Regenerating the client resolves the mismatches.

---

## 4. Env Configuration

Ensure deepquill uses its own DB:

| File | Variable | Value |
|------|----------|-------|
| **deepquill/.env** or **.env.local** | DATABASE_URL | `file:C:/dev/agnes-app/deepquill/dev.db` |

---

## 5. Must deepquill/dev.db Be Reset?

| Scenario | Action |
|----------|--------|
| **Regenerate fixes all errors** | No reset needed |
| **Errors persist after regenerate** | Yes — run `prisma migrate reset --force` |
| **DB was used when agnes-next pointed at it** | Likely yes — schema may be mixed |

For baseline validation, a reset is the safest way to ensure a clean, consistent DB.

---

## 6. Expected Symptom Improvements

| Symptom | Expected After Fix |
|---------|--------------------|
| **Officially Enter Contest → See Progress** | `hasContestJoin` works; contest join state correct |
| **Ascension does not repeat incorrectly** | Ledger queries succeed; no duplicate awards |
| **/api/points/me stops 500ing** | User + Ledger queries succeed; EMAIL_AP_SALE_NOTIFICATION in enum |
| **Score no longer shows zero from backend failure** | points/me and contest/score return correctly |
| **Discount code persistence works again** | User.preferredDiscountCode read/write works |
| **Checkout referral behavior matches baseline** | lastReferralCode, lastReferredByUserId used correctly |

---

## 7. UX Preservation

No changes to:

- Lightening flow
- 3-way splitter
- Congratulations page
- Signal room UX

All fixes are alignment of schema, client, and DB — no UX changes.

---

## 8. Checklist

- [ ] Stop deepquill server
- [ ] `cd deepquill && npx prisma generate`
- [ ] Confirm `DATABASE_URL` points to `deepquill/dev.db`
- [ ] If errors persist: `npx prisma migrate reset --force`
- [ ] Restart deepquill
- [ ] Verify: /api/points/me, /api/contest/score, /api/associate/status, checkout flow
