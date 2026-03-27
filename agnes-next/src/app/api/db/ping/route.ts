// Force Node runtime (Prisma needs Node)
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  // P0 guardrail: local DB ping is debug-only and must not run in production.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  const users = await prisma.user.count();
  return NextResponse.json({ ok: true, users });
}
