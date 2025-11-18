# Ngrok Setup Guide

## Quick Start

### 0. Configure Ngrok Authtoken (One-time setup)

**Important:** This is a secret token and should NOT be committed to Git. It belongs in your local ngrok config.

In PowerShell (on your dev machine):
```powershell
ngrok config add-authtoken 351jMG7Yt9fDx0jtkLSFthr5bxx_6ygKHAgbdWVV2CdUv53CP
```

Alternatively, if using ngrok.yml config file:
- File location (typical on Windows): `%USERPROFILE%\.config\ngrok\ngrok.yml` or `%USERPROFILE%\.ngrok2\ngrok.yml`
- Ensure the file contains:
```yaml
authtoken: 351jMG7Yt9fDx0jtkLSFthr5bxx_6ygKHAgbdWVV2CdUv53CP
```

**Note:** Do NOT create or edit ngrok.yml inside the repo. This is a local configuration only.

### 1. Start ngrok with reserved domain
```bash
ngrok http --url=agnes-dev.ngrok-free.app 3002
```

Copy the HTTPS forwarding URL (e.g., `https://agnes-dev.ngrok-free.app`)

### 2. Create/Update Environment Files

**`agnes-next/.env.local`** (create if it doesn't exist):
```env
NEXT_PUBLIC_SITE_URL=https://agnes-dev.ngrok-free.app
NEXT_PUBLIC_API_BASE=https://agnes-dev.ngrok-free.app
```

**`deepquill/.env`** (create if it doesn't exist):
```env
VITE_NEXT_PUBLIC_SITE_URL=https://agnes-dev.ngrok-free.app
SITE_URL=https://agnes-dev.ngrok-free.app
```

### 3. Restart Next.js
After updating `.env.local`, restart the Next.js dev server:
```bash
# In agnes-next directory
Ctrl+C
npm run dev
```

### 4. If You See Cross-Origin Warnings

Uncomment and update `agnes-next/next.config.ts`:
```typescript
experimental: {
  allowedDevOrigins: ['https://agnes-dev.ngrok-free.app'],
},
```

Then restart Next.js again.

## Testing

1. Open terminal emulator: `http://localhost:5173?ref=TESTCODE123`
2. Enter secret phrase → enter email
3. Should redirect to: `https://agnes-dev.ngrok-free.app/lightening?mockEmail=...`
4. Flow continues on ngrok domain: `/contest` → `/ascension` → `/score`

## When Ngrok URL Changes

Just update the same two `.env` files with the new URL and restart Next.js.

## What's Already Configured

✅ EmailModal uses `VITE_NEXT_PUBLIC_SITE_URL`  
✅ CheckoutWiring uses `NEXT_PUBLIC_API_BASE`  
✅ All API calls include `x-user-email` header  
✅ Identity logic is locked (no changes needed)

