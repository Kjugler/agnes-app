/**
 * Anonymous sample-reading allowance.
 * The signed token stays in an HttpOnly cookie. The page never sends a duration.
 */

export const READING_ALLOWANCE_COOKIE = 'ap_reading_allowance';
export const READING_ALLOWANCE_HEADER = 'x-reading-allowance';

export const SAMPLE_CHAPTER_IDS = ['1', '2', '9', '45'] as const;

export type SampleChapterId = (typeof SAMPLE_CHAPTER_IDS)[number];

export function isSampleChapterId(value: string): value is SampleChapterId {
  return (SAMPLE_CHAPTER_IDS as readonly string[]).includes(value);
}

export function sampleChapterDocumentPath(chapterId: string): string {
  return `/api/sample-chapters/${chapterId}/document`;
}

export function looksLikeReadingAllowanceToken(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const token = raw.trim();
  if (!token || token.length > 2000) return false;
  const parts = token.split('.');
  return parts.length === 2 && parts[0].length >= 16 && parts[1].length >= 20;
}

export function readingAllowanceCookieOptions(isHttps: boolean) {
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  };
}

export type ReadingAllowanceSnapshot = {
  ok: true;
  accumulatedMs: number;
  remainingMs: number;
  exhausted: boolean;
  limitMs: number;
  chapterId: string | null;
  page: number;
};

export async function fetchReadingAllowance(input: {
  method: 'GET' | 'POST';
  body?: Record<string, unknown>;
}): Promise<ReadingAllowanceSnapshot | null> {
  try {
    const res = await fetch('/api/sample-chapters/reading-allowance', {
      method: input.method,
      credentials: 'include',
      headers: input.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
      body: input.body ? JSON.stringify(input.body) : undefined,
    });
    const data = (await res.json().catch(() => null)) as ReadingAllowanceSnapshot | null;
    if (!res.ok || !data || data.ok !== true || typeof data.exhausted !== 'boolean') return null;
    return data;
  } catch {
    return null;
  }
}
