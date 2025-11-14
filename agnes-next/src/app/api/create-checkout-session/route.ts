import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { normalizeEmail } from '@/lib/email';
import { ensureAssociateMinimal } from '@/lib/associate';

const secretKey = process.env.STRIPE_SECRET_KEY;
const defaultPriceId = process.env.STRIPE_PRICE_ID_BOOK || '';
const siteEnv = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
const fallbackUnitAmount = Number(process.env.STRIPE_UNIT_AMOUNT_BOOK || '2600');
const fallbackCurrency = (process.env.STRIPE_CURRENCY || 'usd').toLowerCase();
const fallbackProductName = process.env.STRIPE_PRODUCT_NAME || 'The Agnes Protocol';

const stripe = secretKey
  ? new Stripe(secretKey, { apiVersion: '2024-06-20' })
  : null;

export async function POST(req: NextRequest) {
  try {
    if (!secretKey || !stripe) {
      console.error('stripe env missing', { hasSecret: !!secretKey });
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
    };

    const headerEmail = req.headers.get('x-user-email');
    if (!headerEmail) {
      return NextResponse.json({ error: 'missing_user_email' }, { status: 400 });
    }

    const email = normalizeEmail(headerEmail);
    await ensureAssociateMinimal(email);

    const priceId = body?.priceId || defaultPriceId;
    const quantity = Number.isFinite(body?.qty) && Number(body?.qty) > 0 ? Number(body.qty) : 1;

    const baseUrl = siteEnv || `${req.nextUrl.protocol}//${req.nextUrl.host}`;

    const successUrl = `${baseUrl}/contest/ascension?purchase=success`;
    const cancelUrl = `${baseUrl}/contest`;

    const source = typeof body?.source === 'string' && body.source.trim().length > 0
      ? body.source.trim()
      : 'contest';

    const metadata: Record<string, string> = {
      action: 'buy_book',
      source,
      contest_email: email,
    };

    if (body?.metadata && typeof body.metadata === 'object') {
      for (const [key, value] of Object.entries(body.metadata)) {
        if (typeof value === 'string') {
          metadata[key] = value;
        }
      }
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

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      allow_promotion_codes: true,
      automatic_payment_methods: { enabled: false },
      payment_method_types: ['card'],
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('checkout session error', err);
    return NextResponse.json({ error: 'Unable to create checkout session.' }, { status: 500 });
  }
}