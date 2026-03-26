// agnes-next: proxy-only to deepquill /api/fulfillment/mark-shipped
// Command. Deepquill owns canonical Order fulfillment + shipping confirmation email.

import { NextRequest } from 'next/server';
import { fulfillmentProxy } from '@/lib/fulfillmentProxy';

export async function POST(req: NextRequest) {
  try {
    const { response } = await fulfillmentProxy('/api/fulfillment/mark-shipped', req, {
      method: 'POST',
    });
    return response;
  } catch (err) {
    console.error('[fulfillment/mark-shipped] proxy error', err);
    return Response.json(
      { error: 'Service unavailable' },
      { status: 503 }
    );
  }
}
