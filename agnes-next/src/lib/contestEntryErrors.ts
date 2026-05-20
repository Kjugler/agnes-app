const FRIENDLY_RETRY =
  "We couldn't save your entry just now. Please wait a moment and tap Officially Enter again.";

const FRIENDLY_BY_CODE: Record<string, string> = {
  associate_service_unavailable: FRIENDLY_RETRY,
  server_error: FRIENDLY_RETRY,
  missing_user_email:
    'Your session may have expired. Refresh the page and try again.',
  email_mismatch:
    'Please use the same email you signed in with, or tap "Use this email for the contest."',
  missing_fields: 'Please fill in your first name, last name, and email.',
  invalid_request_body: 'Something went wrong with the form. Refresh and try again.',
};

/** Map API error keys to user-facing copy (never show raw associate_service_unavailable). */
export function friendlyContestEntryError(
  errorKey: string | undefined | null,
  fallback?: string,
): string {
  if (!errorKey) return fallback || FRIENDLY_RETRY;
  return FRIENDLY_BY_CODE[errorKey] || fallback || FRIENDLY_RETRY;
}
