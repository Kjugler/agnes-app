import { NextRequest } from 'next/server';
import { serveSampleChapterDocument } from '@/lib/serveSampleChapterDocument';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return serveSampleChapterDocument(req, '1');
}
