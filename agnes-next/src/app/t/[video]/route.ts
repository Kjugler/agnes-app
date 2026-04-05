import { NextRequest, NextResponse } from 'next/server';
import { REFER_VIDEOS, type ReferVideoId } from '@/config/referVideos';

const VALID = new Set<ReferVideoId>(REFER_VIDEOS.map((v) => v.id));

/**
 * Text-a-friend short links: /t/fb1 → /?source=textafriend&video=fb1&discount=15
 * Preserves existing middleware + Lightening attribution (cookies, sessionStorage, checkout).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ video: string }> }
) {
  const { video } = await context.params;
  if (!VALID.has(video as ReferVideoId)) {
    return NextResponse.redirect(new URL('/', request.url), 302);
  }

  const url = new URL('/', request.url);
  url.searchParams.set('source', 'textafriend');
  url.searchParams.set('video', video);
  url.searchParams.set('discount', '15');

  // Preserve sender attribution (ref → ap_ref cookies via middleware) and any other pass-through params.
  const skip = new Set(['source', 'video', 'discount']);
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    if (skip.has(key)) continue;
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url, 302);
}
