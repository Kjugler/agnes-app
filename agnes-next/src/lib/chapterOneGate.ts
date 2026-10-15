/**
 * Chapter 1 reader gate.
 * Page locking is a viewer rule. The PDF bytes still have to reach PDF.js;
 * see chapterOneDocumentAccess for what the server will and will not serve.
 */

export const CHAPTER_ONE_DOCUMENT_PATH = '/api/sample-chapters/chapter-1/document';
export const CHAPTER_ONE_PUBLIC_PDF_PATH = '/chapters/chapter1.pdf';
export const CHAPTER_ONE_ACTIVE_MS_KEY = 'ap_ch1_active_ms';
export const CHAPTER_ONE_GATE_PAGE_KEY = 'ap_ch1_gate_page';

export type ChapterOneDocumentDecision = 'allow' | 'deny' | 'allow-if-recognized';

export function chapterOneDocumentAccess(input: {
  secFetchSite: string | null;
  secFetchMode: string | null;
  secFetchDest: string | null;
  wantsAttachment: boolean;
}): ChapterOneDocumentDecision {
  const mode = (input.secFetchMode || '').toLowerCase();
  const dest = (input.secFetchDest || '').toLowerCase();
  const site = (input.secFetchSite || '').toLowerCase();
  const navigation =
    mode === 'navigate' ||
    dest === 'document' ||
    dest === 'iframe' ||
    dest === 'embed' ||
    dest === 'object';
  if (input.wantsAttachment || navigation) return 'allow-if-recognized';
  const fetchModeOk = mode === 'cors' || mode === 'same-origin' || mode === 'no-cors';
  const fetchDestOk = dest === 'empty';
  if (site === 'same-origin' && fetchModeOk && fetchDestOk) return 'allow';
  return 'deny';
}

export function canAdvanceToPage(input: {
  targetPage: number;
  pageCount: number;
  accessEstablished: boolean;
  gatePage: number | null;
}): boolean {
  if (!Number.isInteger(input.targetPage) || input.targetPage < 1) return false;
  if (input.pageCount > 0 && input.targetPage > input.pageCount) return false;
  if (input.accessEstablished) return true;
  if (input.gatePage == null) return true;
  return input.targetPage <= input.gatePage;
}

export function readStoredActiveMs(raw: string | null): number {
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), JODY_READER_GATE_MS_CAP);
}

export function readStoredGatePage(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 500) return null;
  return n;
}

/** Stored active time cannot run past the invitation. */
const JODY_READER_GATE_MS_CAP = 90_000;
