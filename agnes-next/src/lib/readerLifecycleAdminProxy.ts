/**
 * Server-only GET proxy for Reader Manager lifecycle reads.
 * Browser auth: fulfillment-token cookie must equal FULFILLMENT_ACCESS_TOKEN.
 * The cookie is the trimmed plaintext token set by POST /api/fulfillment/auth
 * (not signed, hashed, or wrapped). Deepquill auth uses server-side ADMIN_KEY
 * as x-admin-key. Never forwarded from the client.
 *
 * Do not import this module from Client Components.
 */

import { timingSafeEqual } from 'node:crypto';

export const FULFILLMENT_TOKEN_COOKIE = 'fulfillment-token';
export const BACKEND_NAMESPACE = '/api/admin/reader-lifecycle';
export const MAX_QUERY_STRING_LENGTH = 2048;
export const MAX_ID_LENGTH = 128;
export const PROXY_FETCH_TIMEOUT_MS = 20_000;

export const JSON_ERROR = Object.freeze({
  unauthorized: { ok: false, error: 'unauthorized' },
  adminNotConfigured: { ok: false, error: 'admin_not_configured' },
  invalidRequest: { ok: false, error: 'invalid_request' },
  proxyUnavailable: { ok: false, error: 'proxy_unavailable' },
});

export type ReaderLifecycleRoute =
  | 'readers'
  | 'readerByProfileId'
  | 'readerByUserId'
  | 'reviewQueue'
  | 'communications'
  | 'purchasesWithoutProfile';

export type ReaderLifecycleProxyTarget =
  | { route: 'readers' }
  | { route: 'readerByProfileId'; readerProfileId: string }
  | { route: 'readerByUserId'; userId: string }
  | { route: 'reviewQueue' }
  | { route: 'communications' }
  | { route: 'purchasesWithoutProfile' };

export type ReaderLifecycleProxyDeps = {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  log?: (event: { code: string }) => void;
};

export const FIXED_BACKEND_PATHS = Object.freeze({
  readers: `${BACKEND_NAMESPACE}/readers`,
  reviewQueue: `${BACKEND_NAMESPACE}/review-queue`,
  communications: `${BACKEND_NAMESPACE}/communications`,
  purchasesWithoutProfile: `${BACKEND_NAMESPACE}/purchases-without-profile`,
});

type CookieBag = { get: (name: string) => { value: string } | undefined };

function noStoreJson(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}

function noStoreJsonText(text: string, status: number): Response {
  return new Response(text, {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}

export function readFulfillmentToken(req: Request): string {
  const cookieBag = (req as Request & { cookies?: CookieBag }).cookies;
  if (cookieBag && typeof cookieBag.get === 'function') {
    const value = cookieBag.get(FULFILLMENT_TOKEN_COOKIE)?.value;
    return typeof value === 'string' ? value.trim() : '';
  }

  const header = req.headers.get('cookie');
  if (!header) return '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    if (name !== FULFILLMENT_TOKEN_COOKIE) continue;
    const raw = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(raw).trim();
    } catch {
      return raw.trim();
    }
  }
  return '';
}

export function resolveBackendBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = String(env.DEEPQUILL_URL || env.NEXT_PUBLIC_API_BASE_URL || '').trim();
  if (!raw) return null;
  const stripped = raw.replace(/\/+$/, '');
  try {
    const parsed = new URL(stripped);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!parsed.hostname) return null;
    return stripped;
  } catch {
    return null;
  }
}

export function resolveAdminKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const key = env.ADMIN_KEY?.trim();
  return key ? key : null;
}

export function resolveFulfillmentAccessToken(env: NodeJS.ProcessEnv = process.env): string | null {
  const token = env.FULFILLMENT_ACCESS_TOKEN?.trim();
  return token ? token : null;
}

