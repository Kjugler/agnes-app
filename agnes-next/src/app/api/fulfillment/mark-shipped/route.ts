// agnes-next/src/app/api/fulfillment/mark-shipped/route.ts
// Proxies to deepquill fulfillment mark-shipped endpoint

import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, purchaseId, fulfillmentUserId, carrier, trackingNumber, notes } = body;

    // Use purchaseId if provided, otherwise orderId (for backward compatibility)
    const actualPurchaseId = purchaseId || orderId;

    if (!actualPurchaseId || !fulfillmentUserId) {
      return NextResponse.json(
        { error: 'purchaseId (or orderId) and fulfillmentUserId are required' },
        { status: 400 }
      );
    }

    // Proxy to deepquill fulfillment mark-shipped endpoint
    const { data, status } = await proxyJson('/api/admin/fulfillment/mark-shipped', request, {
      method: 'POST',
      body: {
        purchaseId: actualPurchaseId,
        fulfillmentUserId,
        carrier: carrier || null,
        trackingNumber: trackingNumber || null,
        notes: notes || null,
      },
    });

    if (status !== 200) {
      return NextResponse.json(
        { error: data?.error || 'Failed to mark purchase as shipped' },
        { status }
      );
    }

    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    console.error('[fulfillment/mark-shipped] Error:', error);
    return NextResponse.json(
      { error: 'Failed to mark purchase as shipped' },
      { status: 500 }
    );
  }
}

