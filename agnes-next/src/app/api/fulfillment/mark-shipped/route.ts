// agnes-next/src/app/api/fulfillment/mark-shipped/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendShippingConfirmationEmail } from '@/lib/email/shippingConfirmation';

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

    // Find the order with customer info
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Update order: mark as shipped
    await prisma.order.update({
      where: { id: orderId },
      data: {
        shippedAt: new Date(),
        shippedById: fulfillmentUserId,
        status: 'shipped',
      },
    });

    // Send shipping confirmation email
    const customerEmail = order.customer.email;
    const shippingName =
      order.shippingName || order.customer.name || 'there';

    await sendShippingConfirmationEmail({
      toEmail: customerEmail,
      shippingName,
      orderId: order.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[fulfillment/mark-shipped] Error:', error);
    return NextResponse.json(
      { error: 'Failed to mark order as shipped' },
      { status: 500 }
    );
  }
}

