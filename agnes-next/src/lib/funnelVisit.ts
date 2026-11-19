/**
 * Visit landing attribution and advertising click-id redaction.
 * The stable visitor id is separate. This module does not read cookies or consent storage.
 * A visit entry is the landing page for the current visit, not the visitor's first landing ever.
 */

export const VISIT_GAP_MS = 6 * 60 * 60 * 1000;

/** Stored on new funnel events and internal links only when advertising measurement is allowed. */
export const ADVERTISING_CLICK_ID_KEYS = ['fbclid', 'gclid', 'ttclid', 'msclkid'] as const;

export type AdvertisingClickIdKey = (typeof ADVERTISING_CLICK_ID_KEYS)[number];

/** Campaign and referral parameters. These stay when advertising measurement is denied. */
export const OPERATIONAL_NAV_PARAM_KEYS = [
  'ref',
  'code',
  'src',
  'v',
  'origin',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;

const LANDING_BY_SOURCE: Record<string, string> = {
  'readers-agree': '/readers-agree',
  'readers-cheer': '/readers-cheer',
  'world-wondering': '/world-wondering',
  'sample-chapters': '/sample-chapters',
};

const LANDING_PATHS = new Set(Object.values(LANDING_BY_SOURCE));

const CLICK_KEYS = ['fbclid', 'gclid', 'ttclid', 'msclkid'] as const;

export type VisitClickMap = Partial<Record<(typeof CLICK_KEYS)[number], string>>;

export type AdvertisingIdentity = {
  source: string;
  campaign: string;
  clicks: VisitClickMap;
};

export type StoredVisit = {
  entryPage: string;
  seenAt: number;
  source: string;
  campaign: string;
  clicks: VisitClickMap;
};

export function normalizeEntryPath(value: unknown): string | null {
  const raw = String(value || '').trim().split('?')[0];
  if (!raw) return null;
  const path = raw.length > 1 ? raw.replace(/\/+$/, '') : raw;
  return LANDING_PATHS.has(path) ? path : null;
}

export function currentLandingPath(input: {
  source?: string | null;
  explicit?: string | null;
  path?: string | null;
}): string | null {
  return (
    normalizeEntryPath(input.explicit) ||
    (input.source ? LANDING_BY_SOURCE[input.source] || null : null) ||
    normalizeEntryPath(input.path)
  );
}

function clickValue(value: unknown): string {
  return String(value || '').trim().slice(0, 200);
}

export function advertisingIdentity(
  utm: Record<string, string | null | undefined> | null | undefined,
  options?: { includeAdvertisingClickIds?: boolean },
): AdvertisingIdentity {
  const sourceMap = utm || {};
  const source = String(sourceMap.utm_source || sourceMap.origin || (sourceMap.src === 'ad' ? 'ad' : '') || '').trim();
  const campaign = String(sourceMap.utm_campaign || '').trim();
  const includeAdvertisingClickIds = options?.includeAdvertisingClickIds !== false;
  const clicks: VisitClickMap = {};
  for (const key of CLICK_KEYS) {
    if (!includeAdvertisingClickIds && ADVERTISING_CLICK_ID_KEYS.includes(key)) continue;
    const value = clickValue(sourceMap[key]);
    if (value) clicks[key] = value;
  }
  return { source, campaign, clicks };
}

function hasAdvertisingIdentity(identity: AdvertisingIdentity | null | undefined): boolean {
  if (!identity) return false;
  return Boolean(identity.source || identity.campaign || Object.keys(identity.clicks).length);
}

/**
 * A blank arrival is not a new campaign. Internal links often drop parameters.
 * A newly presented click id or a different source/campaign is a new advertising visit.
 */
export function campaignsClearlyDiffer(previous: AdvertisingIdentity | null, next: AdvertisingIdentity): boolean {
  if (!hasAdvertisingIdentity(next)) return false;
  if (!previous || !hasAdvertisingIdentity(previous)) return true;
  const keys = new Set([...Object.keys(previous.clicks), ...Object.keys(next.clicks)]);
  for (const key of keys) {
    const incoming = next.clicks[key as keyof VisitClickMap] || '';
    const prior = previous.clicks[key as keyof VisitClickMap] || '';
    if (incoming && incoming !== prior) return true;
  }
  if ((next.source || next.campaign) && (next.source !== previous.source || next.campaign !== previous.campaign)) {
    return true;
  }
  return false;
}

function hadDisallowedClickId(clicks: VisitClickMap | null | undefined): boolean {
  if (!clicks) return false;
  return ADVERTISING_CLICK_ID_KEYS.some((key) => Boolean(clicks[key]));
}

function sanitizeStoredVisit(stored: StoredVisit | null | undefined, includeAdvertisingClickIds: boolean): StoredVisit | null {
  const entryPage = normalizeEntryPath(stored && stored.entryPage);
  const seenAt = stored ? Number(stored.seenAt) : NaN;
  if (!stored || !entryPage || !Number.isFinite(seenAt)) return null;
  const clicks = { ...(stored.clicks || {}) };
  if (!includeAdvertisingClickIds) {
    for (const key of ADVERTISING_CLICK_ID_KEYS) delete clicks[key];
  }
  return {
    entryPage,
    seenAt,
    source: String(stored.source || ''),
    campaign: String(stored.campaign || ''),
    clicks,
  };
}

export function resolveVisitEntry(input: {
  stored: StoredVisit | null;
  now: number;
  source?: string | null;
  explicit?: string | null;
  path?: string | null;
  utm?: Record<string, string | null | undefined>;
  includeAdvertisingClickIds?: boolean;
}): {
  entryPage: string | null;
  visit: StoredVisit | null;
  started: boolean;
  persist: boolean;
  redacted: boolean;
} {
  const includeAdvertisingClickIds = input.includeAdvertisingClickIds !== false;
  const current = currentLandingPath(input);
  const nextIdentity = advertisingIdentity(input.utm, { includeAdvertisingClickIds });
  const stored = sanitizeStoredVisit(input.stored, includeAdvertisingClickIds);
  const redacted = !includeAdvertisingClickIds && hadDisallowedClickId(input.stored && input.stored.clicks);
  const elapsed = stored ? input.now - stored.seenAt : Number.POSITIVE_INFINITY;
  const active = Boolean(stored && elapsed < VISIT_GAP_MS);
  const different = Boolean(current && stored && campaignsClearlyDiffer(stored, nextIdentity));

  if (current && (!stored || !active || different)) {
    return {
      entryPage: current,
      visit: {
        entryPage: current,
        seenAt: input.now,
        source: nextIdentity.source,
        campaign: nextIdentity.campaign,
        clicks: nextIdentity.clicks,
      },
      started: true,
      persist: true,
      redacted,
    };
  }

  if (stored && active) {
    return {
      entryPage: stored.entryPage,
      visit: { ...stored, seenAt: input.now },
      started: false,
      persist: true,
      redacted,
    };
  }

  return { entryPage: null, visit: stored, started: false, persist: redacted, redacted };
}

export function omitDisallowedAdvertisingClickIds<T extends Record<string, unknown>>(values: T, allowed: boolean): T {
  if (allowed || !values) return values;
  const next = { ...values };
  for (const key of ADVERTISING_CLICK_ID_KEYS) delete next[key];
  return next;
}

export function pathWithoutDisallowedClickIds(path: string, allowed: boolean): string {
  if (allowed) return path;
  const queryAt = path.indexOf('?');
  if (queryAt < 0) return path;
  const pathname = path.slice(0, queryAt);
  const params = new URLSearchParams(path.slice(queryAt + 1));
  for (const key of ADVERTISING_CLICK_ID_KEYS) params.delete(key);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function navParamKeys(allowed: boolean, extra: readonly string[] = []): string[] {
  const keys: string[] = [...OPERATIONAL_NAV_PARAM_KEYS];
  if (allowed) keys.push(...ADVERTISING_CLICK_ID_KEYS);
  for (const key of extra) {
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

export function copyNavParams(
  searchParams: { get: (key: string) => string | null } | null | undefined,
  allowed: boolean,
  extra: readonly string[] = [],
): URLSearchParams {
  const params = new URLSearchParams();
  if (!searchParams) return params;
  for (const key of navParamKeys(allowed, extra)) {
    const value = searchParams.get(key);
    if (value) params.set(key, value);
  }
  return params;
}

export function redactAdvertisingClickIdsFromFunnelPayload<T>(payload: T, allowed: boolean): T {
  if (allowed || !payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const body = payload as Record<string, unknown>;
  const next: Record<string, unknown> = { ...body };
  if (typeof next.path === 'string') next.path = pathWithoutDisallowedClickIds(next.path, false);
  if (next.meta && typeof next.meta === 'object' && !Array.isArray(next.meta)) {
    next.meta = omitDisallowedAdvertisingClickIds(next.meta as Record<string, unknown>, false);
  }
  if (next.utm && typeof next.utm === 'object' && !Array.isArray(next.utm)) {
    next.utm = omitDisallowedAdvertisingClickIds(next.utm as Record<string, unknown>, false);
  }
  return next as T;
}

/** Denied, unreadable, or not yet in a browser all refuse advertising click ids. */
export function resolveAdvertisingClickIdPermission(input: {
  hasDocument: boolean;
  readAllowed: () => boolean;
}): boolean {
  if (!input.hasDocument) return false;
  try {
    return input.readAllowed() === true;
  } catch {
    return false;
  }
}
