import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { data, status } = await proxyJson('/api/contest/terminal-discovery', req, {
      method: 'POST',
    });
    return NextResponse.json(data, { status });
  } catch (err: any) {
    console.error('[contest/terminal-discovery] proxy error', err?.message);
    return NextResponse.json(
      { ok: false, error: 'Failed to award terminal discovery bonus' },
      { status: 500 }
    );
  }
}
