import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';
import { authorizeAdminSignalsProxy } from '@/lib/adminSignalsAuth';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  try {
    const auth = authorizeAdminSignalsProxy(req);
    if (!auth.ok) return auth.response;

    const { data, status } = await proxyJson(`/api/admin/signals/${id}/publish`, req, {
      method: 'POST',
      headers: { 'x-admin-key': auth.adminKey },
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[admin/signals] Publish proxy error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
