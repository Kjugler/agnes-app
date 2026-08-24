import { NextRequest } from 'next/server';
import { proxyReaderLifecyclePost } from '@/lib/readerLifecycleAdminProxy';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ evidenceId: string }> },
) {
  const { evidenceId } = await context.params;
  return proxyReaderLifecyclePost(req, { route: 'correctEvidence', evidenceId });
}
