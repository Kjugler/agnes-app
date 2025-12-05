# Stripe Webhook Implementation - Complete Documentation

## Overview

This document describes the complete implementation of Stripe Checkout webhook handling for contest points and order capture, including shipping information.

## Architecture

### Data Flow

1. **User completes checkout** → Stripe redirects to `/contest/score?session_id=cs_test_...`
2. **Stripe sends webhook** → `POST /api/stripe/webhook` with `checkout.session.completed` event
3. **Webhook processes**:
   - Verifies Stripe signature
   - Retrieves full session details
   - Upserts Customer record
   - Creates Order record with shipping info
   - Awards 500 purchase points to player
   - Creates Ledger entry and Event record
4. **Score page displays** → Fetches score breakdown from `/api/contest/score?session_id=...`

## Database Schema

### Customer Model
```prisma
model Customer {
  id               String   @id @default(cuid())
  email            String   @unique
  name             String?
  shippingStreet   String?
  shippingCity     String?
  shippingState    String?
  shippingZip      String?
  shippingCountry  String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  orders           Order[]
}
```

### Order Model
```prisma
model Order {
  id               String    @id @default(cuid())
  customer         Customer  @relation(fields: [customerId], references: [id])
  customerId       String
  stripeSessionId String    @unique
  amountTotal      Int?      // in cents
  currency         String?
  contestPlayerId String?   // FK to User.id (optional)
  referralCode     String?
  pointsAwarded    Boolean   @default(false)
  
  // Shipping information
  shippingName         String?
  shippingAddressLine1 String?
  shippingAddressLine2 String?
  shippingCity         String?
  shippingState        String?
  shippingPostalCode   String?
  shippingCountry      String?
  shippingPhone        String?
  
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
}
```

## Webhook Handler (`/api/stripe/webhook/route.ts`)

### Key Fixes Applied

1. **Removed invalid `shipping_details` expansion**
   - Changed from: `expand: ['customer_details', 'shipping_details']`
   - Changed to: `expand: ['customer_details', 'payment_intent']`
   - Reason: `shipping_details` cannot be expanded - it's available directly on the session object

2. **Shipping Data Extraction**
   - Checks multiple sources in priority order:
     1. `session.shipping_details` (directly on session)
     2. `payment_intent.shipping` (if payment_intent is expanded)
     3. `customer_details.address` (fallback)
   - Extracts: name, phone, and full address (line1, line2, city, state, postal_code, country)

3. **Idempotent Processing**
   - Uses `stripeSessionId` as unique constraint
   - Checks if Order already exists before creating
   - Only awards points if `pointsAwarded = false`

### Function: `upsertCustomerAndOrderAndAwardPoints`

**Parameters:**
- `stripeSessionId`: Stripe checkout session ID
- `email`: Customer email
- `name`: Customer name
- `address`: Stripe.Address object
- `amountTotal`: Order total in cents
- `currency`: Currency code (e.g., 'usd')
- `contestPlayerId`: Optional User ID for contest player
- `referralCode`: Optional referral code
- `shippingName`: Shipping name
- `shippingPhone`: Shipping phone number

**Process:**
1. Normalizes email
2. Finds or creates User (ContestPlayer) before transaction
3. Uses Prisma transaction to ensure atomicity:
   - Upserts Customer by email
   - Creates Order (idempotent by `stripeSessionId`)
   - Finds ContestPlayer (User)
   - Awards 500 purchase points if not already awarded
   - Creates Ledger entry (`PURCHASE_BOOK`)
   - Creates Event record (`PURCHASE_COMPLETED`)

**Returns:**
```typescript
{
  customerId: string | null;
  orderId: string;
  playerId: string | null;
  pointsAwarded: number;
  alreadyAwarded?: boolean;
}
```

### Logging

The webhook logs at key points:
- `[webhook] Event received` - When webhook is hit
- `[webhook] Processing checkout.session.completed` - Processing started
- `[webhook] Shipping data sources` - Debug log showing where shipping data comes from
- `[webhook] ✅ Checkout processed successfully` - Success with all details

## Score API (`/api/contest/score/route.ts`)

### Endpoint: `GET /api/contest/score?session_id=cs_test_...`

