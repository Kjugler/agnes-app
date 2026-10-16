import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { proxyJson } from '@/lib/deepquillProxy';

export const runtime = 'nodejs';

async function readerHeaders() {
  const cookieStore = await cookies();
  const userId = cookieStore.get('contest_user_id')?.value;
  return userId ? { userId, headers: { 'x-contest-user-id': userId } } : null;
}

export async function GET(req: NextRequest) {
  try {
    const reader = await readerHeaders();
    if (!reader) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    const { data, status } = await proxyJson('/api/promotional-email/consent', req, {
      method: 'GET',
      headers: reader.headers,
      omitForwardHeaders: ['x-contest-user-id'],
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[promotional-email/consent] proxy error', err);
    return NextResponse.json({ ok: false, error: 'proxy_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const reader = await readerHeaders();
    if (!reader) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { data, status } = await proxyJson('/api/promotional-email/consent', req, {
      method: 'POST',
      headers: reader.headers,
      body,
      omitForwardHeaders: ['x-contest-user-id'],
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[promotional-email/consent] proxy error', err);
    return NextResponse.json({ ok: false, error: 'proxy_error' }, { status: 500 });
  }
}
