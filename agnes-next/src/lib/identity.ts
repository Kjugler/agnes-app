export type AssociateCache = {
  id: string;
  email: string;
  name: string;
  code: string;
};

const ASSOCIATE_KEY = 'associate';
const ASSOCIATE_ID_KEY = 'associate_id';
const ASSOCIATE_EMAIL_KEY = 'associate_email';
const CONTEST_EMAIL_KEY = 'contest_email';
const REF_KEY = 'ref';
const DISCOUNT_KEY = 'discount_code';
const AP_CODE_KEY = 'ap_code';
const USER_EMAIL_KEY = 'user_email';
const MOCK_EMAIL_KEY = 'mockEmail';
const POINTS_FLAG_KEY = 'contest:has-points';

function safeGet(key: string) {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch (err) {
    console.warn('[identity] read failed', key, err);
    return null;
  }
}

function safeSet(key: string, value: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch (err) {
    console.warn('[identity] write failed', key, err);
  }
}

export function writeContestEmail(email: string) {
  safeSet(CONTEST_EMAIL_KEY, email);
}

export function readAssociate(): AssociateCache | null {
  const raw = safeGet(ASSOCIATE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AssociateCache;
    if (parsed && parsed.id && parsed.email) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function writeAssociate(cache: AssociateCache) {
  safeSet(ASSOCIATE_KEY, JSON.stringify(cache));
  safeSet(ASSOCIATE_ID_KEY, cache.id);
  safeSet(ASSOCIATE_EMAIL_KEY, cache.email);
  safeSet(CONTEST_EMAIL_KEY, cache.email);
  safeSet(AP_CODE_KEY, cache.code);
  safeSet(DISCOUNT_KEY, cache.code);
  safeSet(REF_KEY, cache.code);
  safeSet(USER_EMAIL_KEY, cache.email);
  safeSet(MOCK_EMAIL_KEY, cache.email);
}

export function clearAssociateCaches(options?: { keepContestEmail?: boolean }) {
  safeSet(ASSOCIATE_KEY, null);
  safeSet(ASSOCIATE_ID_KEY, null);
  safeSet(ASSOCIATE_EMAIL_KEY, null);
  safeSet(AP_CODE_KEY, null);
  safeSet(DISCOUNT_KEY, null);
  safeSet(REF_KEY, null);
  safeSet(USER_EMAIL_KEY, null);
  safeSet(MOCK_EMAIL_KEY, null);
  safeSet(POINTS_FLAG_KEY, null);
  if (!options?.keepContestEmail) {
    safeSet(CONTEST_EMAIL_KEY, null);
  }
}

function normalize(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim().toLowerCase() : null;
}

function readCookieValue(key: string) {
  if (typeof document === 'undefined') return null;
  const prefix = `${key}=`;
  const entry = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!entry) return null;
  const raw = entry.slice(prefix.length);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function bootstrapContestEmail() {
  if (typeof window === 'undefined') return null;

  const existing = safeGet(CONTEST_EMAIL_KEY);
  const existingNormalized = normalize(existing);

  const candidates = [
    readCookieValue('mockEmail'),
    readCookieValue('user_email'),
    readCookieValue('associate_email'),
    safeGet(MOCK_EMAIL_KEY),
    safeGet(USER_EMAIL_KEY),
    safeGet(ASSOCIATE_EMAIL_KEY),
  ].filter((value): value is string => Boolean(value && value.trim().length > 0));

  const nextRaw = candidates[0]?.trim() ?? null;
  const nextNormalized = normalize(nextRaw);

  if (nextNormalized && nextNormalized !== existingNormalized) {
    const cachedAssociate = readAssociate();
    if (cachedAssociate && normalize(cachedAssociate.email) !== nextNormalized) {
      clearAssociateCaches({ keepContestEmail: true });
    }
    if (nextRaw) {
      writeContestEmail(nextRaw);
      safeSet(MOCK_EMAIL_KEY, nextRaw);
      safeSet(USER_EMAIL_KEY, nextRaw);
      safeSet(ASSOCIATE_EMAIL_KEY, nextRaw);
      return nextRaw;
    }
  }

  if (existing) return existing;

  if (nextRaw) {
    writeContestEmail(nextRaw);
    return nextRaw;
  }

  return null;
}

export function readContestEmail() {
  if (typeof window === 'undefined') return null;
  const updated = bootstrapContestEmail();
  if (updated) return updated;
  return safeGet(CONTEST_EMAIL_KEY);
}
