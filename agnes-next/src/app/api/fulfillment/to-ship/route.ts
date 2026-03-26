// agnes-next: proxy-only to deepquill /api/fulfillment/to-ship
// Read-only. Deepquill owns canonical Order fulfillment.

import { NextRequest } from 'next/server';
import { fulfillmentProxy } from '@/lib/fulfillmentProxy';

export async function GET(req: NextRequest) {
  try {
    const { response } = await fulfillmentProxy('/api/fulfillment/to-ship', req, {
      method: 'GET',
    });
    return response;
  } catch (err) {
    console.error('[fulfillment/to-ship] proxy error', err);
    return Response.json(
      { error: 'Service unavailable' },
      { status: 503 }
    );
  }
}
