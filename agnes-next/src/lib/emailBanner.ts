// agnes-next/src/lib/emailBanner.ts
// Global test contest banner injection for all emails
// Controlled by STRESS_TEST_MODE or EMAIL_CONTEST_BANNER (see emailConfig.ts)

import { shouldApplyEmailTestBanner } from './emailConfig';

/** Stable marker for dedupe (must not appear in normal email bodies). */
export const EMAIL_BETA_BANNER_MARKER = '<!--agnes-email-beta-banner-->';

// Jody bubble palette (see JodyAssistantTerminal bubbleGradient): #ff3be0 → #a100ff
const BANNER_HTML = `
${EMAIL_BETA_BANNER_MARKER}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px 0;max-width:100%;border-collapse:collapse;">
  <tr>
    <td style="background-color:#a100ff;background-image:linear-gradient(135deg,#ff3be0 0%,#a100ff 100%);padding:16px 18px;border-radius:8px;font-family:Arial,Helvetica,sans-serif;">
      <p style="margin:0 0 8px 0;font-size:15px;font-weight:bold;color:#ffffff;line-height:1.35;">
        🟣 LIVE BETA CONTEST ACTIVE
      </p>
      <p style="margin:0 0 6px 0;font-size:14px;color:#faf5ff;line-height:1.45;">
        Earn points. Invite friends. Win cash and prizes.
      </p>
      <p style="margin:0 0 10px 0;font-size:14px;color:#faf5ff;line-height:1.45;">
        Top 15% unlock The Quiet Reveal.
      </p>
      <p style="margin:0;font-size:11px;line-height:1.45;color:#e9d5ff;">
        (All purchases are simulated)
      </p>
    </td>
  </tr>
</table>
`;

const BANNER_TEXT = `🟣 LIVE BETA CONTEST ACTIVE
Earn points. Invite friends. Win cash and prizes.
Top 15% unlock The Quiet Reveal.
(All purchases are simulated)


`;

export interface ApplyBannerParams {
  html?: string;
  text?: string;
  subject?: string;
}

export interface ApplyBannerResult {
  html?: string;
  text?: string;
  subject?: string;
}

/**
 * Apply global test contest banner to email content
 */
export function applyGlobalEmailBanner({ html, text, subject }: ApplyBannerParams): ApplyBannerResult {
  // If banner is disabled, return unchanged
  if (!shouldApplyEmailTestBanner()) {
    return { html, text, subject };
  }

  // Guard against double-injection (current + legacy banner strings)
  const hasBannerMarker =
    (html &&
      (html.includes(EMAIL_BETA_BANNER_MARKER) ||
        html.includes('LIVE BETA CONTEST ACTIVE') ||
        html.includes('Public beta stress test') ||
        html.includes('PUBLIC STRESS TEST ACTIVE') ||
        html.includes('PUBLIC BETA TEST'))) ||
    (text &&
      (text.includes('LIVE BETA CONTEST ACTIVE') ||
        text.includes('Public beta stress test') ||
        text.includes('[PUBLIC BETA TEST]')));

  if (hasBannerMarker) {
    console.log('[emailBanner] Banner already present, skipping injection');
    return { html, text, subject };
  }

  const result: ApplyBannerResult = { html, text, subject };

  // Inject HTML banner if HTML body exists
  if (html) {
    result.html = BANNER_HTML + html;
  }

  if (text) {
    result.text = BANNER_TEXT + text;
  }

  // Add [PUBLIC BETA TEST] prefix to subject if not already present
  if (subject && !subject.includes('[PUBLIC BETA TEST]') && !subject.includes('[PUBLIC STRESS TEST]') && !subject.includes('[TEST CONTEST]')) {
    result.subject = `[PUBLIC BETA TEST] ${subject}`;
  }

  return result;
}

