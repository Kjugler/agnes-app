// agnes-next/src/app/api/fulfillment/to-ship/route.ts
// Proxies to deepquill fulfillment queue endpoint

import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fulfillmentUserId = searchParams.get('fulfillmentUserId');
    const limit = searchParams.get('limit') || '5';

    // Proxy to deepquill fulfillment queue endpoint
    const queueUrl = `/api/admin/fulfillment/queue?limit=${limit}`;
    const { data, status } = await proxyJson(queueUrl, request, {
      method: 'GET',
    });

    if (status !== 200) {
      return NextResponse.json(
        { error: data?.error || 'Failed to fetch orders to ship' },
        { status }
      );
    }

    // Map deepquill response to match UI expectations
    const orders = (data || []).map((order: any) => ({
      id: order.id || order.purchaseId,
      purchaseId: order.purchaseId || order.id,
      createdAt: order.createdAt,
      labelPrintedAt: order.labelPrintedAt || null,
      shippingName: order.shippingName,
      shippingAddressLine1: order.shippingAddressLine1,
      shippingCity: order.shippingCity,
      shippingState: order.shippingState,
      shippingPostalCode: order.shippingPostalCode,
      shippingCountry: order.shippingCountry,
      shippingPhone: order.shippingPhone || null,
      customerEmail: order.customerEmail || null,
    }));

    return NextResponse.json(orders);
  } catch (error) {
    console.error('[fulfillment/to-ship] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch orders to ship' },
      { status: 500 }
    );
  }
}

