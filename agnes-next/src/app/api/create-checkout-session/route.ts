/**
 * Checkout session creation - proxies to deepquill backend
 * 
 * This route forwards checkout requests to deepquill, which handles
 * all Stripe operations. agnes-next does not maintain Stripe SDK or secrets.
 */

import { NextRequest, NextResponse } from 'next/server';
import { normalizeEmail } from '@/lib/email';
import { getEntryVariant, logEntryVariant } from '@/lib/entryVariant';
import { proxyJson } from '@/lib/deepquillProxy';
import { getSiteUrl } from '@/lib/getSiteUrl';

// Helper to build absolute URLs for Stripe redirects (Stripe requires absolute URLs)
// GUARDRAIL: Use request origin, not env vars (prevents stale ngrok URLs)
function buildAbsoluteUrl(req: NextRequest, path: string): string {
  // Priority 1: Use request origin (most reliable, works with ngrok swaps)
  const origin = req.headers.get('origin') || 
                 req.headers.get('x-forwarded-host') ? 
                   `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('x-forwarded-host')}` :
                   null;
  
  if (origin) {
    const url = `${origin.replace(/\/+$/, '')}${path}`;
    console.log('[create-checkout-session] Using request origin:', url);
    return url;
  }
  
  // Priority 2: Fallback to env var (only if origin unavailable)
  const siteUrl = getSiteUrl();
  const url = `${siteUrl.replace(/\/+$/, '')}${path}`;
  console.warn('[create-checkout-session] Using env var fallback (origin unavailable):', url);
  return url;
}

