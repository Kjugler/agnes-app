// agnes-next: proxy to deepquill GET /api/fulfillment/users
// List helpers. ?activeOnly=true for picker.

import { NextRequest } from 'next/server';
import { fulfillmentProxy } from '@/lib/fulfillmentProxy';

export async function GET(req: NextRequest) {
  try {
    const { response } = await fulfillmentProxy('/api/fulfillment/users', req, { method: 'GET' });
    return response;
  } catch (err) {
    console.error('[fulfillment/users] proxy error', err);
    return Response.json(
      { error: 'Service unavailable' },
      { status: 503 }
    );
  }
}
