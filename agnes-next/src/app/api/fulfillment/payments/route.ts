// agnes-next: proxy to deepquill POST /api/fulfillment/payments

import { NextRequest } from 'next/server';
import { fulfillmentProxy } from '@/lib/fulfillmentProxy';

export async function POST(req: NextRequest) {
  try {
    const { response } = await fulfillmentProxy('/api/fulfillment/payments', req, {
      method: 'POST',
    });
    return response;
  } catch (err) {
    console.error('[fulfillment/payments] proxy error', err);
    return Response.json(
      { error: 'Service unavailable' },
      { status: 503 }
    );
  }
}
