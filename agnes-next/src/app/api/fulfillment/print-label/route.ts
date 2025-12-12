// agnes-next/src/app/api/fulfillment/print-label/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, fulfillmentUserId } = body;

    if (!orderId || !fulfillmentUserId) {
      return NextResponse.json(
        { error: 'orderId and fulfillmentUserId are required' },
        { status: 400 }
      );
    }

    // Find the order
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Validate that order is not already shipped
    if (order.shippedAt) {
      return NextResponse.json(
        { error: 'Order has already been shipped' },
        { status: 400 }
      );
    }

    // Update order: mark label as printed
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        labelPrintedAt: new Date(),
        labelPrintedById: fulfillmentUserId,
        status: 'label_printed',
      },
    });

    return NextResponse.json({
      success: true,
      order: {
        id: updatedOrder.id,
        shippingName: updatedOrder.shippingName || '',
        addressLine1: updatedOrder.shippingAddressLine1 || '',
        addressLine2: updatedOrder.shippingAddressLine2,
        city: updatedOrder.shippingCity || '',
        state: updatedOrder.shippingState || '',
        postalCode: updatedOrder.shippingPostalCode || '',
        country: updatedOrder.shippingCountry || '',
      },
    });
  } catch (error) {
    console.error('[fulfillment/print-label] Error:', error);
    return NextResponse.json(
      { error: 'Failed to mark label as printed' },
      { status: 500 }
    );
  }
}

