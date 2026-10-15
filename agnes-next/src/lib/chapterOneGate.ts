/**
 * Who may fetch a sample-chapter file.
 * Address-bar, iframe, and download requests require a recognized reader.
 * The in-app viewer may fetch while the server allowance is still open.
 */

export const CHAPTER_ONE_DOCUMENT_PATH = '/api/sample-chapters/1/document';
export const CHAPTER_ONE_PUBLIC_PDF_PATH = '/chapters/chapter1.pdf';

export type SampleChapterDocumentDecision = 'deny' | 'recognized-only' | 'allowance-or-recognized';

export function sampleChapterDocumentAccess(input: {
  secFetchSite: string | null;
  secFetchMode: string | null;
  secFetchDest: string | null;
  wantsAttachment: boolean;
}): SampleChapterDocumentDecision {
  const mode = (input.secFetchMode || '').toLowerCase();
  const dest = (input.secFetchDest || '').toLowerCase();
  const site = (input.secFetchSite || '').toLowerCase();
  const navigation =
    mode === 'navigate' ||
    dest === 'document' ||
    dest === 'iframe' ||
    dest === 'embed' ||
    dest === 'object';
  if (input.wantsAttachment || navigation) return 'recognized-only';
  const fetchModeOk = mode === 'cors' || mode === 'same-origin' || mode === 'no-cors';
  const fetchDestOk = dest === 'empty';
  if (site === 'same-origin' && fetchModeOk && fetchDestOk) return 'allowance-or-recognized';
  return 'deny';
}

export function chapterOneDocumentAccess(
  input: Parameters<typeof sampleChapterDocumentAccess>[0],
): SampleChapterDocumentDecision {
  return sampleChapterDocumentAccess(input);
}

/** A recognized reader can continue. An exhausted anonymous allowance cannot. */
export function sampleChapterReadable(input: { recognized: boolean; exhausted: boolean }): boolean {
  return input.recognized === true || input.exhausted !== true;
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
