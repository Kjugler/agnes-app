// agnes-next/src/app/api/fulfillment/print-label/route.ts
// Proxies to deepquill fulfillment print-label endpoint

import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, purchaseId, fulfillmentUserId } = body;

    // Use purchaseId if provided, otherwise orderId (for backward compatibility)
    const actualPurchaseId = purchaseId || orderId;

    if (!actualPurchaseId || !fulfillmentUserId) {
      return NextResponse.json(
        { error: 'purchaseId (or orderId) and fulfillmentUserId are required' },
        { status: 400 }
      );
    }

    // Proxy to deepquill fulfillment print-label endpoint
    const { data, status } = await proxyJson('/api/admin/fulfillment/print-label', request, {
      method: 'POST',
      body: {
        purchaseId: actualPurchaseId,
        fulfillmentUserId,
      },
    });

    if (status !== 200) {
      return NextResponse.json(
        { error: data?.error || 'Failed to mark label as printed' },
        { status }
      );
    }

    return NextResponse.json({
      success: true,
      order: data.order,
    });
  } catch (error) {
    console.error('[fulfillment/print-label] Error:', error);
    return NextResponse.json(
      { error: 'Failed to mark label as printed' },
      { status: 500 }
    );
  }
}

