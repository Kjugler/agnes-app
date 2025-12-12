// agnes-next/src/app/api/fulfillment/to-ship/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fulfillmentUserId = searchParams.get('fulfillmentUserId');

    if (!fulfillmentUserId) {
      return NextResponse.json(
        { error: 'fulfillmentUserId is required' },
        { status: 400 }
      );
    }

    // Find all orders where labelPrintedById = fulfillmentUserId and shippedAt IS NULL
    const orders = await prisma.order.findMany({
      where: {
        labelPrintedById: fulfillmentUserId,
        shippedAt: null,
      },
      orderBy: {
        labelPrintedAt: 'asc',
      },
    });

    return NextResponse.json(
      orders.map((order) => ({
        id: order.id,
        createdAt: order.createdAt.toISOString(),
        labelPrintedAt: order.labelPrintedAt?.toISOString() || null,
        shippingName: order.shippingName,
        shippingAddressLine1: order.shippingAddressLine1,
        shippingCity: order.shippingCity,
        shippingState: order.shippingState,
        shippingPostalCode: order.shippingPostalCode,
        shippingCountry: order.shippingCountry,
      }))
    );
  } catch (error) {
    console.error('[fulfillment/to-ship] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch orders to ship' },
      { status: 500 }
    );
  }
}

