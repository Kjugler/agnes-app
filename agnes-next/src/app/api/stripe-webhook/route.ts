/**
 * Stripe webhook handler (legacy route) - proxies to deepquill backend
 * 
 * This route forwards webhook events to deepquill, which handles
 * all Stripe webhook processing. agnes-next does not maintain Stripe SDK or secrets.
 * 
 * NOTE: deepquill must implement /api/stripe/webhook endpoint to receive these events.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { proxyRaw } from '@/lib/deepquillProxy';

export async function POST(req: NextRequest) {
  try {
    console.log('[stripe-webhook] Webhook received (proxying to deepquill)');

    // Proxy raw body to deepquill (preserves exact bytes for signature verification)
    const { data, status } = await proxyRaw('/api/stripe/webhook', req);

    if (status >= 200 && status < 300) {
      return NextResponse.json(data || { received: true }, { status });
    }

    console.error('[stripe-webhook] Deepquill proxy failed', { status, data });
    return NextResponse.json(
      { error: data?.error || 'Webhook processing failed' },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  } catch (err: any) {
    console.error('[stripe-webhook] Error proxying to deepquill', {
      error: err?.message,
      stack: err?.stack,
    });

    return NextResponse.json(
      { error: 'Webhook processing error' },
      { status: 500 }
    );
  }
}
