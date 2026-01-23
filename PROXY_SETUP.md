# Proxy Setup Instructions

## INTERNAL_PROXY_SECRET Configuration

Both `agnes-next` and `deepquill` must have the same `INTERNAL_PROXY_SECRET` value in their `.env.local` files.

### Generate a Secret

Run this command to generate a secure random secret:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Example output: `46f306e5482f3316e9c2ad66654ab02f699999598b13b10d293b3b88fb916d8d`

### Add to agnes-next/.env.local

```env
INTERNAL_PROXY_SECRET="46f306e5482f3316e9c2ad66654ab02f699999598b13b10d293b3b88fb916d8d"
NEXT_PUBLIC_API_BASE_URL="http://localhost:5055"
```

### Add to deepquill/.env.local

```env
INTERNAL_PROXY_SECRET="46f306e5482f3316e9c2ad66654ab02f699999598b13b10d293b3b88fb916d8d"
DATABASE_URL="file:C:/dev/agnes-app/deepquill/dev.db"
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
SITE_URL="https://simona-nonindictable-pseudoapoplectically.ngrok-free.dev"
```

### Important Notes

- **Quotes are fine** - Use quotes around the secret value
- **Don't use NEXT_PUBLIC_** prefix - This is a server-side secret
- **Must match exactly** - Both apps must have the same value
- **Restart servers** - After adding, restart both `agnes-next` and `deepquill`

## Verification

After adding the secret and restarting:

1. **Test thank-you page flow:**
   - Browser calls: `/api/checkout/verify-session?session_id=...` (same origin)
   - agnes-next logs: `[verify-session] Verifying session via deepquill`
   - deepquill logs: `[verify-session] Verifying session`

2. **You should NOT see:**
   - Browser attempting to hit `localhost:5055` directly
   - CORS errors
   - "Proxy request failed" errors

3. **Stripe success URLs:**
   - Deepquill uses `SITE_URL` from `.env.local` for checkout redirects
   - Success URL will be: `https://simona-nonindictable-pseudoapoplectically.ngrok-free.dev/contest/thank-you?session_id={CHECKOUT_SESSION_ID}`
   - This ensures users land on the ngrok domain, not localhost

## Troubleshooting

### "Proxy request failed"
- Check that `INTERNAL_PROXY_SECRET` exists in both `.env.local` files
- Verify both values match exactly (including quotes)
- Restart both servers after adding the secret

### "Invalid proxy secret" (403)
- In production, deepquill will reject requests without valid `x-internal-proxy` header
- In development, it will warn but allow (for easier testing)
- Check that agnes-next is sending the header (it should be automatic)

### Double checkout sessions
- Fixed by `hasStartedRef` guard in `checkout/page.tsx`
- Should see only one `POST /api/create-checkout-session` per attempt
- If still seeing doubles, check React Strict Mode in `next.config.js`
