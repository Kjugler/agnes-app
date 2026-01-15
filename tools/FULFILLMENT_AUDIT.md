# Fulfillment System Audit Report

## Part A: Existing Code Found

### ✅ Found Existing Fulfillment Infrastructure

**Admin UI Pages:**
- `agnes-next/src/app/admin/fulfillment/ship/page.tsx` - Ship books page
- `agnes-next/src/app/admin/fulfillment/labels/page.tsx` - Print labels page

**API Routes:**
- `agnes-next/src/app/api/fulfillment/to-ship/route.ts` - Get orders to ship
- `agnes-next/src/app/api/fulfillment/mark-shipped/route.ts` - Mark order as shipped
- `agnes-next/src/app/api/fulfillment/print-label/route.ts` - Print label and assign
- `agnes-next/src/app/api/fulfillment/next-for-label/route.ts` - Get next order for label
- `agnes-next/src/app/api/fulfillment/user/route.ts` - Create/load fulfillment user

**Deepquill Routes:**
- `deepquill/lib/generateShippingLabel.cjs` - PDF label generation (4x6)
- `deepquill/server/routes/adminOrders.cjs` - Admin order label endpoint

**Scripts:**
- `deepquill/scripts/process-fulfillments.cjs` - eBook fulfillment worker (for ebook downloads, not paperback shipping)

### ❌ Problem: Schema Mismatch

**Old Schema (agnes-next):**
- Uses `Order` model with `labelPrintedAt`, `shippedAt`, `labelPrintedById`, `shippedById`
- Uses `FulfillmentUser` model for workers
- Uses `Customer` model (different structure)

**New Schema (deepquill):**
- Uses `Purchase` model (no `labelPrintedAt`, `shippedAt` fields)
- Uses `Fulfillment` model with `status`, `shippedAt`, `trackingNumber`, `carrier`
- Uses `Customer` model (shipping fields match)
- Uses `Payout` model for worker commissions ($2 per paperback)

**Current State:**
- Webhook writes to `deepquill` schema (`Purchase`/`Customer`/`Fulfillment`)
- Admin UI routes query `agnes-next` schema (`Order` model)
- **Result: Admin UI shows no orders because it's querying the wrong database!**

## Part B: Git History (Skipped - code exists but needs migration)

## Part C: Schema Analysis

### ✅ Deepquill Schema (Current/Correct)
- `Purchase`: Has `customerId`, `product`, `stripeSessionId`, `paymentIntentId`
- `Customer`: Has shipping fields (`shippingStreet`, `shippingCity`, etc.)
- `Fulfillment`: Has `purchaseId`, `status`, `shippedAt`, `trackingNumber`, `carrier`, `notes`
- `Payout`: Has `userId`, `amountCents`, `status`, `method`, `externalRef`, `paidAt`

### ❌ Missing: Worker Identity Model
- **Recommendation**: Use `User` model with a role field OR create `FulfillmentUser` in deepquill schema
- **Simplest**: Use `User` model - fulfillment workers are just users with a specific email/role

## Part D: Implementation Plan

### 1. Update Fulfillment Routes to Use Deepquill Schema

**Files to Update:**
- `agnes-next/src/app/api/fulfillment/to-ship/route.ts` → Query `Purchase` + `Fulfillment` + `Customer`
- `agnes-next/src/app/api/fulfillment/mark-shipped/route.ts` → Update `Fulfillment` + Create `Payout`
- `agnes-next/src/app/api/fulfillment/print-label/route.ts` → Query `Purchase` + `Customer`
- `agnes-next/src/app/api/fulfillment/next-for-label/route.ts` → Query `Purchase` + `Fulfillment` + `Customer`
- `agnes-next/src/app/api/fulfillment/user/route.ts` → Use `User` model (or create `FulfillmentUser` in deepquill)

**Key Changes:**
- Query `Purchase` where `product = "paperback"` AND `Fulfillment.status = "PENDING"` OR `Fulfillment` is missing
- Join with `Customer` to get shipping address
- When marking shipped: Update `Fulfillment.status = "SHIPPED"`, set `shippedAt`, `trackingNumber`, `carrier`
- Create `Payout` record: `amountCents = 200` ($2), `status = "PENDING"`, `method = "FULFILLMENT_COMMISSION"`

### 2. Add Payout Creation

When `mark-shipped` is called:
```typescript
// Create payout for fulfillment worker
await prisma.payout.create({
  data: {
    userId: fulfillmentUserId, // Worker's User.id
    amountCents: 200, // $2 per paperback
    status: "PENDING",
    method: "FULFILLMENT_COMMISSION",
    externalRef: purchaseId,
  },
});
```

### 3. Backfill Script

Create `tools/backfill-purchases-to-fulfillment.js`:
- Find all `Purchase` where `product = "paperback"` AND `customerId` is null
- For each purchase:
  - Fetch Stripe session by `stripeSessionId`
  - Extract shipping/customer details
  - Upsert `Customer` by email
  - Update `Purchase.customerId` + `paymentIntentId`
  - Ensure `Fulfillment` exists with `status = "PENDING"`

## Part E: Test Plan

1. Make a new paperback purchase
2. Verify `Customer` + `Purchase.customerId` + `Fulfillment` created
3. Open `/admin/fulfillment/labels` → See order
4. Print label → `Fulfillment` updated (no status change, just tracking)
5. Open `/admin/fulfillment/ship` → See order
6. Mark shipped → `Fulfillment.status = "SHIPPED"`, `Payout` created ($2)
7. Verify payout appears in worker's earnings

