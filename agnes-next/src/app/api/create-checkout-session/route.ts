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

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  'https://agnes-dev.ngrok-free.app'; // safe default for dev

// Helper to build absolute URLs for Stripe redirects (Stripe requires absolute URLs)
function withBase(path: string): string {
  const url = `${SITE_URL.replace(/\/+$/, '')}${path}`;
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
      checkoutEmail?: string; // Email from referral checkout form
      contestPlayerId?: string;
    };

    // Read referral cookies (ap_ref_*) for referral traffic
    const cookieHeader = req.headers.get('cookie') || '';
    const apRefCodeMatch = cookieHeader.match(/ap_ref_code=([^;]+)/);
    const apRefSrcMatch = cookieHeader.match(/ap_ref_src=([^;]+)/);
    const apRefVMatch = cookieHeader.match(/ap_ref_v=([^;]+)/);
    const apCheckoutEmailMatch = cookieHeader.match(/ap_checkout_email=([^;]+)/);
    
    const apRefCode = apRefCodeMatch ? decodeURIComponent(apRefCodeMatch[1]) : null;
    const apRefSrc = apRefSrcMatch ? decodeURIComponent(apRefSrcMatch[1]) : null;
    const apRefV = apRefVMatch ? decodeURIComponent(apRefVMatch[1]) : null;
    
    // Read checkoutEmail: prefer body, fallback to cookie
    const checkoutEmail = body?.checkoutEmail || (apCheckoutEmailMatch ? decodeURIComponent(apCheckoutEmailMatch[1]) : null);
    const checkoutEmailSource = body?.checkoutEmail ? 'body' : (apCheckoutEmailMatch ? 'cookie' : 'none');
    
    // Determine if this is referral traffic (has ap_ref_code cookie)
    const isReferralTraffic = !!apRefCode;
    
    // Declare contest user identifiers at top level so they're always in scope
    let contestUserId: string | null = null;
    let contestUserCode: string | null = null;
    
    // CRITICAL: Always try to get buyer's email and contestUserId, even for referral traffic
    // The referral code (ref) is for the DISCOUNT and REFERRER commission, not buyer attribution
    // Buyer attribution should use the BUYER's email/contestUserId, not the referrer's
    
    // Try to get email from multiple sources (prioritize checkoutEmail from form)
    let email: string | null = null;
    
    if (checkoutEmail) {
      email = normalizeEmail(checkoutEmail);
      console.log('[create-checkout-session] Email from checkout form', { email, checkoutEmail });
    } else {
      // Try header (X-User-Email)
      const headerEmail = req.headers.get('x-user-email');
      if (headerEmail) {
        email = normalizeEmail(headerEmail);
        console.log('[create-checkout-session] Email from header', { email, headerEmail });
      } else {
        // Try cookies (contest_email or user_email)
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
    }
    
    // CRITICAL: Always ensure associate exists if we have an email (even for referral traffic)
    // This ensures the buyer's contestUserId is set correctly for attribution
    if (email) {
      try {
        console.log('[create-checkout-session] Ensuring associate exists for buyer', { 
          email, 
          isReferralTraffic,
          refCode: apRefCode || 'none'
        });
        const associate = await ensureAssociateMinimal(email);
        contestUserId = associate.id;
        contestUserCode = associate.code || associate.referralCode || null;
        console.log('[create-checkout-session] Buyer associate ensured', { 
          id: associate.id, 
          code: associate.code,
          email: associate.email,
          contestUserId,
          contestUserCode
        });
      } catch (associateErr: any) {
        console.error('[create-checkout-session] Associate ensure failed', {
          error: associateErr?.message,
          email,
        });
        // Don't block checkout - continue with fallback
      }
    } else {
      console.log('[create-checkout-session] No email found - buyer attribution will rely on Stripe customer email', {
        isReferralTraffic,
        hasCheckoutEmail: !!checkoutEmail,
        hasHeaderEmail: !!req.headers.get('x-user-email'),
      });
    }

    // Use provided paths or fall back to defaults
    const successPath = body?.successPath || '/contest/score';
    const cancelPath = body?.cancelPath || '/contest';
    
    // Build absolute URLs for Stripe (Stripe requires absolute URLs)
    const normalizedSuccessPath = successPath.startsWith('/') ? successPath : `/${successPath}`;
    const normalizedCancelPath = cancelPath.startsWith('/') ? cancelPath : `/${cancelPath}`;
    const successUrl = withBase(`${normalizedSuccessPath}?session_id={CHECKOUT_SESSION_ID}`);
    const cancelUrl = withBase(normalizedCancelPath);

    // Default to paperback if no product specified (for "Buy the Book" buttons)
    const product = body?.product || 'paperback';
    
    console.log('[create-checkout-session] Product selection', {
      bodyProduct: body?.product,
      finalProduct: product,
      bodyKeys: Object.keys(body || {}),
    });

    // Use referral cookies if present (preferred over body params for referral traffic)
    const refCode = apRefCode || body?.ref || body?.referralCode || body?.metadata?.referralCode;
    const refSrc = apRefSrc || body?.src || body?.metadata?.src;
    const refV = apRefV || body?.v || body?.metadata?.v;
    
    // For referral traffic: don't lock email (allow user to enter their own)
    // For logged-in contest users: can prefill email
    const lockEmail = !isReferralTraffic && !!email;
    
    // Prepare request body for deepquill
    const proxyBody = {
      product,
      qty: body?.qty || 1,
      ref: refCode,
      refCode: refCode, // Explicit field for deepquill
      refSource: refSrc,
      refVariant: refV,
      src: refSrc,
      v: refV,
      origin: body?.origin || body?.metadata?.origin,
      email: lockEmail ? (body?.email || email || undefined) : undefined, // Only send email if locking
      checkoutEmail: checkoutEmail || undefined, // Email captured from referral checkout form
      lockEmail, // Flag to tell deepquill whether to lock email field
      metadata: {
        ...body?.metadata,
        action: 'buy_book',
        source: isReferralTraffic ? 'referral' : (body?.source || 'contest'),
        contest_email: email || 'unknown',
        contestPlayerId: body?.contestPlayerId,
      },
      contestUserId: contestUserId || undefined, // Primary identifier for attribution
      contestUserCode: contestUserCode || undefined, // Fallback identifier
      contestEmail: email || undefined, // For email sending only
      success_url: successUrl,
      cancel_url: cancelUrl,
    };
    
    if (isReferralTraffic) {
      console.log('[create-checkout-session] Referral traffic detected', {
        refCode,
        refSrc,
        refV,
        lockEmail,
        hasEmail: !!email,
        checkoutEmail: checkoutEmail || 'none',
        checkoutEmailSource,
      });
      console.log(`[create-checkout-session] referral checkoutEmail source: ${checkoutEmailSource}`);
    }

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
