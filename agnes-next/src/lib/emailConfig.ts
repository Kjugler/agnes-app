/**
 * Centralized email configuration for stress test / test mode.
 * Single source of truth for transactional email behavior.
 *
 * CANONICAL STRESS-TEST FLAG STRATEGY
 * -----------------------------------
 * - STRESS_TEST_MODE=1       Master server-side flag. When set, email stress-test
 *                            messaging turns on automatically (subject prefix + body note).
 * - NEXT_PUBLIC_STRESS_TEST_MODE=1  Client/UI flag for banners, share captions, etc.
 * - EMAIL_CONTEST_BANNER=1   Legacy override; still supported. Prefer STRESS_TEST_MODE.
 *
 * For public beta: set STRESS_TEST_MODE=1 in agnes-next and deepquill .env.
 * No separate manual email-only toggle needed.
 */

/** When true, apply test banner to all transactional emails */
export function shouldApplyEmailTestBanner(): boolean {
  return (
    process.env.STRESS_TEST_MODE === '1' ||
    process.env.EMAIL_CONTEST_BANNER === '1'
  );
}

/**
 * When true, transactional emails (reminders, commission, etc.) are sent.
 * When false, no transactional emails are sent — predictable test behavior.
 */
export function shouldSendTransactionalEmails(): boolean {
  return process.env.TRANSACTIONAL_EMAIL_ENABLED === '1';
}
