import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const API_BASE_URL =
  process.env.DEEPQUILL_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5055';

/** Video */
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
/** PDF + images (Signal document attachments) */
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

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
  const allowed = /\.(mp4|webm|pdf|png|jpg|jpeg)$/i.test(pathname);
  if (!allowed) {
    throw new Error('Only .mp4, .webm, .pdf, .png, .jpg, or .jpeg uploads are allowed');
  }
}

function maxBytesForPathname(pathname: string): number {
  if (/\.(pdf|png|jpg|jpeg)$/i.test(pathname)) {
    return MAX_DOCUMENT_BYTES;
  }
  return MAX_VIDEO_BYTES;
}

const VIDEO_TYPES = ['video/mp4', 'video/webm'] as const;
const DOCUMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'Media uploads are not configured (missing BLOB_READ_WRITE_TOKEN)' },
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
          throw new Error('Sign in required to upload');
        }
        validatePathname(pathname, userId);
        const maxBytes = maxBytesForPathname(pathname);
        return {
          allowedContentTypes: [...VIDEO_TYPES, ...DOCUMENT_TYPES],
          maximumSizeInBytes: maxBytes,
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
