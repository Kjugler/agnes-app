import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { normalizeEmail } from '@/lib/email';
import { ensureAssociateMinimal } from '@/lib/associate';

// SITE_URL:
// In dev, set NEXT_PUBLIC_SITE_URL to your public ngrok URL so Stripe can redirect back:
//   NEXT_PUBLIC_SITE_URL=https://agnes-dev.ngrok-free.app
// In production, set it to your real domain.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  'https://agnes-dev.ngrok-free.app'; // safe default for dev

// Log SITE_URL on module load to help debug
console.log('[create-checkout-session] SITE_URL configured:', {
  fromEnv: !!process.env.NEXT_PUBLIC_SITE_URL,
  value: SITE_URL,
  envValue: process.env.NEXT_PUBLIC_SITE_URL,
});

// Helper to build absolute URLs for Stripe redirects (Stripe requires absolute URLs)
function withBase(path: string): string {
  const url = `${SITE_URL.replace(/\/+$/, '')}${path}`;
  console.log('[create-checkout-session] Building URL with withBase:', { path, url, SITE_URL });
  return url;
}

const secretKey = process.env.STRIPE_SECRET_KEY;
const defaultPriceId = process.env.STRIPE_PRICE_ID_BOOK || '';
const fallbackUnitAmount = Number(process.env.STRIPE_UNIT_AMOUNT_BOOK || '2600');
const fallbackCurrency = (process.env.STRIPE_CURRENCY || 'usd').toLowerCase();
const fallbackProductName = process.env.STRIPE_PRODUCT_NAME || 'The Agnes Protocol';

const stripe = secretKey
  ? new Stripe(secretKey, { apiVersion: '2024-06-20' as any })
  : null;

export async function POST(req: NextRequest) {
  try {
    console.log('[create-checkout-session] Request received');
    
    if (!secretKey || !stripe) {
      console.error('[create-checkout-session] Stripe env missing', { hasSecret: !!secretKey });
      return NextResponse.json(
        { error: 'Stripe env missing (check STRIPE_SECRET_KEY)' },
        { status: 500 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      priceId?: string;
      qty?: number;
      metadata?: Record<string, string> | null;
      source?: string;
      successPath?: string;
      cancelPath?: string;
      referralCode?: string;
      email?: string;
      contestPlayerId?: string;
    };

    console.log('[create-checkout-session] Request body', {
      qty: body?.qty,
      source: body?.source,
      hasMetadata: !!body?.metadata,
      successPath: body?.successPath,
      cancelPath: body?.cancelPath,
    });

    const headerEmail = req.headers.get('x-user-email');
    if (!headerEmail) {
      console.warn('[create-checkout-session] No x-user-email header; proceeding with fallback');
      // Don't block checkout, but log it
    }
    
    const email = headerEmail ? normalizeEmail(headerEmail) : null;
    console.log('[create-checkout-session] Email from header', { email, headerEmail });
    
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
          stack: associateErr?.stack,
        });
        // Don't block checkout - continue with fallback
      }
    }

    const priceId = body?.priceId || defaultPriceId;
    const quantity = Number.isFinite(body?.qty) && Number(body?.qty) > 0 ? Number(body.qty) : 1;

    // Use provided paths or fall back to defaults
    // Default success path is /contest/score per spec
    const successPath = body?.successPath || '/contest/score';
    const cancelPath = body?.cancelPath || '/contest';
    
    // Ensure paths are relative (no leading slash needed, but handle it)
    const normalizedSuccessPath = successPath.startsWith('/') ? successPath : `/${successPath}`;
    const normalizedCancelPath = cancelPath.startsWith('/') ? cancelPath : `/${cancelPath}`;
    
    // Build absolute URLs for Stripe (Stripe requires absolute URLs)
    // Include session_id in success URL so we can verify the payment
    const successUrl = withBase(`${normalizedSuccessPath}?session_id={CHECKOUT_SESSION_ID}`);
    const cancelUrl = withBase(normalizedCancelPath);

    const source = typeof body?.source === 'string' && body.source.trim().length > 0
      ? body.source.trim()
      : 'contest';

    const metadata: Record<string, string> = {
      action: 'buy_book',
      source,
      contest_email: email || 'unknown',
    };

    // Add contestPlayerId to metadata if provided
    if (body?.contestPlayerId && typeof body.contestPlayerId === 'string') {
      metadata.contestPlayerId = body.contestPlayerId.trim();
      console.log('[create-checkout-session] Contest player ID attached:', metadata.contestPlayerId);
    }

    if (body?.metadata && typeof body.metadata === 'object') {
      for (const [key, value] of Object.entries(body.metadata)) {
        if (typeof value === 'string') {
          metadata[key] = value;
        }
      }
    }

    // Ensure referralCode is included if present (from metadata or body)
    const referralCode =
      typeof body?.referralCode === 'string'
        ? body.referralCode.trim()
        : metadata.referralCode || undefined;

    if (referralCode) {
      metadata.referralCode = referralCode;
      console.log('[create-checkout-session] Referral code attached:', referralCode);
    }

    let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    if (priceId) {
      try {
        await stripe.prices.retrieve(priceId);
        lineItems.push({ price: priceId, quantity });
      } catch (priceErr) {
        console.warn('checkout price lookup failed, falling back to price_data', priceErr);
      }
    }

    if (lineItems.length === 0) {
      if (!Number.isFinite(fallbackUnitAmount) || fallbackUnitAmount <= 0) {
        throw new Error('Checkout configuration missing: STRIPE_PRICE_ID_BOOK or STRIPE_UNIT_AMOUNT_BOOK');
      }

      lineItems.push({
        quantity,
        price_data: {
          currency: fallbackCurrency,
          unit_amount: Math.round(fallbackUnitAmount),
          product_data: {
            name: fallbackProductName,
          },
        },
      });
    }

    console.log('[create-checkout-session] Creating Stripe session', {
      lineItemsCount: lineItems.length,
      successUrl,
      cancelUrl,
      metadata,
    });

    // Set customer_email if provided (from body or header)
    const customerEmail = body?.email || email || undefined;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      allow_promotion_codes: true,
      payment_method_types: ['card'],
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
      customer_email: customerEmail,
      shipping_address_collection: {
        allowed_countries: ['US'], // ok to expand later
      },
      phone_number_collection: { enabled: true },
    });

    console.log('[create-checkout-session] Stripe session created', {
      sessionId: session.id,
      url: session.url ? 'present' : 'missing',
    });

    if (!session.url) {
      throw new Error('Stripe session created but no checkout URL returned');
    }

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('[create-checkout-session] Error creating checkout session', {
      error: err?.message,
      stack: err?.stack,
      name: err?.name,
    });
    
    const message =
      typeof err?.message === 'string'
        ? err.message
        : 'Unknown error creating checkout session';

    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}