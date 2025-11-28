# Referral Rewards Backend Setup

## Overview
This document describes the DeepQuill backend implementation for referral rewards.

## Database Setup

### 1. Run Prisma Migration
In `agnes-next` directory:
```bash
npx prisma migrate dev --name add_referral_rewards
```

Or manually run the SQL migration from `agnes-next/prisma/migrations/add_referral_rewards.sql`

### 2. Generate Prisma Client
```bash
cd agnes-next
npx prisma generate
```

## Environment Variables

Add to `deepquill/.env`:
```
DEEPQUILL_API_TOKEN=your-secret-token-here
DATABASE_URL=file:./dev.db  # or your PostgreSQL connection string
```

The `DATABASE_URL` should point to the same database that agnes-next uses.

## API Endpoint

### POST /api/referrals/award-commission

**Authentication:**
- Header: `Authorization: Bearer <DEEPQUILL_API_TOKEN>`

**Request Body:**
```json
{
  "referralCode": "ABC123",
  "buyerEmail": "friend@example.com",
  "stripeSessionId": "cs_test_123",
  "commissionCents": 200
}
```

**Response:**
- `200 OK`: Commission awarded successfully
- `400 Bad Request`: Invalid input
- `401 Unauthorized`: Missing or invalid token
- `500 Internal Server Error`: Server error

## Testing

1. **Test referral code lookup:**
   ```bash
   curl -X POST http://localhost:5055/api/referrals/award-commission \
     -H "Authorization: Bearer your-token" \
     -H "Content-Type: application/json" \
     -d '{
       "referralCode": "TEST123",
       "buyerEmail": "test@example.com",
       "stripeSessionId": "cs_test_abc",
       "commissionCents": 200
     }'
   ```

2. **Test idempotency:**
   - Send the same request twice with the same `stripeSessionId`
   - Second request should return `200 OK` with message "Conversion already recorded"

3. **Test invalid referral code:**
   - Use a non-existent referral code
   - Should return `200 OK` with message "Unknown referral code"

## Integration with agnes-next

The agnes-next webhook (`/api/stripe-webhook`) calls this endpoint when a purchase completes with a referral code.

Make sure `DEEPQUILL_API_URL` and `DEEPQUILL_API_TOKEN` are set in agnes-next's `.env`.

