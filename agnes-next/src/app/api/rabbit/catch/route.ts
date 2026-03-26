'use server';

import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';
import { normalizeEmail } from '@/lib/email';

/**
 * Proxy to deepquill /api/rabbit/catch.
 * No local computation or persistence - deepquill owns rabbit progression and rewards.
 */
export async function POST(req: NextRequest) {
  const headerEmail = req.headers.get('x-user-email');
  if (!headerEmail) {
    return NextResponse.json({ ok: false, caught: false, error: 'missing_user_email' }, { status: 400 });
  }

  const normalizedEmail = normalizeEmail(headerEmail);

  try {
    let body: { rabbitSeqClient?: number } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const { data, status } = await proxyJson('/api/rabbit/catch', req, {
      method: 'POST',
      body: { rabbitSeqClient: body?.rabbitSeqClient },
      headers: {
        'x-user-email': normalizedEmail,
      },
    });

    if (status >= 500) {
      return NextResponse.json(
        data?.error ? { ok: false, caught: false, error: data.error } : { ok: false, caught: false, error: 'service_error' },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: data.ok ?? true,
      caught: data.caught ?? false,
      stale: data.stale ?? false,
      points: data.points,
      rabbitTarget: data.rabbitTarget,
      rabbitSeq: data.rabbitSeq,
      nextRankThreshold: data.nextRankThreshold,
    });
  } catch (err) {
    console.error('[rabbit/catch] proxy error', err);
    return NextResponse.json({ ok: false, caught: false, error: 'service_unavailable' }, { status: 503 });
  }
}
