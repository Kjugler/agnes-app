/**
 * Checkout session creation - proxies to deepquill backend
 * 
 * This route forwards checkout requests to deepquill, which handles
 * all Stripe operations. agnes-next does not maintain Stripe SDK or secrets.
 */

import { NextRequest, NextResponse } from 'next/server';
import { normalizeEmail } from '@/lib/email';
import { ensureAssociateMinimal } from '@/lib/associate';
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

    // Read email from header first, then fall back to cookie
    const headerEmail = req.headers.get('x-user-email');
    let email: string | null = null;
    
    if (headerEmail) {
      email = normalizeEmail(headerEmail);
      console.log('[create-checkout-session] Email from header', { email, headerEmail });
    } else {
      // Fallback to cookie (source of truth for contest session)
      const cookieHeader = req.headers.get('cookie') || '';
      const contestEmailMatch = cookieHeader.match(/contest_email=([^;]+)/);
      const userEmailMatch = cookieHeader.match(/user_email=([^;]+)/);
      const cookieEmail = contestEmailMatch?.[1] || userEmailMatch?.[1];
      
      if (cookieEmail) {
        try {
          email = normalizeEmail(decodeURIComponent(cookieEmail));
          console.log('[create-checkout-session] Email from cookie', { email, cookieEmail });
        } catch (err) {
          console.warn('[create-checkout-session] Failed to decode cookie email', err);
        }
      }
    }
    
    // Ensure associate exists (local DB operation, no secrets needed)
    if (email) {
      try {
        console.log('[create-checkout-session] Ensuring associate exists for', email);
        const associate = await ensureAssociateMinimal(email);
        console.log('[create-checkout-session] Associate ensured', { 
          id: associate.id, 
          code: associate.code,
          email: associate.email 
        });
      } catch (associateErr: any) {
        console.error('[create-checkout-session] Associate ensure failed', {
          error: associateErr?.message,
        });
        // Don't block checkout - continue with fallback
      }
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

    // Default to paperback if no product specified (for "Buy the Book" buttons)
    const product = body?.product || 'paperback';

    // Determine origin from request (for deepquill to use)
    // GUARDRAIL: Always pass origin so deepquill doesn't use stale env vars
    const requestOrigin = req.headers.get('origin') || 
                         (req.headers.get('x-forwarded-host') ? 
                           `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('x-forwarded-host')}` :
                           null) ||
                         getSiteUrl(); // Fallback to env var if headers unavailable

    // Prepare request body for deepquill
    const proxyBody = {
      product,
      qty: body?.qty || 1,
      ref: body?.ref || body?.referralCode || body?.metadata?.referralCode,
      src: body?.src || body?.metadata?.src,
      v: body?.v || body?.metadata?.v,
      origin: body?.origin || body?.metadata?.origin || requestOrigin, // Always pass origin
      email: body?.email || email || undefined,
      metadata: {
        ...body?.metadata,
        action: 'buy_book',
        source: body?.source || 'contest',
        contest_email: email || 'unknown',
        contestPlayerId: body?.contestPlayerId,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    };

    // Proxy to deepquill
    const { data, status } = await proxyJson('/api/create-checkout-session', req, {
      method: 'POST',
      body: proxyBody,
    });

    if (status !== 200 || !data?.url) {
      console.error('[create-checkout-session] Deepquill proxy failed', { status, data });
      return NextResponse.json(
        { error: data?.error || 'Failed to create checkout session' },
        { status: status >= 400 && status < 600 ? status : 500 }
      );
    }

    // Log entry variant for analytics
    const variant = getEntryVariant(req);
    logEntryVariant('checkout_initiated', variant, {
      sessionId: data.sessionId || null,
      referralCode: proxyBody.ref || null,
      customerEmail: proxyBody.email || null,
    });

    return NextResponse.json({ url: data.url });
  } catch (err: any) {
    console.error('[create-checkout-session] Error proxying to deepquill', {
      error: err?.message,
      stack: err?.stack,
    });
    
    const message =
      typeof err?.message === 'string'
        ? err.message
        : 'Unknown error creating checkout session';

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
