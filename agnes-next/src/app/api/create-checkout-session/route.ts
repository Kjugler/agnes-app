import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

type LineItem = {
  price?: string;
  quantity?: number;
  price_data?: {
    currency: string;
    unit_amount: number;
    product_data?: { name?: string; description?: string };
  };
  adjustable_quantity?: { enabled: boolean; minimum?: number; maximum?: number };
};

function encodeForm(data: Record<string, string | number | boolean>): string {
  return Object.entries(data)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

function serializeCheckoutPayload(params: {
  mode: "payment" | "subscription" | "setup";
  success_url: string;
  cancel_url: string;
  line_items: LineItem[];
  metadata?: Record<string, string>;
}): string {
  const base: Record<string, string | number | boolean> = {
    mode: params.mode,
    success_url: params.success_url,
    cancel_url: params.cancel_url,
  };

  const parts: string[] = [encodeForm(base)];

  // Add metadata if provided
  if (params.metadata) {
    Object.entries(params.metadata).forEach(([key, value]) => {
      parts.push(encodeForm({ [`metadata[${key}]`]: value }));
    });
  }

  params.line_items.forEach((item, index) => {
    if (item.price) {
      parts.push(encodeForm({ [`line_items[${index}][price]`]: item.price }));
      if (typeof item.quantity === "number") {
        parts.push(
          encodeForm({ [`line_items[${index}][quantity]`]: item.quantity })
        );
      }
    } else if (item.price_data) {
      const p = item.price_data;
      parts.push(
        encodeForm({ [`line_items[${index}][quantity]`]: item.quantity ?? 1 })
      );
      parts.push(
        encodeForm({ [`line_items[${index}][price_data][currency]`]: p.currency })
      );
      parts.push(
        encodeForm({ [`line_items[${index}][price_data][unit_amount]`]: p.unit_amount })
      );
      if (p.product_data?.name) {
        parts.push(
          encodeForm({ [`line_items[${index}][price_data][product_data][name]`]: p.product_data.name })
        );
      }
      if (p.product_data?.description) {
        parts.push(
          encodeForm({ [`line_items[${index}][price_data][product_data][description]`]: p.product_data.description })
        );
      }
    }
    if (item.adjustable_quantity) {
      const a = item.adjustable_quantity;
      parts.push(
        encodeForm({ [`line_items[${index}][adjustable_quantity][enabled]`]: a.enabled })
      );
      if (typeof a.minimum === "number") {
        parts.push(
          encodeForm({ [`line_items[${index}][adjustable_quantity][minimum]`]: a.minimum })
        );
      }
      if (typeof a.maximum === "number") {
        parts.push(
          encodeForm({ [`line_items[${index}][adjustable_quantity][maximum]`]: a.maximum })
        );
      }
    }
  });

  return parts.join("&");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const lineItems: LineItem[] = Array.isArray(body?.line_items)
      ? body.line_items
      : [];

    if (!lineItems.length) {
      return NextResponse.json(
        { error: "line_items array is required" },
        { status: 400 }
      );
    }

    const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
    if (!origin) {
      return NextResponse.json(
        { error: "Missing origin. Set NEXT_PUBLIC_SITE_URL env or send Origin header." },
        { status: 400 }
      );
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return NextResponse.json(
        { error: "Stripe configuration missing on server" },
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

    // Read referral code from body, query, or cookie
    const codeFromBody = body?.code || body?.ref || null;
    const codeFromQuery = req.nextUrl.searchParams.get('code') || req.nextUrl.searchParams.get('ref');
    const cookieStore = cookies();
    const codeFromCookie = cookieStore.get('ref')?.value || null;
    const code = codeFromBody || codeFromQuery || codeFromCookie || null;

    const successUrl = `${origin}/badge?sid={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/checkout-cancelled`;

    // Include referral code in metadata if present
    const metadata: Record<string, string> = {};
    if (code) {
      metadata.ref_code = code;
    }

    // Build discounts array if Stripe is configured and code is present
    const discounts: Array<{ promotion_code: string }> = [];
    if (stripeSecretKey && code) {
      // Try to find or create a promotion code for this associate code
      // For now, we'll use the code as-is (Stripe allows prefix matching)
      // In production, you'd look up/create the promotion code here
      try {
        // Check if promotion code exists (best-effort)
        // For now, we'll pass the code as a promotion code ID
        // Note: This assumes codes are already created in Stripe dashboard
        // or you'll create them programmatically
        const promoCheck = await fetch(`https://api.stripe.com/v1/promotion_codes?code=${encodeURIComponent(code)}&limit=1`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            'Stripe-Version': '2024-06-20',
          },
        });
        
        if (promoCheck.ok) {
          const promoData = await promoCheck.json();
          if (promoData.data && promoData.data.length > 0) {
            discounts.push({ promotion_code: promoData.data[0].id });
          } else {
            // Create promotion code on-the-fly if it doesn't exist
            // First, ensure we have a coupon (15% off, once per customer)
            const couponId = await (async () => {
              // Try to find existing coupon
              const couponCheck = await fetch(`https://api.stripe.com/v1/coupons?code=${encodeURIComponent(code)}&limit=1`, {
                method: 'GET',
                headers: {
                  Authorization: `Bearer ${stripeSecretKey}`,
                  'Stripe-Version': '2024-06-20',
                },
              });
              
              if (couponCheck.ok) {
                const couponData = await couponCheck.json();
                if (couponData.data && couponData.data.length > 0) {
                  return couponData.data[0].id;
                }
              }
              
              // Create new coupon (15% off, once)
              const couponCreate = await fetch('https://api.stripe.com/v1/coupons', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${stripeSecretKey}`,
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'Stripe-Version': '2024-06-20',
                },
                body: new URLSearchParams({
                  id: code,
                  percent_off: '15',
                  duration: 'once',
                }),
              });
              
              if (couponCreate.ok) {
                const coupon = await couponCreate.json();
                return coupon.id;
              }
              
              return null;
            })();
            
            if (couponId) {
              // Create promotion code
              const promoCreate = await fetch('https://api.stripe.com/v1/promotion_codes', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${stripeSecretKey}`,
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'Stripe-Version': '2024-06-20',
                },
                body: new URLSearchParams({
                  coupon: couponId,
                  code: code,
                }),
              });
              
              if (promoCreate.ok) {
                const promo = await promoCreate.json();
                discounts.push({ promotion_code: promo.id });
              }
            }
          }
        }
      } catch (err) {
        // Best-effort: if promotion code creation fails, continue without discount
        console.error('[checkout] Failed to handle promotion code:', err);
      }
    }

    // Build base payload
    const basePayload: Record<string, string | number | boolean> = {
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
    };

    // Add discounts if present
    if (discounts.length > 0) {
      discounts.forEach((discount, idx) => {
        basePayload[`discounts[${idx}][promotion_code]`] = discount.promotion_code;
      });
    }

    const bodyEncoded = serializeCheckoutPayload({
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: lineItems,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    });

    // Append discounts to body if present
    let finalBody = bodyEncoded;
    if (discounts.length > 0) {
      const discountParts = discounts.map((discount, idx) => 
        `discounts[${idx}][promotion_code]=${encodeURIComponent(discount.promotion_code)}`
      );
      finalBody = bodyEncoded + '&' + discountParts.join('&');
    }

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": "2024-06-20",
      },
      body: finalBody,
    });

    const session = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { error: session?.error?.message ?? "Failed to create session" },
        { status: response.status }
      );
    }

    return NextResponse.json({ id: session.id, url: session.url });
  } catch {
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}