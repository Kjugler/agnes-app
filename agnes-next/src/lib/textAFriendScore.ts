/**
 * Simplified Text-a-Friend from the score page: SMS opens with /readers-agree link.
 * Legacy modal + /t/fb1 paths remain in TextAFriendModal.tsx for rollback and old SMS links.
 */

import { readContestEmail } from '@/lib/identity';
import { buildReadersAgreeShareUrl } from '@/lib/readerRecommendationLanding';

export function buildScoreTextAFriendSmsBody(referralCode: string | null | undefined): string {
  const url = buildReadersAgreeShareUrl(referralCode);
  return `I just finished *The Agnes Protocol*.

You've got to check this out.

Start with the free sample chapters below. If you decide to buy the book, I already got you 15% off.

This story pulled me in fast. Read the sample chapters and you'll see what I mean.

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
      meta: { option: 'readers_agree' },
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

/** Fire tracking/points then open the device SMS editor with readers-agree link. */
export function openScoreTextAFriendSms(referralCode: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  trackTextFriendShared();
  const body = buildScoreTextAFriendSmsBody(referralCode);
  window.location.href = `sms:?body=${encodeURIComponent(body)}`;
}
