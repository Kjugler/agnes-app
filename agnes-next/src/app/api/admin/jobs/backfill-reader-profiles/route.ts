import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

function unauthorized() {
  return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
}

function adminNotConfigured() {
  return NextResponse.json({ ok: false, error: 'admin_not_configured' }, { status: 500 });
}

async function handle(req: NextRequest) {
  const cookie = req.cookies.get('fulfillment-token')?.value;
  if (!cookie?.trim()) return unauthorized();
  const adminKey = process.env.ADMIN_KEY?.trim();
  if (!adminKey) return adminNotConfigured();

  const reqUrl = new URL(req.url);
  const qs = reqUrl.search || '';

  try {
    const { data, status } = await proxyJson(`/api/admin/jobs/backfill-reader-profiles${qs}`, req, {
      method: req.method === 'POST' ? 'POST' : 'GET',
      headers: { 'x-admin-key': adminKey },
    });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[admin/jobs/backfill-reader-profiles] Proxy error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
