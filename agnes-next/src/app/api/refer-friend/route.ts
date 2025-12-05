import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const base = process.env.DEEPQUILL_API_BASE || 'http://localhost:5055';

    const resp = await fetch(`${base}/api/refer-friend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error('[api/refer-friend] upstream error', data);
      return NextResponse.json(
        { ok: false, error: data.error || 'Upstream error' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/refer-friend] error', err);
    return NextResponse.json(
      { ok: false, error: 'Internal error' },
      { status: 500 }
    );
  }
}