**Process:**
1. Validates `session_id` parameter
2. Finds Order by `stripeSessionId`
3. Resolves ContestPlayer (User) via:
   - `order.contestPlayerId` (if set)
   - `order.customer.email` (fallback)
4. Calculates score breakdown:
   - `purchasePoints`: Sum of `PURCHASE_BOOK` ledger entries
   - `referralPoints`: Sum of `REFER_FRIEND_PAYOUT` ledger entries
   - `basePoints`: All other ledger entries
   - `totalPoints`: User's current `points` field

**Response (success):**
```json
{
  "totalPoints": 750,
  "basePoints": 250,
  "purchasePoints": 500,
  "referralPoints": 0
}
```

**Response (order not found):**
```json
{
  "totalPoints": 0,
  "basePoints": 0,
  "purchasePoints": 0,
  "referralPoints": 0,
  "message": "Order not found yet. The webhook may still be processing."
}
```

## Score Page (`/app/contest/score/page.tsx`)

### Features

1. **Session ID Handling**
   - Reads `session_id` from URL query params
   - Stores in `localStorage.last_session_id`
   - Falls back to localStorage if no URL param

2. **Score Display**
   - Shows total points prominently
   - Displays breakdown:
     - Base Points
     - Purchase Points (green, with + prefix)
     - Referral Points (blue, with + prefix)
   - Shows helpful message if purchase points are pending

3. **Error Handling**
   - Gracefully handles "order not found" (no red errors)
   - Falls back to regular score display
   - Shows loading state while fetching

## Environment Variables

Required in `.env.local`:
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_BOOK=price_...
NEXT_PUBLIC_SITE_URL=https://agnes-dev.ngrok-free.app
```

## Testing Checklist

### Phase 1: Verify Webhook Stability
- [ ] Run test checkout
- [ ] Check logs for: `[webhook] ✅ Checkout processed successfully`
- [ ] Verify no `shipping_details` expansion error
- [ ] Confirm Order row created in database
- [ ] Confirm 500 points awarded to player

### Phase 2: Verify Shipping Capture
- [ ] Complete checkout with shipping address
- [ ] Check logs for: `[webhook] Shipping data sources`
- [ ] Verify Order row has shipping fields populated:
  - `shippingName`
  - `shippingAddressLine1`
  - `shippingCity`
  - `shippingState`
  - `shippingPostalCode`
  - `shippingCountry`
  - `shippingPhone` (if collected)

### Phase 3: Verify Score Display
- [ ] Navigate to `/contest/score?session_id=cs_test_...`
- [ ] Verify score breakdown displays correctly
- [ ] Confirm purchase points show +500
- [ ] Verify "Back to Contest" button works

## Common Issues & Solutions

### Issue: "This property cannot be expanded (shipping_details)"
**Solution**: Removed `shipping_details` from expand array. Shipping details are available directly on the session object.

### Issue: Order not found in score API
**Possible causes:**
1. Webhook hasn't processed yet (check logs)
2. Webhook failed silently (check Stripe dashboard)
3. Session ID mismatch

**Solution**: Score API returns graceful default response. Check webhook logs for processing status.

### Issue: Points not awarded
**Check:**
1. Webhook logs show successful processing
2. `Order.pointsAwarded = true` in database
3. `Ledger` table has `PURCHASE_BOOK` entry
4. `User.points` increased by 500

## Migration History

1. `20251205144350_add_customer_and_order_models` - Initial Customer and Order models
2. `20251205190135_add_shipping_fields_to_order` - Added shipping fields to Order model

## Points System

### Purchase Points
- **Amount**: 500 points per purchase
- **Awarded**: Once per order (idempotent)
- **Tracked**: Via `Ledger` entry with type `PURCHASE_BOOK`
- **Event**: Creates `Event` record with type `PURCHASE_COMPLETED`

### Other Points Types
- **Base Points**: All ledger entries except `PURCHASE_BOOK` and `REFER_FRIEND_PAYOUT`
- **Referral Points**: Sum of `REFER_FRIEND_PAYOUT` ledger entries

## Future Enhancements

1. **Shipping Validation**: Add validation for required shipping fields
2. **Shipping Updates**: Handle shipping address updates via webhook
3. **International Shipping**: Support non-US addresses
4. **Shipping Methods**: Track selected shipping method
5. **Order Status**: Add order status tracking (pending, shipped, delivered)

