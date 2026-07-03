import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

function unauthorized() {
  return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
}

function adminNotConfigured() {
  return NextResponse.json({ ok: false, error: 'admin_not_configured' }, { status: 500 });
}

async function adminContext(req: NextRequest) {
  const cookie = req.cookies.get('fulfillment-token')?.value;
  if (!cookie?.trim()) return null;
  const adminKey = process.env.ADMIN_KEY?.trim();
  if (!adminKey) return null;
  return { adminKey };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await adminContext(req);
  if (!ctx) {
    const adminKey = process.env.ADMIN_KEY?.trim();
    return adminKey ? unauthorized() : adminNotConfigured();
  }

  const { id } = await context.params;

  try {
    const { data, status } = await proxyJson(`/api/admin/readers/${encodeURIComponent(id)}`, req, {
      method: 'GET',
      headers: { 'x-admin-key': ctx.adminKey },
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[admin/readers/[id]] proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'proxy_error' },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await adminContext(req);
  if (!ctx) {
    const adminKey = process.env.ADMIN_KEY?.trim();
    return adminKey ? unauthorized() : adminNotConfigured();
  }

  const { id } = await context.params;

  try {
    const body = await req.json();
    const { data, status } = await proxyJson(
      `/api/admin/readers/${encodeURIComponent(id)}`,
      req,
      {
        method: 'PATCH',
        body,
        headers: { 'x-admin-key': ctx.adminKey },
      },
    );
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[admin/readers/[id]] PATCH proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'proxy_error' },
      { status: 500 },
    );
  }
}
