import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

/**
 * POST /api/checkout/start
 * Simplified checkout endpoint that handles qty, successPath, cancelPath format
 * and creates Stripe checkout sessions directly
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      code,
      email,
      source = 'unknown',
      priceId,
      qty = 1,
      successPath = '/contest/thank-you',
      cancelPath = '/contest',
    } = body;

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return NextResponse.json(
        { error: 'Stripe configuration missing on server' },
        { status: 500 }
      );
    }

    // Runtime safety: prevent live keys in development
    if (process.env.NODE_ENV !== 'production' && !stripeSecretKey.startsWith('sk_test_')) {
      return NextResponse.json(
        { error: 'Stripe in live mode during dev. Use test keys (sk_test_...) in development.' },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-06-20',
    });

    // Get origin from env or request
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ||
      req.headers.get('origin') ||
      'http://localhost:3002';

    const successUrl = `${origin}${successPath}?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}${cancelPath}`;

    // Build line items
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    if (priceId) {
      lineItems.push({
        price: priceId,
        quantity: qty,
      });
    } else {
      // Fallback to inline price data
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'The Agnes Protocol (Paperback)',
          },
          unit_amount: 2600, // $26.00
        },
        quantity: qty,
      });
    }

    // Build metadata
    const metadata: Record<string, string> = {
      source,
    };
    if (code) {
      metadata.ref_code = code;
    }
    if (email) {
      metadata.email = email;
    }

    // Handle promotion codes if code is provided
    const discounts: Stripe.Checkout.SessionCreateParams.Discount[] = [];
    if (code) {
      try {
        // Try to find existing promotion code
        const promoList = await stripe.promotionCodes.list({
          code: code,
          limit: 1,
        });

        if (promoList.data.length > 0) {
          discounts.push({
            promotion_code: promoList.data[0].id,
          });
        } else {
          // Try to find or create coupon
          let coupon: Stripe.Coupon | null = null;
          try {
            const couponList = await stripe.coupons.list({ code: code, limit: 1 });
            if (couponList.data.length > 0) {
              coupon = couponList.data[0];
            } else {
              // Create new coupon (15% off, once)
              coupon = await stripe.coupons.create({
                id: code,
                percent_off: 15,
                duration: 'once',
              });
            }

            // Create promotion code from coupon
            const promo = await stripe.promotionCodes.create({
              coupon: coupon.id,
              code: code,
            });
            discounts.push({
              promotion_code: promo.id,
            });
          } catch (couponErr) {
            // Best-effort: continue without discount if coupon creation fails
            console.error('[checkout/start] Failed to create coupon:', couponErr);
          }
        }
      } catch (promoErr) {
        // Best-effort: continue without discount
        console.error('[checkout/start] Failed to handle promotion code:', promoErr);
      }
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
      discounts: discounts.length > 0 ? discounts : undefined,
      allow_promotion_codes: true,
      locale: 'en',
    });

    return NextResponse.json({ url: session.url, id: session.id });
  } catch (err: any) {
    console.error('[checkout/start] Error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}

