import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

function adminProxyHeaders(adminKey: string) {
  return { 'x-admin-key': adminKey };
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
}

function adminNotConfigured() {
  return NextResponse.json({ ok: false, error: 'admin_not_configured' }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get('fulfillment-token')?.value;
  if (!cookie?.trim()) return unauthorized();
  const adminKey = process.env.ADMIN_KEY?.trim();
  if (!adminKey) return adminNotConfigured();

  const reqUrl = new URL(req.url);
  const qs = reqUrl.search || '';

  try {
    const { data, status } = await proxyJson(`/api/admin/readers${qs}`, req, {
      method: 'GET',
      headers: adminProxyHeaders(adminKey),
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[admin/readers] proxy GET error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'proxy_error' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get('fulfillment-token')?.value;
  if (!cookie?.trim()) return unauthorized();
  const adminKey = process.env.ADMIN_KEY?.trim();
  if (!adminKey) return adminNotConfigured();

  try {
    const body = await req.json();
    const { data, status } = await proxyJson('/api/admin/readers', req, {
      method: 'POST',
      body,
      headers: adminProxyHeaders(adminKey),
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[admin/readers] proxy POST error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'proxy_error' },
      { status: 500 },
    );
  }
}
