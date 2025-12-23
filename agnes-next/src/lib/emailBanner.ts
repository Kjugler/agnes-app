// agnes-next/src/lib/emailBanner.ts
// Global test contest banner injection for all emails

const EMAIL_CONTEST_BANNER = process.env.EMAIL_CONTEST_BANNER === '1';
const EMAIL_CONTEST_BANNER_MODE = process.env.EMAIL_CONTEST_BANNER_MODE || 'test';

// HTML banner (inline styles, email-safe)
const BANNER_HTML = `
<div style="background-color: #1a1a1a; border: 2px solid #00ff7f; padding: 16px 20px; margin-bottom: 24px; font-family: Arial, Helvetica, sans-serif;">
  <h2 style="margin: 0 0 12px 0; color: #00ff7f; font-size: 18px; font-weight: bold;">TEST CONTEST ACTIVE</h2>
  <p style="margin: 0 0 8px 0; color: #f5f5f5; font-size: 14px; line-height: 1.5;">You can win cash & prizes.</p>
  <p style="margin: 0 0 8px 0; color: #f5f5f5; font-size: 14px; line-height: 1.5;">Stripe Test Mode — no real charges.</p>
  <p style="margin: 0 0 8px 0; color: #f5f5f5; font-size: 14px; line-height: 1.5;">Use test card: <code style="background-color: #2a2a2a; padding: 2px 6px; border-radius: 3px; font-family: monospace;">4242 4242 4242 4242</code></p>
  <p style="margin: 0; color: #d0d0d0; font-size: 13px; line-height: 1.5;">If you experience any issues while testing the site, forward details to <a href="mailto:hello@theagnesprotocol.com" style="color: #00ff7f; text-decoration: underline;">hello@theagnesprotocol.com</a></p>
</div>
<div style="margin-bottom: 24px; text-align: center; color: #999; font-size: 12px;">—</div>
`;

// Plain text banner
const BANNER_TEXT = `[TEST CONTEST ACTIVE] You can win cash & prizes.
Stripe TEST MODE — no real charges. Use test card 4242 4242 4242 4242.
Issues? Forward details to hello@theagnesprotocol.com
---
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
  if (!EMAIL_CONTEST_BANNER) {
    return { html, text, subject };
  }

  // Guard against double-injection
  const hasBannerMarker = 
    (html && html.includes('TEST CONTEST ACTIVE')) ||
    (text && text.includes('[TEST CONTEST ACTIVE]'));

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

  // Add [TEST CONTEST] prefix to subject if not already present
  if (subject && !subject.includes('[TEST CONTEST]')) {
    result.subject = `[TEST CONTEST] ${subject}`;
  }

  return result;
}

