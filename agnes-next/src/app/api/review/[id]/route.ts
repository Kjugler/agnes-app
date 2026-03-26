import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, status } = await proxyJson(`/api/review/${id}`, req, { method: 'PATCH' });
    return NextResponse.json(data, { status });
  } catch (err) {
    console.error('[review/[id]] PATCH proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, status } = await proxyJson(`/api/review/${id}`, req, { method: 'DELETE' });
    return NextResponse.json(data, { status });
  } catch (err) {
    console.error('[review/[id]] DELETE proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
