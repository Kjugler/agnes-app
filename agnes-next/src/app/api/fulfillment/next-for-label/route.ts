// agnes-next: proxy-only to deepquill /api/fulfillment/next-for-label
// Command: atomically claim oldest eligible order (FIFO). Deepquill owns canonical Order fulfillment.

import { NextRequest } from 'next/server';
import { fulfillmentProxy } from '@/lib/fulfillmentProxy';

export async function GET(req: NextRequest) {
  try {
    const { response } = await fulfillmentProxy('/api/fulfillment/next-for-label', req, {
      method: 'GET',
    });
    return response;
  } catch (err) {
    console.error('[fulfillment/next-for-label] proxy error', err);
    return Response.json(
      { error: 'Service unavailable' },
      { status: 503 }
    );
  }
}
