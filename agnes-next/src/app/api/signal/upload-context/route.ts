import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL =
  process.env.DEEPQUILL_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5055';

/**
 * Returns authenticated user id for client-side Vercel Blob pathname prefix.
 * Same session cookies as `/api/signal/create`.
 */
export async function GET(req: NextRequest) {
  try {
    const cookie = req.headers.get('cookie') || '';
    const res = await fetch(`${API_BASE_URL}/api/signal/upload-auth`, {
      headers: { cookie },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: typeof data.error === 'string' ? data.error : 'UNAUTHORIZED' },
        { status: res.status }
      );
    }
    return NextResponse.json({ ok: true, userId: data.userId });
  } catch (err) {
    console.error('[signal/upload-context]', err);
    return NextResponse.json({ ok: false, error: 'UPLOAD_CONTEXT_FAILED' }, { status: 500 });
  }
}
