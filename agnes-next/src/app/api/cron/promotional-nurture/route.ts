// Vercel Cron: hourly nurture runner on deepquill.
// Authorization: Bearer CRON_SECRET, same as the daily contest summary.
// The admin key stays in this server's request header and is never placed in the URL or the log.

import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const API_BASE_URL =
  process.env.DEEPQUILL_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5055';

function cronAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get('authorization') || '';
  const isLockedDown = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  if (!isLockedDown && !cronSecret) {
    return true;
  }
  if (!cronSecret) {
    return false;
  }
  return auth === `Bearer ${cronSecret}`;
}

function count(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.floor(number);
}

function publicResult(data: Record<string, unknown>, httpStatus: number) {
  const reason = typeof data.reason === 'string' ? data.reason.slice(0, 160) : null;
  return {
    ok: data.ok === true && httpStatus < 500,
    sent: count(data.sent),
    examined: count(data.examined),
    suppressed: count(data.suppressed),
    failed: count(data.failed),
    reason,
    startedAt: typeof data.startedAt === 'string' ? data.startedAt : null,
    finishedAt: typeof data.finishedAt === 'string' ? data.finishedAt : null,
    status: typeof data.status === 'string' ? data.status : null,
    trigger: data.trigger === 'cron' ? 'cron' : null,
  };
}

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const adminKey = process.env.ADMIN_KEY?.trim();
  if (!adminKey) {
    return NextResponse.json(
      { ok: false, error: 'admin_not_configured', sent: 0 },
      { status: 500 },
    );
  }

  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/admin/jobs/promotional-nurture`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-admin-key': adminKey,
        'x-nurture-trigger': 'cron',
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    const body = publicResult(data && typeof data === 'object' ? data as Record<string, unknown> : {}, res.status);
    console.log('[cron/promotional-nurture]', JSON.stringify(body));
    return NextResponse.json(body, { status: res.status });
  } catch {
    console.error('[cron/promotional-nurture] request failed');
    return NextResponse.json(
      { ok: false, error: 'proxy_error', sent: 0 },
      { status: 500 },
    );
  }
}