export async function POST(req: NextRequest) {
  try {
    console.log('[create-checkout-session] Request received (proxying to deepquill)');
    
    const body = (await req.json().catch(() => ({}))) as {
      priceId?: string;
      product?: 'paperback' | 'ebook' | 'audio_preorder';
      qty?: number;
      metadata?: Record<string, string> | null;
      source?: string;
      successPath?: string;
      cancelPath?: string;
      referralCode?: string;
      ref?: string;
      src?: string;
      v?: string;
      origin?: string;
      email?: string;
      contestPlayerId?: string;
    };

    // [PRINCIPAL] Resolve canonical principal identity
    // Priority: userId cookie > email cookie > header email
    const cookieHeader = req.headers.get('cookie') || '';
    const userIdMatch = cookieHeader.match(/contest_user_id=([^;]+)/);
    const userCodeMatch = cookieHeader.match(/contest_user_code=([^;]+)/);
    const contestEmailMatch = cookieHeader.match(/contest_email=([^;]+)/);
    const userEmailMatch = cookieHeader.match(/user_email=([^;]+)/);
    const textafriendDiscountMatch = cookieHeader.match(/(?:^|;\s*)textafriend_discount=([^;]+)/);
    
    const userIdCookie = userIdMatch?.[1] ? decodeURIComponent(userIdMatch[1]) : null;
    const userCodeCookie = userCodeMatch?.[1] ? decodeURIComponent(userCodeMatch[1]) : null;
    const cookieEmail = contestEmailMatch?.[1] || userEmailMatch?.[1];
    
    let email: string | null = null;
    let userId: string | null = userIdCookie;
    let userCode: string | null = userCodeCookie;
    
    // Resolve email
    const headerEmail = req.headers.get('x-user-email');
    if (headerEmail) {
      email = normalizeEmail(headerEmail);
    } else if (cookieEmail) {
      try {
        email = normalizeEmail(decodeURIComponent(cookieEmail));
      } catch (err) {
        console.warn('[PRINCIPAL] Failed to decode cookie email', err);
      }
    }
    
    // Resolve principal via deepquill (canonical DB)
    if (userId && !email) {
      try {
        const { data } = await proxyJson('/api/associate/status', req, { method: 'GET' });
        if (data?.ok && data?.email) {
          email = data.email;
          if (!userCode && data?.code) userCode = data.code;
        }
      } catch (err) {
        console.warn('[PRINCIPAL] Failed to resolve email from deepquill', { userId, error: err });
      }
    }
    if (email && !userId) {
      try {
        const path = `/api/associate/status?email=${encodeURIComponent(email)}`;
        const { data } = await proxyJson(path, req, { method: 'GET' });
        if (data?.ok && data?.id) {
          userId = data.id;
          if (!userCode && data?.code) userCode = data.code;
        }
      } catch (err) {
        console.warn('[PRINCIPAL] Failed to resolve userId from deepquill', { email, error: err });
      }
    }
    
    // [PRINCIPAL] Log canonical identity resolution
    console.log('[PRINCIPAL] Principal resolved for checkout', {
      userId: userId || 'MISSING',
      email: email || 'MISSING',
      code: userCode || 'MISSING',
      method: userIdCookie ? 'cookie_userId' : email ? 'email_fallback' : 'none',
      hasUserIdCookie: !!userIdCookie,
      hasEmailCookie: !!cookieEmail,
    });
    
    if (!userId && email) {
      console.warn('[PRINCIPAL] MISMATCH - userId missing but email present', { email });
    }

    // Use provided paths or fall back to defaults
    const successPath = body?.successPath || '/contest/score';
    const cancelPath = body?.cancelPath || '/contest';
    
    // Build absolute URLs for Stripe (Stripe requires absolute URLs)
    // GUARDRAIL: Use request origin, not env vars (prevents stale ngrok URLs)
    const normalizedSuccessPath = successPath.startsWith('/') ? successPath : `/${successPath}`;
    const normalizedCancelPath = cancelPath.startsWith('/') ? cancelPath : `/${cancelPath}`;
    const successUrl = buildAbsoluteUrl(req, `${normalizedSuccessPath}?session_id={CHECKOUT_SESSION_ID}`);
    const cancelUrl = buildAbsoluteUrl(req, normalizedCancelPath);

    // Part G2: Enforce explicit product - no defaults
    const product = body?.product;
    if (!product || typeof product !== 'string') {
      console.error('[CHECKOUT] ❌ Missing product identifier', {
        userId: userId || 'unknown',
        email: email || body?.email || 'unknown',
        product: product || 'missing',
        bodyKeys: Object.keys(body || {}),
      });
      return NextResponse.json(
        { error: 'Missing product identifier. Product must be explicitly specified.' },
        { status: 400 }
      );
    }
    
    // Validate product is one of the allowed values
    const validProducts = ['paperback', 'ebook', 'audio_preorder'];
    if (!validProducts.includes(product)) {
      console.error('[CHECKOUT] ❌ Invalid product identifier', {
        product,
        validProducts,
      });
      return NextResponse.json(
        { error: `Invalid product: ${product}. Must be one of: ${validProducts.join(', ')}` },
        { status: 400 }
      );
    }

    // Determine origin from request (for deepquill to use)
    // GUARDRAIL: Always pass origin so deepquill doesn't use stale env vars
    const requestOrigin = req.headers.get('origin') || 
                         (req.headers.get('x-forwarded-host') ? 
                           `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('x-forwarded-host')}` :
                           null) ||
                         getSiteUrl(); // Fallback to env var if headers unavailable

    // Prepare request body for deepquill
    // Root Cause A Fix: ref query param must always override cookie
    // Priority: query param > cookie > body
    const refFromQuery = req.nextUrl.searchParams.get('ref') || req.nextUrl.searchParams.get('referralCode');
    const refCookie = req.cookies.get('ap_ref')?.value || req.cookies.get('ref')?.value;
    const refFromBody = body?.ref || body?.referralCode || body?.metadata?.referralCode;
    
    // Determine active ref with correct precedence
    const refRaw = refFromQuery || refCookie || refFromBody;
    const ref = refRaw && refRaw.trim() && refRaw.trim() !== '...' ? refRaw.trim() : undefined;

    const textafriendDiscountRaw = textafriendDiscountMatch?.[1]
      ? decodeURIComponent(textafriendDiscountMatch[1].trim())
      : '';
    const textafriendDiscount = textafriendDiscountRaw === '15';
    
    // Root Cause A Fix: If query param ref is present, update cookie to match (override stale cookie)
    // Note: We can't set cookies in API routes directly, but we can log and ensure query param wins
    if (refFromQuery && refFromQuery.trim() && refFromQuery.trim() !== '...') {
      const activeRef = refFromQuery.trim();
      console.log('[create-checkout-session] Referral code from query param (overrides cookie)', {
        ref: activeRef,
        source: 'query',
        previousCookie: refCookie || 'none',
        note: 'Query param ref always wins - cookie will be updated by middleware on next request',
      });
    }
    
    if (ref) {
      const source = refFromQuery ? 'query' : (refCookie ? 'cookie' : 'body');
      console.log('[create-checkout-session] Referral code resolved', {
        ref,
        source,
        refFromQuery: refFromQuery || 'none',
        cookieValue: refCookie || 'none',
        refFromBody: refFromBody || 'none',
      });
    }
    
    const proxyBody = {
      product,
      qty: body?.qty || 1,
      ref, // Only send valid codes, not placeholders
      textafriendDiscount,
      src: body?.src || body?.metadata?.src,
      v: body?.v || body?.metadata?.v,
      origin: body?.origin || body?.metadata?.origin || requestOrigin, // Always pass origin
      email: body?.email || email || undefined,
      metadata: {
        ...body?.metadata,
        action: 'buy_book',
        source: body?.source || 'contest',
        contest_email: email || 'unknown',
        contest_user_id: userId || body?.contestPlayerId || undefined, // Always pass canonical userId
        contest_user_code: userCode || undefined, // Always pass canonical code
        contestPlayerId: userId || body?.contestPlayerId || undefined, // Backward compatibility
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    };

    // ✅ Proxy to deepquill backend
    let upstreamStatus: number | null = null;
    let data: any = null;
    
    try {
      const proxyResult = await proxyJson('/api/create-checkout-session', req, {
        method: 'POST',
        body: JSON.stringify(proxyBody),
      });
      
      upstreamStatus = proxyResult.status;
      data = proxyResult.data;
      
      // ✅ Handle non-2xx responses from deepquill
      if (upstreamStatus < 200 || upstreamStatus >= 300 || !data?.url) {
        console.error('[create-checkout-session] Deepquill proxy failed', { 
          upstreamStatus, 
          data,
          hasUrl: !!data?.url,
        });
        return NextResponse.json(
          { 
            ok: false,
            error: data?.error || 'Failed to create checkout session',
            upstreamStatus,
          },
          { status: upstreamStatus >= 400 && upstreamStatus < 600 ? upstreamStatus : 500 }
        );
      }
    } catch (proxyErr: any) {
      // ✅ Handle proxy errors (network failures, etc.)
      console.error('[create-checkout-session] Proxy error', {
        error: proxyErr?.message,
        stack: proxyErr?.stack,
        upstreamStatus,
      });
      return NextResponse.json(
        { 
          ok: false,
          error: proxyErr?.message || 'Failed to connect to checkout service',
          upstreamStatus: upstreamStatus || null,
        },
        { status: upstreamStatus && upstreamStatus >= 400 && upstreamStatus < 600 ? upstreamStatus : 500 }
      );
    }

    // Root Cause A Fix: If query param ref was present, set cookie on response
    // (Middleware handles this for page routes, but API routes need explicit cookie setting)
    const response = NextResponse.json({ url: data.url });
    if (refFromQuery && refFromQuery.trim() && refFromQuery.trim() !== '...') {
      const activeRef = refFromQuery.trim();
      const cookieOptions = {
        maxAge: 60 * 60 * 24 * 365, // 1 year
        path: '/',
        sameSite: 'lax' as const,
        secure: req.nextUrl.protocol === 'https:',
      };
      response.cookies.set('ap_ref', activeRef, cookieOptions);
      response.cookies.set('ref', activeRef, cookieOptions);
      console.log('[create-checkout-session] Set referral cookie from query param', {
        ref: activeRef,
        previousCookie: refCookie || 'none',
        note: 'Query param ref always wins (prevents stale referral context)',
      });
    }

    // Log entry variant for analytics
    const variant = getEntryVariant(req);
    logEntryVariant('checkout_initiated', variant, {
      sessionId: data.sessionId || null,
      referralCode: proxyBody.ref || null,
      customerEmail: proxyBody.email || null,
    });

    return response;
  } catch (err: any) {
    // ✅ Catch-all error handler (for any unexpected errors)
    console.error('[create-checkout-session] Unexpected error', {
      error: err?.message,
      stack: err?.stack,
    });
    
    const message =
      typeof err?.message === 'string'
        ? err.message
        : 'Unknown error creating checkout session';

    return NextResponse.json(
      { 
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
