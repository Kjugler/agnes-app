import { copyNavParams } from '@/lib/funnelVisit';

/**
 * Readers leave /readers-agree on the sample-chapter hub.
 * They choose a chapter there. A chapter URL must not skip that choice.
 */

type SearchParamsLike = { get: (key: string) => string | null } | null | undefined;

export function readerSearch(searchParams: SearchParamsLike, allowAdvertisingClickIds = false): string {
  const params = copyNavParams(searchParams, allowAdvertisingClickIds, ['ra_surface']);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function sampleChaptersHubHref(searchParams: SearchParamsLike, allowAdvertisingClickIds = false): string {
  return `/sample-chapters${readerSearch(searchParams, allowAdvertisingClickIds)}`;
}

export function sampleChapterReadHref(
  chapterId: string,
  searchParams: SearchParamsLike,
  allowAdvertisingClickIds = false,
): string {
  return `/sample-chapters/read/${chapterId}${readerSearch(searchParams, allowAdvertisingClickIds)}`;
}

export function catalogHref(searchParams: SearchParamsLike, allowAdvertisingClickIds = false): string {
  return `/catalog${readerSearch(searchParams, allowAdvertisingClickIds)}`;
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
