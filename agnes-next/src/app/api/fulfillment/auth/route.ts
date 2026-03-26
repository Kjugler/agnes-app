// POST /api/fulfillment/auth - Set fulfillment token cookie and redirect
// Used by /admin/fulfillment/auth page

import { NextRequest, NextResponse } from 'next/server';

const FULFILLMENT_TOKEN_COOKIE = 'fulfillment-token';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = typeof body?.token === 'string' ? body.token.trim() : '';

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const redirectTo = typeof body?.redirect === 'string' ? body.redirect : '/admin/fulfillment/labels';
    const res = NextResponse.json({ success: true });

    res.cookies.set(FULFILLMENT_TOKEN_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });

    return res;
  } catch (err) {
    console.error('[fulfillment/auth] Error:', err);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
