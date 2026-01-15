# Fulfillment Implementation Plan

## Current State

**Problem:** 
- `deepquill` writes to `Purchase`/`Customer`/`Fulfillment` schema (new)
- `agnes-next` fulfillment routes query `Order` model (old schema, doesn't exist in deepquill DB)
- Both apps point to `deepquill/dev.db` but use different Prisma schemas

**Solution:**
Create fulfillment API endpoints in `deepquill` that the `agnes-next` UI can call. This ensures we're using the correct schema.

## Implementation Steps

### Step 1: Create Deepquill Fulfillment API Endpoints

**New endpoints in `deepquill/api/`:**
1. `fulfillment-queue.cjs` - GET `/api/admin/fulfillment/queue?limit=5`
2. `fulfillment-mark-shipped.cjs` - POST `/api/admin/fulfillment/mark-shipped`
3. `fulfillment-next-label.cjs` - GET `/api/admin/fulfillment/next-label`
4. `fulfillment-print-label.cjs` - POST `/api/admin/fulfillment/print-label`
5. `fulfillment-user.cjs` - POST `/api/admin/fulfillment/user` (or use User model)

### Step 2: Update Agnes-Next UI to Call Deepquill Endpoints

Update fulfillment routes in `agnes-next` to proxy to deepquill:
- `/api/fulfillment/to-ship` → Proxy to `deepquill/api/admin/fulfillment/queue`
- `/api/fulfillment/mark-shipped` → Proxy to `deepquill/api/admin/fulfillment/mark-shipped`
- `/api/fulfillment/next-for-label` → Proxy to `deepquill/api/admin/fulfillment/next-label`
- `/api/fulfillment/print-label` → Proxy to `deepquill/api/admin/fulfillment/print-label`
- `/api/fulfillment/user` → Use User model or proxy to deepquill

### Step 3: Add Payout Creation

When marking shipped, create `Payout` record:
- `amountCents = 200` ($2)
- `status = "PENDING"`
- `method = "FULFILLMENT_COMMISSION"`
- `externalRef = purchaseId`

### Step 4: Create Backfill Script

`tools/backfill-purchases-to-fulfillment.js`:
- Find `Purchase` where `product = "paperback"` AND `customerId` is null
- Fetch Stripe session, extract shipping, upsert Customer, link Purchase, ensure Fulfillment

