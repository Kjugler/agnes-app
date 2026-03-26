export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { normalizeEmail } from '@/lib/email';
import { proxyJson } from '@/lib/deepquillProxy';

/**
 * Normalize action name for deepquill compatibility.
 * Deepquill accepts: share_x, share_ig, share_fb, share_truth, share_tiktok,
 * share_x_back_to_score_bonus, contest_join, subscribe_digest, signup.
 */
function normalizeAction(action: string): string {
  switch (action) {
    case 'share_twitter':
    case 'share_xcom':
      return 'share_x';
    case 'share_instagram':
      return 'share_ig';
    case 'share_truthsocial':
    case 'share_truth_social':
      return 'share_truth';
    default:
      return action;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const kind = body?.kind || body?.action;
    const action = (body?.action ?? body?.kind) as string | undefined;

    const headerEmail = req.headers.get('x-user-email');
    if (!headerEmail) {
      return NextResponse.json({ ok: false, error: 'missing_user_email' }, { status: 400 });
    }

    const normalizedEmail = normalizeEmail(headerEmail);
    const normalizedAction = action ? normalizeAction(action) : kind;

    if (!normalizedAction) {
      return NextResponse.json(
        { ok: false, error: 'missing action' },
        { status: 400 }
      );
    }

    // Proxy to deepquill (canonical DB) - no local writes
    const { data, status } = await proxyJson('/api/points/award', req, {
      method: 'POST',
      body: {
        kind: normalizedAction,
        action: normalizedAction,
        email: normalizedEmail,
      },
      headers: {
        'x-user-email': normalizedEmail,
        'x-admin-key': process.env.ADMIN_KEY || '',
      },
    });

    if (status !== 200) {
      return NextResponse.json(
        data || { ok: false, error: 'points_service_error' },
        { status: status >= 400 && status < 600 ? status : 503 }
      );
    }

    const pointsAwarded = data?.awarded ?? 0;
    const totalPoints = data?.user?.points ?? 0;

    return NextResponse.json({
      ok: true,
      awarded: pointsAwarded > 0,
      alreadyAwarded: pointsAwarded === 0 && data?.reason === 'already_awarded',
      total: totalPoints,
    });
  } catch (err: any) {
    console.error('[points/award] error', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to award points' },
      { status: 503 }
    );
  }
}
