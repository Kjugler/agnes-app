import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    
    // Clear contest session cookies
    cookieStore.delete('contest_email');
    cookieStore.delete('user_email');
    cookieStore.delete('mockEmail');
    cookieStore.delete('associate_email');

    console.log('[contest/logout] User logged out');

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[contest/logout] Error', {
      error: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { ok: false, error: 'server_error' },
      { status: 500 }
    );
  }
}

