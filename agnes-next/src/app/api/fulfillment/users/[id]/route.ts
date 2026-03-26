// agnes-next: proxy to deepquill GET /api/fulfillment/users/:id

import { NextRequest } from 'next/server';
import { fulfillmentProxy } from '@/lib/fulfillmentProxy';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { response } = await fulfillmentProxy(`/api/fulfillment/users/${id}`, req, { method: 'GET' });
    return response;
  } catch (err) {
    console.error('[fulfillment/users/:id] proxy error', err);
    return Response.json(
      { error: 'Service unavailable' },
      { status: 503 }
    );
  }
}
