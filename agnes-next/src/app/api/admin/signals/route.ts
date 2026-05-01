import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';
import { authorizeAdminSignalsProxy } from '@/lib/adminSignalsAuth';

export async function GET(req: NextRequest) {
  try {
    const auth = authorizeAdminSignalsProxy(req);
    if (!auth.ok) return auth.response;

    const { data, status } = await proxyJson('/api/admin/signals', req, {
      method: 'GET',
      headers: { 'x-admin-key': auth.adminKey },
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[admin/signals] GET proxy error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = authorizeAdminSignalsProxy(req);
    if (!auth.ok) return auth.response;

    const { data, status } = await proxyJson('/api/admin/signals', req, {
      method: 'POST',
      headers: { 'x-admin-key': auth.adminKey },
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[admin/signals] POST proxy error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
