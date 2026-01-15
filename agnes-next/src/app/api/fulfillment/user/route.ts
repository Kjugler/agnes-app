// agnes-next/src/app/api/fulfillment/user/route.ts
// Uses User model (fulfillment workers are just users)

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

    // Upsert user by email (fulfillment workers are users)
    // If user doesn't exist, create with a referral code
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        fname: name.split(' ')[0] || name,
        lname: name.split(' ').slice(1).join(' ') || null,
        firstName: name.split(' ')[0] || name,
      },
      create: {
        email,
        fname: name.split(' ')[0] || name,
        lname: name.split(' ').slice(1).join(' ') || null,
        firstName: name.split(' ')[0] || name,
        code: `FULF${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        referralCode: `FULF${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      },
    });

    return NextResponse.json({
      id: user.id,
      name: name,
      email: user.email,
    });
  } catch (error) {
    console.error('[fulfillment/user] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create/update fulfillment user' },
      { status: 500 }
    );
  }
}

