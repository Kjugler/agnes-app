/**
 * Amazon Attribution URL builder — single resolver for outbound Amazon PDP links.
 * Phase C: clean PDP only. Real `maas` tags are wired via env when Kris provides them.
 */

import { AMAZON_PRODUCT_URL } from '@/lib/metaAdLanding';

const AMAZON_ATTR_SESSION_KEY = 'ap_amazon_attr_params';

/** Amazon Attribution keys — pass-through only; never invented in code. */
const AMAZON_ATTR_PARAM_KEYS = [
  'maas',
  'aa_campaignid',
  'aa_adgroupid',
  'aa_creativeid',
  'ref_',
] as const;

export type AmazonAttributionContext = {
  searchParams?: URLSearchParams | null;
};

function readPassThroughFromParams(
  searchParams?: URLSearchParams | null,
): Record<string, string> {
  const params =
    searchParams ??
    (typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null);
  if (!params) return {};

  const captured: Record<string, string> = {};
  for (const key of AMAZON_ATTR_PARAM_KEYS) {
    const value = params.get(key);
    if (value) captured[key] = value;
  }
  return captured;
}

function persistPassThroughParams(params: Record<string, string>): void {
  if (typeof window === 'undefined' || Object.keys(params).length === 0) return;
  try {
    sessionStorage.setItem(AMAZON_ATTR_SESSION_KEY, JSON.stringify(params));
  } catch {
    /* ignore */
  }
}

function getStoredPassThroughParams(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(AMAZON_ATTR_SESSION_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * Resolve Amazon Attribution tag suffix from env when configured.
 * Returns null until real tags are supplied — never fabricates `maas` values.
 */
function resolveAttributionTagSuffix(_context: AmazonAttributionContext): string | null {
  void _context;
  // Future: map utm_source / utm_campaign / ref → process.env.AMAZON_ATTR_TAG_*
  return null;
}

function mergeTagSuffixOntoUrl(baseUrl: URL, tagSuffix: string): void {
  const trimmed = tagSuffix.trim();
  if (!trimmed) return;

  const query = trimmed.startsWith('?') ? trimmed.slice(1) : trimmed;
  const fragment = query.includes('#') ? query.split('#').slice(1).join('#') : null;
  const queryOnly = fragment ? query.split('#')[0] : query;

  for (const part of queryOnly.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq === -1) {
      baseUrl.searchParams.set(part, '');
    } else {
      baseUrl.searchParams.set(part.slice(0, eq), part.slice(eq + 1));
    }
  }

  if (fragment) {
    baseUrl.hash = fragment;
  }
}

/** Build the Amazon PDP URL for the current attribution context. */
export function buildAmazonProductUrl(context: AmazonAttributionContext = {}): string {
  if (typeof window === 'undefined') {
    return AMAZON_PRODUCT_URL;
  }

  const incoming = readPassThroughFromParams(context.searchParams);
  if (Object.keys(incoming).length > 0) {
    persistPassThroughParams(incoming);
  }

  const passThrough = { ...getStoredPassThroughParams(), ...incoming };
  const url = new URL(AMAZON_PRODUCT_URL);

  for (const [key, value] of Object.entries(passThrough)) {
    url.searchParams.set(key, value);
  }

  const tagSuffix = resolveAttributionTagSuffix(context);
  if (tagSuffix) {
    mergeTagSuffixOntoUrl(url, tagSuffix);
  }

  return url.toString();
}
