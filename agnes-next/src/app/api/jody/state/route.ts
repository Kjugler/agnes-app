import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { proxyJson } from '@/lib/deepquillProxy';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('contest_user_id')?.value;
    if (!userId) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const { data, status } = await proxyJson('/api/jody/state', req, {
      method: 'GET',
      headers: {
        'x-contest-user-id': userId,
      },
      omitForwardHeaders: ['x-contest-user-id'],
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[jody/state] proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'proxy_error' },
      { status: 500 },
    );
  }
}
