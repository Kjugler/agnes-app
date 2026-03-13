// agnes-next/src/lib/emailBanner.ts
// Global test contest banner injection for all emails
// Controlled by STRESS_TEST_MODE or EMAIL_CONTEST_BANNER (see emailConfig.ts)

import { shouldApplyEmailTestBanner } from './emailConfig';

// Short, tasteful banner — not dominate
const BANNER_HTML = `
<p style="margin: 0 0 16px 0; padding: 12px 16px; background-color: #f8f9fa; border-left: 4px solid #6c757d; font-size: 13px; line-height: 1.5; color: #495057; font-family: Arial, Helvetica, sans-serif;">
  Public beta stress test: purchases are simulated. No real charges or deliveries will occur.
</p>
`;

// Plain text banner
const BANNER_TEXT = `Public beta stress test: purchases are simulated. No real charges or deliveries will occur.

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

  // Guard against double-injection
  const hasBannerMarker =
    (html && (html.includes('Public beta stress test') || html.includes('PUBLIC STRESS TEST ACTIVE') || html.includes('PUBLIC BETA TEST'))) ||
    (text && (text.includes('Public beta stress test') || text.includes('[PUBLIC BETA TEST]')));

  if (hasBannerMarker) {
    console.log('[emailBanner] Banner already present, skipping injection');
    return { html, text, subject };
  }

  const result: ApplyBannerResult = { html, text, subject };

  // Inject HTML banner if HTML body exists
  if (html) {
    result.html = BANNER_HTML + html;
  }

  // Inject text banner if text body exists (divider already included in BANNER_TEXT)
  if (text) {
    result.text = BANNER_TEXT + '\n\n' + text;
  }

  // Add [PUBLIC BETA TEST] prefix to subject if not already present
  if (subject && !subject.includes('[PUBLIC BETA TEST]') && !subject.includes('[PUBLIC STRESS TEST]') && !subject.includes('[TEST CONTEST]')) {
    result.subject = `[PUBLIC BETA TEST] ${subject}`;
  }

  return result;
}

