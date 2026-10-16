import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { proxyJson } from '@/lib/deepquillProxy';
import {
  READERS_AGREE_LEAD_UID_COOKIE,
  READERS_AGREE_SESSION_HEADER,
} from '@/lib/jodyRememberIdentity';

export const runtime = 'nodejs';

async function identityHeaders() {
  const cookieStore = await cookies();
  const headers: Record<string, string> = {};
  const userId = cookieStore.get('contest_user_id')?.value;
  const session = cookieStore.get(READERS_AGREE_LEAD_UID_COOKIE)?.value?.trim();
  if (userId) headers['x-contest-user-id'] = userId;
  if (session) headers[READERS_AGREE_SESSION_HEADER] = session;
  return headers;
}

export async function GET(req: NextRequest) {
  try {
    const headers = await identityHeaders();
    const { data, status } = await proxyJson('/api/promotional-email/departure', req, {
      method: 'GET',
      headers,
      omitForwardHeaders: ['x-contest-user-id', READERS_AGREE_SESSION_HEADER],
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[promotional-email/departure] proxy error', err);
    return NextResponse.json({ ok: false, error: 'proxy_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const headers = await identityHeaders();
    const body = await req.json().catch(() => ({}));
    const { data, status } = await proxyJson('/api/promotional-email/departure', req, {
      method: 'POST',
      headers,
      body,
      omitForwardHeaders: ['x-contest-user-id', READERS_AGREE_SESSION_HEADER],
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[promotional-email/departure] proxy error', err);
    return NextResponse.json({ ok: false, error: 'proxy_error' }, { status: 500 });
  }
}
