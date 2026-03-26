// agnes-next: proxy-only to deepquill /api/fulfillment/user
// Command. Deepquill owns canonical FulfillmentUser.

import { NextRequest } from 'next/server';
import { fulfillmentProxy } from '@/lib/fulfillmentProxy';

export async function POST(req: NextRequest) {
  try {
    const { response } = await fulfillmentProxy('/api/fulfillment/user', req, {
      method: 'POST',
    });
    return response;
  } catch (err) {
    console.error('[fulfillment/user] proxy error', err);
    return Response.json(
      { error: 'Service unavailable' },
      { status: 503 }
    );
  }
}
