import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { proxyJson } from '@/lib/deepquillProxy';
import {
  READERS_AGREE_LEAD_UID_COOKIE,
  READERS_AGREE_SESSION_HEADER,
  readersAgreeLeadIdentityCookieOptions,
} from '@/lib/jodyRememberIdentity';

export const runtime = 'nodejs';

const HINT = /^.•••@\S+$/;

function clearCookie(response: NextResponse, isHttps: boolean) {
  response.cookies.set(READERS_AGREE_LEAD_UID_COOKIE, '', {
    ...readersAgreeLeadIdentityCookieOptions(isHttps),
    maxAge: 0,
  });
}

export async function GET(req: NextRequest) {
  const isHttps = req.nextUrl.protocol === 'https:';
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(READERS_AGREE_LEAD_UID_COOKIE)?.value?.trim() || '';
    if (!token) {
      return NextResponse.json({ ok: true, recognized: false });
    }

    const { data, status } = await proxyJson('/api/readers-agree/session', req, {
      method: 'GET',
      headers: { [READERS_AGREE_SESSION_HEADER]: token },
      omitForwardHeaders: [READERS_AGREE_SESSION_HEADER],
    });

    const hint =
      status === 200 &&
      data?.recognized === true &&
      typeof data.emailHint === 'string' &&
      HINT.test(data.emailHint)
        ? data.emailHint
        : null;

    const response = NextResponse.json(
      hint ? { ok: true, recognized: true, emailHint: hint } : { ok: true, recognized: false },
    );
    if (status === 200 && !hint) {
      clearCookie(response, isHttps);
    }
    return response;
  } catch (err: unknown) {
    console.error('[readers-agree/session] proxy error', err);
    return NextResponse.json({ ok: true, recognized: false });
  }
}
