import { NextRequest, NextResponse } from 'next/server';
import { anonymousSamplePageAllowed, sampleChapterDocumentAccess } from '@/lib/chapterOneGate';
import { isSampleChapterId, READING_ALLOWANCE_COOKIE } from '@/lib/readingAllowance';
import { readSampleChapterPage } from '@/lib/sampleChapterPage';
import {
  applyAllowanceCookie,
  loadAnonymousAllowance,
  readerIsRecognized,
} from '@/lib/serveSampleChapterDocument';

export const runtime = 'nodejs';

function denied(req: NextRequest, token: string | null) {
  return applyAllowanceCookie(
    new NextResponse('This chapter opens in the reader.', {
      status: 403,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    }),
    req,
    token,
  );
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ chapterId: string; page: string }> },
) {
  const { chapterId, page } = await context.params;
  const pageNumber = Number(page);
  if (!isSampleChapterId(chapterId) || !Number.isInteger(pageNumber)) {
    return denied(req, null);
  }

  const decision = sampleChapterDocumentAccess({
    secFetchSite: req.headers.get('sec-fetch-site'),
    secFetchMode: req.headers.get('sec-fetch-mode'),
    secFetchDest: req.headers.get('sec-fetch-dest'),
    wantsAttachment: req.nextUrl.searchParams.get('download') === '1',
  });
  if (decision !== 'allowance-or-recognized') return denied(req, null);

  const recognized = await readerIsRecognized(req);
  let token: string | null = null;
  if (!recognized) {
    const allowance = await loadAnonymousAllowance(req);
    token = allowance.token;
    if (
      !allowance.ok ||
      !anonymousSamplePageAllowed({
        exhausted: allowance.exhausted,
        lockedChapterId: allowance.chapterId,
        lockedPage: allowance.page,
        requestedChapterId: chapterId,
        requestedPage: pageNumber,
      })
    ) {
      return denied(req, token);
    }
  }

  const extracted = await readSampleChapterPage(chapterId, pageNumber);
  if (!extracted) {
    return new NextResponse('Chapter file is unavailable.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const body = new Uint8Array(extracted.pdf);
  const response = new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(body.byteLength),
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Sample-Page': String(pageNumber),
      'X-Sample-Page-Count': String(extracted.pageCount),
    },
  });
  const hadCookie = Boolean(req.cookies.get(READING_ALLOWANCE_COOKIE)?.value);
  return hadCookie ? response : applyAllowanceCookie(response, req, token);
}
