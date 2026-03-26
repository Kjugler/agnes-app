'use server';

import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';
import { normalizeEmail } from '@/lib/email';

/**
 * Proxy to deepquill /api/points/me (unified endpoint with rabbit state).
 * Maps response for UI compatibility: total -> points.
 */
export async function GET(req: NextRequest) {
  const headerEmail = req.headers.get('x-user-email');
  if (!headerEmail) {
    return NextResponse.json({ error: 'missing_user_email' }, { status: 400 });
  }

  const normalizedEmail = normalizeEmail(headerEmail);

  try {
    const { data, status } = await proxyJson('/api/points/me', req, {
      method: 'GET',
      headers: {
        'x-user-email': normalizedEmail,
      },
    });

    if (status !== 200) {
      return NextResponse.json(
        data?.error ? { error: data.error } : { error: 'points_service_error' },
        { status: status >= 400 && status < 600 ? status : 503 }
      );
    }

    return NextResponse.json({
      points: data.total ?? 0,
      rabbitTarget: data.rabbitTarget ?? null,
      rabbitSeq: data.rabbitSeq ?? 1,
      nextRankThreshold: data.nextRankThreshold ?? 500,
    });
  } catch (err) {
    console.error('[rabbit/state] proxy error', err);
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}
