import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const API_BASE_URL =
  process.env.DEEPQUILL_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5055';

/** Beta limit: ~80 MB (client multipart used above ~4.5 MB anyway) */
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

async function resolveUploadUserId(request: NextRequest): Promise<string | null> {
  const cookie = request.headers.get('cookie') || '';
  const res = await fetch(`${API_BASE_URL}/api/signal/upload-auth`, {
    headers: { cookie },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return typeof data.userId === 'string' ? data.userId : null;
}

function validatePathname(pathname: string, userId: string) {
  const prefix = `signals/${userId}/`;
  if (!pathname.startsWith(prefix)) {
    throw new Error('Invalid upload path');
  }
  if (!/\.(mp4|webm)$/i.test(pathname)) {
    throw new Error('Only .mp4 or .webm uploads are allowed');
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'Video uploads are not configured (missing BLOB_READ_WRITE_TOKEN)' },
      { status: 503 }
    );
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      token,
      request,
      body,
      onBeforeGenerateToken: async (pathname /* , clientPayload, multipart */) => {
        const userId = await resolveUploadUserId(request);
        if (!userId) {
          throw new Error('Sign in required to upload video');
        }
        validatePathname(pathname, userId);
        return {
          allowedContentTypes: ['video/mp4', 'video/webm'],
          maximumSizeInBytes: MAX_VIDEO_BYTES,
          tokenPayload: JSON.stringify({ userId }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log('[signal/media-upload] completed', blob.url);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
