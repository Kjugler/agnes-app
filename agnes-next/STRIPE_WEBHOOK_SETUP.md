# Stripe Webhook Setup & Troubleshooting

## Quick Setup Checklist

1. **Run Prisma Migration** (if not done yet):
   ```bash
   cd agnes-next
   npx prisma migrate dev
   npx prisma generate
   ```

2. **Set Environment Variables** in `.env.local`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...  # Get this from Stripe Dashboard → Webhooks → Your endpoint → Signing secret
   STRIPE_PRICE_ID_BOOK=price_...
   NEXT_PUBLIC_SITE_URL=https://agnes-dev.ngrok-free.app
   ```

3. **Create Webhook Endpoint in Stripe Dashboard**:
   - Go to: https://dashboard.stripe.com/test/webhooks
   - Click "Add endpoint"
   - URL: `https://agnes-dev.ngrok-free.app/api/stripe/webhook`
   - Events to send: `checkout.session.completed`
   - Copy the "Signing secret" (starts with `whsec_`) to `STRIPE_WEBHOOK_SECRET`

4. **Restart Dev Server** after running migrations:
   ```bash
   npm run dev
   ```

## Testing the Webhook

1. **Run a test checkout** from `/contest` page
2. **Check server logs** for webhook activity:
   ```
   [webhook] Event received { type: 'checkout.session.completed', id: 'evt_...' }
   [webhook] Processing checkout.session.completed { sessionId: 'cs_test_...', ... }
   [webhook] ✅ Checkout processed successfully { customerId: '...', orderId: '...', pointsAwarded: 500 }
   ```

3. **Verify Database**:
   - Check `Customer` table for new customer record
   - Check `Order` table for new order with `pointsAwarded = true`
   - Check `User` table - `points` should be incremented by 500
   - Check `Ledger` table for `PURCHASE_BOOK` entry

4. **Test Score Endpoint**:
   ```
   GET /api/contest/score?session_id=cs_test_...
   ```
   Should return:
   ```json
   {
     "totalPoints": 750,
     "basePoints": 250,
     "purchasePoints": 500,
     "referralPoints": 0
   }
   ```

## Common Issues

### Error: "Cannot read properties of undefined (reading 'findUnique')"
**Solution**: Run `npx prisma generate` and restart the dev server. The Prisma client needs to be regenerated after adding new models.

### Error: "Order model not found"
**Solution**: 
1. Run `npx prisma migrate dev` to apply migrations
2. Run `npx prisma generate` to regenerate client
3. Restart dev server

### Webhook not receiving events
**Check**:
1. Webhook URL is correct and publicly accessible (ngrok is running)
2. `STRIPE_WEBHOOK_SECRET` matches the signing secret from Stripe dashboard
3. Webhook endpoint is enabled in Stripe dashboard
4. Check Stripe dashboard → Webhooks → Your endpoint → Recent events for delivery status

### Score endpoint returns "Order not found"
**Possible causes**:
1. Webhook hasn't processed yet (check logs)
2. Webhook failed silently (check Stripe dashboard for failed deliveries)
3. Session ID mismatch (verify the session_id in URL matches Stripe)

## Debugging

### Check if webhook is being hit:
Look for these log messages:
- `[webhook] Event received`
- `[webhook] Processing checkout.session.completed`
- `[webhook] ✅ Checkout processed successfully`

### Check Prisma client:
```bash
# In dev server console or API route
console.log('Prisma models:', {
  hasUser: !!prisma.user,
  hasOrder: !!prisma.order,
  hasCustomer: !!prisma.customer,
});
```

### Verify database tables exist:
```bash
npx prisma studio
# Or check via SQLite:
sqlite3 prisma/dev.db ".tables"
```

## Success Criteria

After a successful test checkout:
- ✅ Webhook logs show successful processing
- ✅ `Customer` table has new record with email and shipping address
- ✅ `Order` table has new record with `stripeSessionId` and `pointsAwarded = true`
- ✅ `User.points` increased by 500
- ✅ `/api/contest/score?session_id=...` returns breakdown
- ✅ `/contest/score` page shows breakdown without errors

