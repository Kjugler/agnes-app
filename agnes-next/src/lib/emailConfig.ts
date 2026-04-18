/**
 * Transactional email behavior (agnes-next).
 *
 * Legacy: STRESS_TEST_MODE / EMAIL_CONTEST_BANNER used to inject a global HTML banner and
 * subject prefix. That path is removed; emails render as authored.
 *
 * Client/UI stress-test chrome (catalog/checkout notices) uses NEXT_PUBLIC_STRESS_TEST_MODE only.
 */

/** @deprecated Always false — global email banner injection disabled */
export function shouldApplyEmailTestBanner(): boolean {
  return false;
}

/**
 * When true, transactional emails (reminders, commission, etc.) are sent.
 * When false, no transactional emails are sent — predictable test behavior.
 */
export function shouldSendTransactionalEmails(): boolean {
  return process.env.TRANSACTIONAL_EMAIL_ENABLED === '1';
}
