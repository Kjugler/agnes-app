// Vercel Cron: run nightly daily contest summary on deepquill (canonical DB).
// Secured with Authorization: Bearer CRON_SECRET (set on Vercel). Uses server ADMIN_KEY for x-admin-key to deepquill.

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

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const adminKey = process.env.ADMIN_KEY?.trim();
  if (!adminKey) {
    return NextResponse.json(
      { ok: false, error: 'ADMIN_KEY not configured on agnes-next (needed to call deepquill)' },
      { status: 500 }
    );
  }

  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/admin/jobs/daily-contest-summary`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'x-admin-key': adminKey, Accept: 'application/json' },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    console.error('[cron/daily-contest-summary]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'proxy_error' },
      { status: 500 }
    );
  }
}
