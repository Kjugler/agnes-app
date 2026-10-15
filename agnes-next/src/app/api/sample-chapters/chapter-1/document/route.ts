import { readFile } from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';
import { chapterOneDocumentAccess } from '@/lib/chapterOneGate';
import {
  READERS_AGREE_LEAD_UID_COOKIE,
  READERS_AGREE_SESSION_HEADER,
  looksLikeReadersAgreeSessionToken,
} from '@/lib/jodyRememberIdentity';

export const runtime = 'nodejs';

const HINT = /^.•••@\S+$/;
const PDF_PATH = path.join(process.cwd(), 'public', 'chapters', 'chapter1.pdf');

/**
 * Chapter 1 bytes for the in-app viewer.
 * A same-origin PDF.js fetch is allowed so the current page can render.
 * Address-bar, iframe, and download requests are refused until the signed
 * reader session is recognized. A person who copies that viewer request can
 * still save the file; the server cannot prove active reading time.
 */
async function readerIsRecognized(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(READERS_AGREE_LEAD_UID_COOKIE)?.value?.trim() || '';
  if (!looksLikeReadersAgreeSessionToken(token)) return false;
  try {
    const { data, status } = await proxyJson('/api/readers-agree/session', req, {
      method: 'GET',
      headers: { [READERS_AGREE_SESSION_HEADER]: token },
      omitForwardHeaders: [READERS_AGREE_SESSION_HEADER],
    });
    return (
      status === 200 &&
      data?.recognized === true &&
      typeof data.emailHint === 'string' &&
      HINT.test(data.emailHint)
    );
  } catch {
    return false;
  }
}

function denied() {
  return new NextResponse('This chapter opens in the reader.', {
    status: 403,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function GET(req: NextRequest) {
  const decision = chapterOneDocumentAccess({
    secFetchSite: req.headers.get('sec-fetch-site'),
    secFetchMode: req.headers.get('sec-fetch-mode'),
    secFetchDest: req.headers.get('sec-fetch-dest'),
    wantsAttachment: req.nextUrl.searchParams.get('download') === '1',
  });

  let disposition = 'inline';
  if (decision === 'deny') return denied();
  if (decision === 'allow-if-recognized') {
    const recognized = await readerIsRecognized(req);
    if (!recognized) return denied();
    if (req.nextUrl.searchParams.get('download') === '1') {
      disposition = 'attachment; filename="chapter-1.pdf"';
    }
  }

  try {
    const bytes = await readFile(PDF_PATH);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(bytes.length),
        'Content-Disposition': disposition,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse('Chapter file is unavailable.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}
