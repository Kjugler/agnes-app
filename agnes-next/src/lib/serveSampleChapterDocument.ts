import { readFile } from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/lib/deepquillProxy';
import { sampleChapterDocumentAccess } from '@/lib/chapterOneGate';
import {
  READERS_AGREE_LEAD_UID_COOKIE,
  READERS_AGREE_SESSION_HEADER,
  looksLikeReadersAgreeSessionToken,
} from '@/lib/jodyRememberIdentity';
import {
  READING_ALLOWANCE_COOKIE,
  READING_ALLOWANCE_HEADER,
  isSampleChapterId,
  looksLikeReadingAllowanceToken,
  readingAllowanceCookieOptions,
} from '@/lib/readingAllowance';

const HINT = /^.•••@\S+$/;

const FILE_BY_ID: Record<string, string> = {
  '1': 'chapter1.pdf',
  '2': 'chapter2.pdf',
  '9': 'chapter9.pdf',
  '45': 'chapter45.pdf',
};

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

async function openAllowance(req: NextRequest): Promise<{ allowed: boolean; token: string | null }> {
  const cookie = req.cookies.get(READING_ALLOWANCE_COOKIE)?.value?.trim() || '';
  const headers: Record<string, string> = {};
  if (looksLikeReadingAllowanceToken(cookie)) headers[READING_ALLOWANCE_HEADER] = cookie;
  try {
    const { data, status } = await proxyJson('/api/sample-chapters/reading-allowance', req, {
      method: 'GET',
      headers,
      omitForwardHeaders: [READING_ALLOWANCE_HEADER],
    });
    const token = typeof data?.allowanceToken === 'string' ? data.allowanceToken : null;
    if (status !== 200 || data?.ok !== true || data?.exhausted === true) {
      return { allowed: false, token: looksLikeReadingAllowanceToken(token) ? token : null };
    }
    return { allowed: true, token: looksLikeReadingAllowanceToken(token) ? token : null };
  } catch {
    return { allowed: false, token: null };
  }
}

function applyAllowanceCookie(response: NextResponse, req: NextRequest, token: string | null) {
  if (!token || !looksLikeReadingAllowanceToken(token)) return response;
  response.cookies.set(
    READING_ALLOWANCE_COOKIE,
    token.trim(),
    readingAllowanceCookieOptions(req.nextUrl.protocol === 'https:'),
  );
  return response;
}

export async function serveSampleChapterDocument(req: NextRequest, chapterId: string) {
  if (!isSampleChapterId(chapterId)) return denied();

  const decision = sampleChapterDocumentAccess({
    secFetchSite: req.headers.get('sec-fetch-site'),
    secFetchMode: req.headers.get('sec-fetch-mode'),
    secFetchDest: req.headers.get('sec-fetch-dest'),
    wantsAttachment: req.nextUrl.searchParams.get('download') === '1',
  });
  if (decision === 'deny') return denied();

  const recognized = await readerIsRecognized(req);
  let allowanceToken: string | null = null;
  if (!recognized) {
    if (decision === 'recognized-only') return denied();
    const allowance = await openAllowance(req);
    allowanceToken = allowance.token;
    if (!allowance.allowed) {
      return applyAllowanceCookie(denied(), req, allowanceToken);
    }
  }

  const fileName = FILE_BY_ID[chapterId];
  let disposition = 'inline';
  if (recognized && req.nextUrl.searchParams.get('download') === '1') {
    disposition = `attachment; filename="${fileName}"`;
  }

  try {
    const bytes = await readFile(path.join(process.cwd(), 'public', 'chapters', fileName));
    const response = new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(bytes.length),
        'Content-Disposition': disposition,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
    return applyAllowanceCookie(response, req, allowanceToken);
  } catch {
    return new NextResponse('Chapter file is unavailable.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}
