// agnes-next: proxy to deepquill PATCH /api/fulfillment/user/:id

import { NextRequest } from 'next/server';
import { fulfillmentProxy } from '@/lib/fulfillmentProxy';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { response } = await fulfillmentProxy(`/api/fulfillment/user/${id}`, req, { method: 'PATCH' });
    return response;
  } catch (err) {
    console.error('[fulfillment/user/:id] proxy error', err);
    return Response.json(
      { error: 'Service unavailable' },
      { status: 503 }
    );
  }
}
