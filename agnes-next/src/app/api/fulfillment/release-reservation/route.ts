// agnes-next: proxy-only to deepquill /api/fulfillment/release-reservation
// Command: release order without printing (e.g. Skip / Problem).

import { NextRequest } from 'next/server';
import { fulfillmentProxy } from '@/lib/fulfillmentProxy';

export async function POST(req: NextRequest) {
  try {
    const { response } = await fulfillmentProxy('/api/fulfillment/release-reservation', req, {
      method: 'POST',
    });
    return response;
  } catch (err) {
    console.error('[fulfillment/release-reservation] proxy error', err);
    return Response.json(
      { error: 'Service unavailable' },
      { status: 503 }
    );
  }
}
