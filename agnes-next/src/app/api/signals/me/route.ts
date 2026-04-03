import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { proxyJson } from '@/lib/deepquillProxy';
import { hasSignalRoomAccess, getSignalRoomAccessMode, SIGNAL_ROOM_ACCESS_COOKIE } from '@/lib/signal-room-access';
import { normalizeEmail } from '@/lib/email';

export async function GET(req: NextRequest) {
  try {
    const mode = getSignalRoomAccessMode();
    if (mode !== 'public') {
      const cookieStore = await cookies();
      const accessCookieValue = cookieStore.get(SIGNAL_ROOM_ACCESS_COOKIE)?.value ?? null;
      const email =
        cookieStore.get('contest_email')?.value ||
        cookieStore.get('mockEmail')?.value ||
        cookieStore.get('user_email')?.value ||
        cookieStore.get('associate_email')?.value ||
        null;
      const userEmail = email ? normalizeEmail(email) : null;

      if (!hasSignalRoomAccess({ accessCookieValue, userEmail })) {
        return NextResponse.json({ error: 'Signal Room access required' }, { status: 403 });
      }
    }

    const { data, status } = await proxyJson('/api/signals/me', req, { method: 'GET' });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[signals/me] Proxy error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
