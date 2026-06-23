/**
 * Simplified Text-a-Friend from the score page: SMS opens immediately with /sample-chapters link.
 * Legacy modal + /t/fb1 paths remain in TextAFriendModal.tsx for rollback and old SMS links.
 */

import { readContestEmail } from '@/lib/identity';
import { TEXT_A_FRIEND_SITE_URL } from '@/lib/textAFriendOg';

const SAMPLE_CHAPTERS_PATH = '/sample-chapters';

export function buildSampleChaptersShareUrl(referralCode: string | null | undefined): string {
  const path = `${TEXT_A_FRIEND_SITE_URL}${SAMPLE_CHAPTERS_PATH}`;
  const code = referralCode?.trim();
  if (!code) return path;
  const u = new URL(path);
  u.searchParams.set('ref', code);
  return u.toString();
}

export function buildScoreTextAFriendSmsBody(referralCode: string | null | undefined): string {
  const url = buildSampleChaptersShareUrl(referralCode);
  return `Hey—came across this and thought of you.

Take a look when you have a second.

Let me know what you think.

${url}`;
}

function trackTextFriendShared(): void {
  const email = readContestEmail();
  if (!email) return;

  fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'TEXT_FRIEND_SHARED',
      email,
      meta: { option: 'sample_chapters' },
    }),
    keepalive: true,
  }).catch(() => {});

  fetch('/api/points/award', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Email': email },
    body: JSON.stringify({ action: 'text_friend_shared' }),
    keepalive: true,
  }).catch(() => {});
}

/** Fire tracking/points then open the device SMS editor with sample-chapters link. */
export function openScoreTextAFriendSms(referralCode: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  trackTextFriendShared();
  const body = buildScoreTextAFriendSmsBody(referralCode);
  window.location.href = `sms:?body=${encodeURIComponent(body)}`;
}
