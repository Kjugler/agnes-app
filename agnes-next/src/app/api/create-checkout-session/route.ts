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

    // Read referral code from cookie
    const cookieStore = cookies();
    const refCode = cookieStore.get('ref')?.value || null;

    const successUrl = `${origin}/contest/score?sid={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/checkout/cancel`;

    // Include referral code in metadata if present
    const metadata: Record<string, string> = {};
    if (refCode) {
      metadata.ref = refCode;
    }

    const bodyEncoded = serializeCheckoutPayload({
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: lineItems,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    });

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": "2024-06-20",
      },
      body: bodyEncoded,
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