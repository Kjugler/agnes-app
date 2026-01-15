// agnes-next/src/app/api/fulfillment/next-for-label/route.ts
// Proxies to deepquill fulfillment next-label endpoint

import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export async function GET(request: NextRequest) {
  try {
    // Proxy to deepquill fulfillment next-label endpoint
    const { data, status } = await proxyJson('/api/admin/fulfillment/next-label', request, {
      method: 'GET',
    });

    if (status !== 200) {
      return NextResponse.json(
        { error: data?.error || 'Failed to fetch next order for label' },
        { status }
      );
    }

    // Map deepquill response to match UI expectations
    if (!data.order) {
      return NextResponse.json({ order: null });
    }

    const order = data.order;
    return NextResponse.json({
      id: order.id || order.purchaseId,
      purchaseId: order.purchaseId || order.id,
      createdAt: order.createdAt,
      shippingName: order.shippingName,
      shippingAddressLine1: order.shippingAddressLine1,
      shippingAddressLine2: order.shippingAddressLine2 || null,
      shippingCity: order.shippingCity,
      shippingState: order.shippingState,
      shippingPostalCode: order.shippingPostalCode,
      shippingCountry: order.shippingCountry,
      shippingPhone: order.shippingPhone || null,
    });
  } catch (error) {
    console.error('[fulfillment/next-for-label] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch next order for label' },
      { status: 500 }
    );
  }
}

