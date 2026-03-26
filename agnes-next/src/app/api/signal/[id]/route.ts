import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, status } = await proxyJson(`/api/signal/${id}`, req, { method: 'GET' });
    return NextResponse.json(data, { status });
  } catch (err) {
    console.error('[signal/[id]] Proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, status } = await proxyJson(`/api/signal/${id}`, req, { method: 'PATCH' });
    return NextResponse.json(data, { status });
  } catch (err) {
    console.error('[signal/[id]] PATCH proxy error', err);
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
    const { data, status } = await proxyJson(`/api/signal/${id}`, req, { method: 'DELETE' });
    return NextResponse.json(data, { status });
  } catch (err) {
    console.error('[signal/[id]] DELETE proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