export function timingSafeEqualString(provided: unknown, expected: unknown): boolean {
  try {
    const a = Buffer.from(typeof provided === 'string' ? provided : String(provided ?? ''), 'utf8');
    const b = Buffer.from(typeof expected === 'string' ? expected : String(expected ?? ''), 'utf8');
    if (a.length !== b.length) {
      if (a.length > 0) timingSafeEqual(a, a);
      return false;
    }
    if (a.length === 0) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function fulfillmentCookieMatches(cookieValue: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const expected = resolveFulfillmentAccessToken(env);
  if (!expected) return false;
  return timingSafeEqualString(cookieValue, expected);
}

export function queryStringTooLong(search: string): boolean {
  return search.length > MAX_QUERY_STRING_LENGTH;
}

export function encodePathId(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_ID_LENGTH) return null;
  if (raw === '.' || raw === '..' || raw.includes('..')) return null;
  if (/[/\\?#\s]/.test(raw)) return null;
  return encodeURIComponent(raw);
}

export function backendPathFor(target: ReaderLifecycleProxyTarget): string | null {
  switch (target.route) {
    case 'readers':
      return FIXED_BACKEND_PATHS.readers;
    case 'reviewQueue':
      return FIXED_BACKEND_PATHS.reviewQueue;
    case 'communications':
      return FIXED_BACKEND_PATHS.communications;
    case 'purchasesWithoutProfile':
      return FIXED_BACKEND_PATHS.purchasesWithoutProfile;
    case 'readerByProfileId': {
      const id = encodePathId(target.readerProfileId);
      if (!id) return null;
      return `${FIXED_BACKEND_PATHS.readers}/${id}`;
    }
    case 'readerByUserId': {
      const id = encodePathId(target.userId);
      if (!id) return null;
      return `${BACKEND_NAMESPACE}/users/${id}`;
    }
    default:
      return null;
  }
}

function requestSearch(req: Request): string {
  try {
    return new URL(req.url).search || '';
  } catch {
    return '';
  }
}

function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const media = contentType.split(';')[0].trim().toLowerCase();
  return media === 'application/json' || media.endsWith('+json');
}

function emit(deps: ReaderLifecycleProxyDeps | undefined, code: string): void {
  deps?.log?.({ code });
  console.error('[admin-reader-lifecycle-proxy]', { code });
}

export async function proxyReaderLifecycleGet(
  req: Request,
  target: ReaderLifecycleProxyTarget,
  deps: ReaderLifecycleProxyDeps = {},
): Promise<Response> {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;

  const cookieToken = readFulfillmentToken(req);
  if (!cookieToken) {
    return noStoreJson(JSON_ERROR.unauthorized, 401);
  }

  const expectedFulfillmentToken = resolveFulfillmentAccessToken(env);
  const adminKey = resolveAdminKey(env);
  const baseUrl = resolveBackendBaseUrl(env);
  if (!expectedFulfillmentToken || !adminKey || !baseUrl) {
    emit(deps, 'admin_not_configured');
    return noStoreJson(JSON_ERROR.adminNotConfigured, 500);
  }

  if (!timingSafeEqualString(cookieToken, expectedFulfillmentToken)) {
    return noStoreJson(JSON_ERROR.unauthorized, 401);
  }

  const search = requestSearch(req);
  if (queryStringTooLong(search)) {
    return noStoreJson(JSON_ERROR.invalidRequest, 400);
  }

  const backendPath = backendPathFor(target);
  if (!backendPath) {
    return noStoreJson(JSON_ERROR.invalidRequest, 400);
  }

  const backendUrl = `${baseUrl}${backendPath}${search}`;

  let response: Response;
  try {
    response = await fetchImpl(backendUrl, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'x-admin-key': adminKey,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(PROXY_FETCH_TIMEOUT_MS),
    });
  } catch {
    emit(deps, 'backend_unavailable');
    return noStoreJson(JSON_ERROR.proxyUnavailable, 502);
  }

  const contentType = response.headers.get('content-type');
  let text: string;
  try {
    text = await response.text();
  } catch {
    emit(deps, 'backend_unavailable');
    return noStoreJson(JSON_ERROR.proxyUnavailable, 502);
  }

  if (!isJsonContentType(contentType)) {
    emit(deps, 'backend_non_json');
    return noStoreJson(JSON_ERROR.proxyUnavailable, 502);
  }

  try {
    JSON.parse(text);
  } catch {
    emit(deps, 'backend_non_json');
    return noStoreJson(JSON_ERROR.proxyUnavailable, 502);
  }

  return noStoreJsonText(text, response.status);
}
