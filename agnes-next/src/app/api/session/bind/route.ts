import { NextResponse } from 'next/server';

/**
 * POST /api/session/bind
 * Binds code and email from Vite boot bridge to server session
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { code, email, source } = body;

    // TODO: Store in database/session store if needed
    // For now, just log and return success
    console.log('[session/bind]', { code, email, source });

    return NextResponse.json({ 
      ok: true, 
      message: 'Session bound',
      code: code || null,
      email: email || null,
    });
  } catch (err) {
    console.error('[session/bind] error:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to bind session' },
      { status: 500 }
    );
  }
}

