/**
 * Phase 1 — "Text This Scene" on sample chapter readers.
 * Link always targets chapter 9; SMS pattern matches TextAFriendModal (`sms:?body=`).
 */

const CANONICAL_ORIGIN = 'https://www.theagnesprotocol.com';
const CHAPTER_9_PATH = '/sample-chapters/read/9';

export function buildTextThisSceneShareUrl(referralCode: string | null | undefined): string {
  const path = `${CANONICAL_ORIGIN}${CHAPTER_9_PATH}`;
  const code = referralCode?.trim();
  if (!code) return path;
  const u = new URL(path);
  u.searchParams.set('ref', code);
  return u.toString();
}

/**
 * Fixed copy; blank line before URL preserved for link-preview behavior in threads.
 */
export function buildTextThisSceneSmsBody(referralCode: string | null | undefined): string {
  const url = buildTextThisSceneShareUrl(referralCode);
  return `This part stood out to me.

Curious what you think.

${url}`;
}

export function openSmsWithPrefilledBody(body: string): void {
  if (typeof window === 'undefined') return;
  window.location.href = `sms:?body=${encodeURIComponent(body)}`;
}
