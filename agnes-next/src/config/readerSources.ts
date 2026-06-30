export const READER_SOURCES = [
  'Barnes & Noble',
  'Amazon',
  'Website',
  'Gift',
  'Book Signing',
  'Friend Referral',
  'Facebook',
  'Instagram',
  'TikTok',
  'X',
  'Truth Social',
  'Microsoft Ads',
  'Google Ads',
  'Other',
] as const;

export const READER_TYPES = [
  { value: 'purchased', label: 'Purchased Book' },
  { value: 'gifted', label: 'Gifted Book' },
  { value: 'interested', label: 'Interested Reader' },
] as const;

export const READER_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
] as const;

export const SMS_CONSENT_SOURCES = [
  'Book Signing',
  'In person',
  'Phone call',
  'Event booth',
  'Other',
] as const;

export type ReaderSource = (typeof READER_SOURCES)[number];

export type ReaderRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  displayEmail: string | null;
  hasRealEmail: boolean;
  phone: string;
  source: string;
  readerType: string;
  readerTypeLabel: string;
  status: string;
  statusLabel: string;
  referralCode: string;
  dateAdded: string;
  lastActivity: string | null;
  smsConsentGranted: boolean;
  smsConsentAt: string | null;
  smsConsentSource: string;
};

export type ReaderDetail = ReaderRow & {
  firstName: string;
  lastName: string;
  notes: string;
  smsConsentNotes: string;
  contactKind: string;
  textAFriendUrl: string;
  sampleChaptersUrl: string;
  userCreatedAt: string;
};

/** Format email for admin display — never show synthetic CRM placeholders. */
export function formatReaderEmailDisplay(reader: {
  displayEmail?: string | null;
  hasRealEmail?: boolean;
  email?: string;
}): string {
  if (reader.displayEmail) return reader.displayEmail;
  if (reader.hasRealEmail && reader.email) return reader.email;
  return '—';
}

export function formatReaderPhoneDisplay(phone?: string | null): string {
  const trimmed = (phone || '').trim();
  return trimmed || '—';
}

export function formatSmsConsentSummary(reader: {
  smsConsentGranted: boolean;
  smsConsentSource?: string;
}): string {
  if (!reader.smsConsentGranted) return 'No';
  return reader.smsConsentSource ? `Yes (${reader.smsConsentSource})` : 'Yes';
}
