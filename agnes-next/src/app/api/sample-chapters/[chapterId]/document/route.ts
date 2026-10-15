import { NextRequest } from 'next/server';
import { serveSampleChapterDocument } from '@/lib/serveSampleChapterDocument';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ chapterId: string }> },
) {
  const { chapterId } = await context.params;
  return serveSampleChapterDocument(req, chapterId);
}
