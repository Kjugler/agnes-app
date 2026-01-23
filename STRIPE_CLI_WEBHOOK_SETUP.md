# Stripe CLI Webhook Setup

## Architecture
- **ngrok** → Next.js (port 3002) - Website/social sharing
- **Stripe CLI** → deepquill (port 5055) - Webhooks

This keeps marketing/testing intact while making webhooks reliable.

## Step-by-Step Setup

### 1. Verify Stripe CLI is installed
```powershell
stripe --version
```
✅ Should show: `stripe version 1.32.0` (or similar)

### 2. Login to Stripe CLI
```powershell
stripe login
```
This opens your browser to authenticate. One-time setup.

### 3. Start webhook forwarding to deepquill
**In a NEW terminal window** (keep your servers running):

```powershell
stripe listen --forward-to http://localhost:5055/api/stripe/webhook
```

**Expected output:**
```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Copy the `whsec_...` value** - this is your webhook signing secret.

### 4. Update deepquill webhook secret

**File:** `deepquill/.env.local`

Add or update:
```env
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Important:** Only update `STRIPE_WEBHOOK_SECRET`. Do NOT change `SITE_URL`.

### 5. Restart deepquill backend
```powershell
cd C:\dev\agnes-app\deepquill
npm run start-server
```

**Expected boot log:**
```
[BOOT] Stripe webhook secret configured (whsec_xxxx...)
```

### 6. Test webhook forwarding

**In the Stripe CLI terminal**, you should see events as they happen:
```
2024-01-20 14:30:15   --> checkout.session.completed [evt_xxx]
2024-01-20 14:30:15  <--  [200] http://localhost:5055/api/stripe/webhook [evt_xxx]
```

**In deepquill terminal**, you should see:
```
[WEBHOOK] checkout.session.completed - Session details: ...
```

## Troubleshooting

### Webhook secret mismatch
If you see `[WEBHOOK] Invalid signature`:
- Make sure `STRIPE_WEBHOOK_SECRET` in `.env.local` matches the `whsec_...` from `stripe listen`
- Restart deepquill after updating the secret

### Stripe CLI not forwarding
- Make sure deepquill is running on port 5055
- Check that the endpoint path is `/api/stripe/webhook`
- Verify Stripe CLI is authenticated (`stripe login`)

### Webhook events not appearing
- Make sure `stripe listen` is running
- Check that you're using Stripe test mode (webhooks only forward test events)
- Verify the webhook endpoint is mounted in `deepquill/server/index.cjs`

## Benefits

✅ **Reliable webhooks** - Stripe CLI forwards directly to localhost
✅ **No ngrok dependency** - Webhooks work even if ngrok tunnel changes
✅ **Test mode only** - Stripe CLI only forwards test events (safe)
✅ **Easy debugging** - See webhook events in real-time in Stripe CLI terminal

## Quick Reference

**Start webhook forwarding:**
```powershell
stripe listen --forward-to http://localhost:5055/api/stripe/webhook
```

**Update webhook secret:**
1. Copy `whsec_...` from Stripe CLI output
2. Update `deepquill/.env.local`: `STRIPE_WEBHOOK_SECRET=whsec_...`
3. Restart deepquill: `npm run start-server`

**Stop webhook forwarding:**
Press `Ctrl+C` in the Stripe CLI terminal
