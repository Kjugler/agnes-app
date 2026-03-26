// agnes-next: proxy-only to deepquill /api/fulfillment/print-label
// Command. Deepquill owns canonical Order fulfillment.

import { NextRequest } from 'next/server';
import { fulfillmentProxy } from '@/lib/fulfillmentProxy';

export async function POST(req: NextRequest) {
  try {
    const { response } = await fulfillmentProxy('/api/fulfillment/print-label', req, {
      method: 'POST',
    });
    return response;
  } catch (err) {
    console.error('[fulfillment/print-label] proxy error', err);
    return Response.json(
      { error: 'Service unavailable' },
      { status: 503 }
    );
  }
}
