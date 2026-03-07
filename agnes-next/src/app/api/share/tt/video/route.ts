export const runtime = 'nodejs';

import { NextRequest } from 'next/server';
import { serveShareVideo } from '@/lib/videoDelivery';

export async function GET(req: NextRequest) {
  return serveShareVideo({ platform: 'tt', req });
}
