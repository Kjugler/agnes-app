const BLOCKED_EMAILS = new Set(['me@here.com', 'test@test.com', 'noreply@noreply.com']);
const BLOCKED_DOMAINS = new Set(['example.com', 'example.org', 'test.com', 'here.com']);
const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function describeEmailTypo(domain: string): string | null {
  const lower = domain.toLowerCase();
  if (lower.endsWith('.comh') || lower.endsWith('.con') || lower.endsWith('.cmo')) {
    return 'Check the email domain — it looks like there may be a typo (for example "gmail.comh" instead of "gmail.com").';
  }
  if (/\.com[a-z]{2,}$/.test(lower) && !lower.endsWith('.com')) {
    return 'Check the email domain — it looks like ".com" may have extra characters.';
  }
  return null;
}

export type ReaderEmailValidationOptions = {
  required?: boolean;
  hadRealEmail?: boolean;
  hasPhone?: boolean;
  hasNameAndNotes?: boolean;
};

export function validateReaderEmail(
  emailRaw: string,
  options: ReaderEmailValidationOptions = {},
): { ok: true } | { ok: false; error: string } {
  const {
    required = false,
    hadRealEmail = false,
    hasPhone = false,
    hasNameAndNotes = false,
  } = options;

  const trimmed = emailRaw.trim();

  if (!trimmed) {
    if (required) {
      return { ok: false, error: 'Please enter an email address.' };
    }
    if (hadRealEmail && !hasPhone && !hasNameAndNotes) {
      return {
        ok: false,
        error:
          'This reader needs an email address, a phone number, or a name plus notes. Email cannot be removed without another way to identify them.',
      };
    }
    return { ok: true };
  }

  const normalized = trimmed.toLowerCase();
  if (!normalized.includes('@') || !EMAIL_FORMAT_RE.test(normalized)) {
    return {
      ok: false,
      error: 'That does not look like a valid email address. Please check the spelling and try again.',
    };
  }

  if (normalized.endsWith('@reader.crm')) {
    return {
      ok: false,
      error: 'Please enter a real email address, not an internal placeholder.',
    };
  }

  if (BLOCKED_EMAILS.has(normalized)) {
    return {
      ok: false,
      error: `"${trimmed}" looks like a placeholder address. Please enter the reader's real email.`,
    };
  }

  const domain = normalized.split('@')[1] || '';
  if (BLOCKED_DOMAINS.has(domain)) {
    return {
      ok: false,
      error: `"${domain}" is not allowed for production readers. Please use the reader's real email address.`,
    };
  }

  const typoHint = describeEmailTypo(domain);
  if (typoHint) {
    return { ok: false, error: typoHint };
  }

  return { ok: true };
}

export function hasMeaningfulReaderIdentifier(input: {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  notes: string;
}): boolean {
  const email = input.email.trim();
  const phoneDigits = input.phone.replace(/\D/g, '');
  const hasName = Boolean(input.firstName.trim() || input.lastName.trim());
  const hasNotes = input.notes.trim().length >= 3;
  return Boolean(email || phoneDigits.length >= 10 || (hasName && hasNotes));
}
