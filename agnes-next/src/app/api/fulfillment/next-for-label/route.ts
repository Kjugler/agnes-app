// agnes-next/src/app/api/fulfillment/next-for-label/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    // Find the oldest order where status = "pending" and labelPrintedAt IS NULL
    const order = await prisma.order.findFirst({
      where: {
        status: 'pending',
        labelPrintedAt: null,
      },
      orderBy: {
        createdAt: 'asc',
      },
      include: {
        customer: true,
      },
    });

    if (!order) {
      return NextResponse.json({ order: null });
    }

    return NextResponse.json({
      id: order.id,
      createdAt: order.createdAt.toISOString(),
      shippingName: order.shippingName,
      shippingAddressLine1: order.shippingAddressLine1,
      shippingAddressLine2: order.shippingAddressLine2,
      shippingCity: order.shippingCity,
      shippingState: order.shippingState,
      shippingPostalCode: order.shippingPostalCode,
      shippingCountry: order.shippingCountry,
      shippingPhone: order.shippingPhone,
    });
  } catch (error) {
    console.error('[fulfillment/next-for-label] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch next order for label' },
      { status: 500 }
    );
  }
}

