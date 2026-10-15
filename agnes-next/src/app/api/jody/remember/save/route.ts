import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { proxyJson } from '@/lib/deepquillProxy';
import {
  CONTEST_USER_ID_COOKIE,
  JODY_IDENTITY_HEADER,
  READERS_AGREE_LEAD_UID_COOKIE,
  READERS_AGREE_SESSION_HEADER,
  resolveJodyRememberUserId,
} from '@/lib/jodyRememberIdentity';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const contestUserId = resolveJodyRememberUserId({
      contestUserId: cookieStore.get(CONTEST_USER_ID_COOKIE)?.value,
      readersAgreeLeadUserId: null,
      funnelUserId: cookieStore.get('ap_funnel_uid')?.value,
    });
    const readersAgreeSession = cookieStore.get(READERS_AGREE_LEAD_UID_COOKIE)?.value?.trim() || '';
    if (!contestUserId && !readersAgreeSession) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { data, status } = await proxyJson('/api/jody/remember/save', req, {
      method: 'POST',
      headers: contestUserId
        ? { [JODY_IDENTITY_HEADER]: contestUserId }
        : { [READERS_AGREE_SESSION_HEADER]: readersAgreeSession },
      body: { chapterId: body?.chapterId },
      omitForwardHeaders: [JODY_IDENTITY_HEADER, READERS_AGREE_SESSION_HEADER],
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
