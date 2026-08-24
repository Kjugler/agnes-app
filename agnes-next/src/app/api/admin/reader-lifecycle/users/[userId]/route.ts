import { NextRequest } from 'next/server';
import { proxyReaderLifecycleGet } from '@/lib/readerLifecycleAdminProxy';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId } = await context.params;
  return proxyReaderLifecycleGet(req, { route: 'readerByUserId', userId });
}
