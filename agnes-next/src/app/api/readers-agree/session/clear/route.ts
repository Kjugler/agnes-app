import { NextRequest, NextResponse } from 'next/server';
import {
  READERS_AGREE_LEAD_UID_COOKIE,
  readersAgreeLeadIdentityCookieOptions,
} from '@/lib/jodyRememberIdentity';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const isHttps = req.nextUrl.protocol === 'https:';
  const response = NextResponse.json({ ok: true });
  response.cookies.set(READERS_AGREE_LEAD_UID_COOKIE, '', {
    ...readersAgreeLeadIdentityCookieOptions(isHttps),
    maxAge: 0,
  });
  return response;
}
