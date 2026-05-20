'use server';

import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';
import { logContestEntry, principalFromRequest } from '@/lib/contestEntryLog';

const ENDPOINT = '/api/contest/join';

export async function POST(req: NextRequest) {
  const principal = principalFromRequest(req);

  try {
    const { data, status } = await proxyJson('/api/contest/join', req, {
      method: 'POST',
    });

    logContestEntry({
      step: 'join',
      endpoint: ENDPOINT,
      status,
      ok: data?.ok !== false,
      errorKey: data?.error ?? null,
      email: principal.email,
      userId: principal.userId,
      deepquillStatus: status,
    });

    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logContestEntry({
      step: 'join',
      endpoint: ENDPOINT,
      status: 500,
      ok: false,
      errorKey: 'server_error',
      email: principal.email,
      userId: principal.userId,
      proxyFailed: true,
      message,
    });
    return NextResponse.json(
      { ok: false, error: 'server_error' },
      { status: 500 },
    );
  }
}
