# Ngrok URL Fix Summary

## Problem
Old ngrok URL (`simona-nonindictable-pseudoapoplectically.ngrok-free.dev`) was hardcoded in `.env` files and used for Stripe checkout redirects, causing stale URLs when ngrok tunnel changes.

## Findings

### Old ngrok URLs found in:
- `agnes-next/.env.local` - `NEXT_PUBLIC_SITE_URL`
- `deepquill/.env` - `SITE_URL`
- `deepquill/.env.local` - `SITE_URL` and `VITE_NEXT_PUBLIC_SITE_URL`

### Code paths using env vars:
- `agnes-next/src/app/api/create-checkout-session/route.ts` - Used `getSiteUrl()` (reads env vars)
- `deepquill/api/create-checkout-session.cjs` - Used `envConfig.SITE_URL` directly

## Fixes Applied

### 1. agnes-next checkout session creation
**File:** `agnes-next/src/app/api/create-checkout-session/route.ts`

**Before:**
```typescript
function withBase(path: string): string {
  const siteUrl = getSiteUrl(); // Reads from env vars
  return `${siteUrl}${path}`;
}
```

**After:**
```typescript
function buildAbsoluteUrl(req: NextRequest, path: string): string {
  // Priority 1: Use request origin (most reliable)
  const origin = req.headers.get('origin') || 
                 req.headers.get('x-forwarded-host') ? 
                   `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('x-forwarded-host')}` :
                   null;
  
  if (origin) {
    return `${origin}${path}`;
  }
  
  // Priority 2: Fallback to env var (only if origin unavailable)
  return `${getSiteUrl()}${path}`;
}
```

**Also:** Always passes `origin` to deepquill in request body.

### 2. deepquill checkout session creation
**File:** `deepquill/api/create-checkout-session.cjs`

**Before:**
```javascript
const origin = envConfig.SITE_URL; // Always uses env var
```

**After:**
```javascript
// Priority 1: Use origin from request body (passed from agnes-next)
let origin = req.body?.origin || null;

// Priority 2: Use x-forwarded-host headers (if proxied)
if (!origin) {
  const forwardedHost = req.headers['x-forwarded-host'];
  const forwardedProto = req.headers['x-forwarded-proto'] || 'https';
  if (forwardedHost) {
    origin = `${forwardedProto}://${forwardedHost}`;
  }
}

// Priority 3: Fallback to env var (only if origin unavailable)
if (!origin) {
  origin = envConfig.SITE_URL; // Fallback with warning
}
```

## Guardrails Implemented

### Rule 1: No hardcoded absolute URLs for internal routes
✅ All internal routes use relative paths (`/contest/thank-you`)

### Rule 2: Server builds absolute URLs from request
✅ Stripe checkout URLs now built from:
- Request `origin` header (primary)
- `x-forwarded-host` / `x-forwarded-proto` headers (secondary)
- Env vars (fallback only)

### Rule 3: One source of truth
✅ Request origin is the primary source
✅ Env vars are fallbacks only (with warnings)

## Benefits

1. **Automatic ngrok swap handling** - URLs update automatically when tunnel changes
2. **No stale URLs** - Request origin always reflects current tunnel
3. **Works in production** - Falls back to env vars if headers unavailable
4. **Logging** - Shows which origin source is used

## Testing

After these changes:
1. Start new ngrok tunnel
2. Create checkout session
3. Check logs for: `[CHECKOUT] Using request origin: <new-url>`
4. Verify Stripe redirect URLs use new tunnel

## Next Steps

1. Update `.env` files with new ngrok URL (optional - now fallback only)
2. Test checkout flow with new tunnel
3. Verify success URLs use request origin (check logs)
