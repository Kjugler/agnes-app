/**
 * Readers leave /readers-agree on the sample-chapter hub.
 * They choose a chapter there. A chapter URL must not skip that choice.
 */

const READER_PARAM_KEYS = [
  'ref',
  'code',
  'src',
  'v',
  'origin',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'fbclid',
  'ra_surface',
] as const;

type SearchParamsLike = { get: (key: string) => string | null } | null | undefined;

export function readerSearch(searchParams: SearchParamsLike): string {
  const params = new URLSearchParams();
  for (const key of READER_PARAM_KEYS) {
    const value = searchParams?.get(key);
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function sampleChaptersHubHref(searchParams: SearchParamsLike): string {
  return `/sample-chapters${readerSearch(searchParams)}`;
}

export function sampleChapterReadHref(chapterId: string, searchParams: SearchParamsLike): string {
  return `/sample-chapters/read/${chapterId}${readerSearch(searchParams)}`;
}

export function catalogHref(searchParams: SearchParamsLike): string {
  return `/catalog${readerSearch(searchParams)}`;
}

/** Keep a successful readers-agree email on the hub, including its attribution query. */
export function sampleChaptersDestination(redirectPath: string): string {
  const trimmed = String(redirectPath || '').trim();
  let url: URL;
  try {
    url = new URL(trimmed, 'http://local.invalid');
  } catch {
    return '/sample-chapters';
  }
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === '/sample-chapters') return `/sample-chapters${url.search}`;
  return `/sample-chapters${url.search}`;
}
