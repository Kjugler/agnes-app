// agnes-next/src/app/api/fulfillment/user/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email } = body;

    if (!name || !email) {
      return NextResponse.json(
        { error: 'Name and email are required' },
        { status: 400 }
      );
    }

    // Upsert fulfillment user by email
    const fulfillmentUser = await prisma.fulfillmentUser.upsert({
      where: { email },
      update: {
        name,
        // email stays the same
      },
      create: {
        name,
        email,
      },
    });

    return NextResponse.json({
      id: fulfillmentUser.id,
      name: fulfillmentUser.name,
      email: fulfillmentUser.email,
    });
  } catch (error) {
    console.error('[fulfillment/user] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create/update fulfillment user' },
      { status: 500 }
    );
  }
}

