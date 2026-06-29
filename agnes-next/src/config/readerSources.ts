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

export type ReaderSource = (typeof READER_SOURCES)[number];

export type ReaderRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  source: string;
  readerType: string;
  readerTypeLabel: string;
  status: string;
  statusLabel: string;
  referralCode: string;
  dateAdded: string;
  lastActivity: string | null;
};

export type ReaderDetail = ReaderRow & {
  firstName: string;
  lastName: string;
  notes: string;
  textAFriendUrl: string;
  sampleChaptersUrl: string;
  userCreatedAt: string;
};
