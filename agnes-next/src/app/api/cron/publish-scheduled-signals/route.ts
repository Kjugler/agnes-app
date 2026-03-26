// Cron: Publish signals whose publishAt has passed
// Proxies to deepquill (canonical DB)

import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    const { data, status } = await proxyJson('/api/cron/publish-scheduled-signals', req, { method: 'GET' });
    return NextResponse.json(data, { status });
  } catch (err: unknown) {
    console.error('[cron/publish-scheduled-signals] Proxy error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
