import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { proxyJson } from '@/lib/deepquillProxy';
import {
  CONTEST_USER_ID_COOKIE,
  JODY_IDENTITY_HEADER,
  READERS_AGREE_LEAD_UID_COOKIE,
  resolveJodyRememberUserId,
} from '@/lib/jodyRememberIdentity';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userId = resolveJodyRememberUserId({
      contestUserId: cookieStore.get(CONTEST_USER_ID_COOKIE)?.value,
      readersAgreeLeadUserId: cookieStore.get(READERS_AGREE_LEAD_UID_COOKIE)?.value,
      funnelUserId: cookieStore.get('ap_funnel_uid')?.value,
    });
    if (!userId) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { data, status } = await proxyJson('/api/jody/remember/save', req, {
      method: 'POST',
      headers: {
        [JODY_IDENTITY_HEADER]: userId,
      },
      body: { chapterId: body?.chapterId },
      omitForwardHeaders: [JODY_IDENTITY_HEADER],
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[jody/remember/save] proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'proxy_error' },
      { status: 500 },
    );
  }
}
