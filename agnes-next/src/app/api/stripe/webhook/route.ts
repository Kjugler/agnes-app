/**
 * Stripe webhook handler - proxies to deepquill backend
 * 
 * CRITICAL: This route MUST preserve the exact raw request body bytes that Stripe sent.
 * Stripe webhook signature verification will fail if the body is parsed, re-stringified,
 * or otherwise modified before verification.
 * 
 * This route forwards webhook events to deepquill, which handles
 * all Stripe webhook processing. agnes-next does not maintain Stripe SDK or secrets.
 * 
 * NOTE: deepquill must implement /api/stripe/webhook endpoint to receive these events.
 */

import { NextRequest, NextResponse } from 'next/server';
import { proxyRaw } from '@/lib/deepquillProxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const timestamp = new Date().toISOString();
  
  try {
    // Log webhook receipt (but not body content)
    const stripeSignature = req.headers.get('stripe-signature');
    const contentType = req.headers.get('content-type');
    const contentLength = req.headers.get('content-length');
    
    console.log('[stripe-webhook] Webhook received (proxying to deepquill)', {
      timestamp,
      hasStripeSignature: !!stripeSignature,
      contentType,
      contentLength,
      method: req.method,
    });

    // Read raw body as ArrayBuffer to preserve EXACT bytes (no string conversion)
    // CRITICAL: Must use arrayBuffer() not text() to avoid any encoding/decoding
    const ab = await req.arrayBuffer();
    const body = Buffer.from(ab);
    
    console.log('[stripe-webhook] Read raw body', {
      arrayBufferLength: ab.byteLength,
      bufferLength: body.length,
    });

    // Proxy raw Buffer to deepquill (preserves exact bytes for signature verification)
    const { data, status } = await proxyRaw('/api/stripe/webhook', req, { body });

    if (status >= 200 && status < 300) {
      console.log('[stripe-webhook] Webhook proxied successfully', {
        status,
        eventType: data?.type || 'unknown',
      });
      return NextResponse.json(data || { received: true }, { status });
    }

    console.error('[stripe-webhook] Deepquill proxy failed', { 
      status, 
      error: data?.error,
      eventType: data?.type,
    });
    return NextResponse.json(
      { error: data?.error || 'Webhook processing failed' },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  } catch (err: any) {
    console.error('[stripe-webhook] Error proxying to deepquill', {
      error: err?.message,
      stack: err?.stack,
      timestamp,
    });

    return NextResponse.json(
      { error: 'Webhook processing error' },
      { status: 500 }
    );
  }
}
