/**
 * Presentation helpers and types for the read-only Reader Lifecycle preview.
 * No React/Next imports so the verification script can transpile this file.
 */

export const DEFAULT_PAGE_SIZE = 50;

export const OWNERSHIP_VALUES = ['purchaser', 'book_owner_gifted', 'non_purchaser', 'unknown'] as const;
export const SOURCE_VALUES = ['website', 'amazon', 'barnes_noble', 'other'] as const;
export const CONFIDENCE_VALUES = ['confirmed', 'provisional', 'mixed', 'unknown'] as const;
export const REVIEW_VALUES = ['clear', 'incomplete', 'conflicting', 'identity_review_required'] as const;
export const CONTACTABILITY_VALUES = [
  'contactable',
  'suppressed_do_not_contact',
  'no_mailable_email',
] as const;
export const CRM_STATUS_VALUES = ['active', 'inactive', 'archived'] as const;

export type Ownership = (typeof OWNERSHIP_VALUES)[number];
export type PurchaseSource = (typeof SOURCE_VALUES)[number];
export type Confidence = (typeof CONFIDENCE_VALUES)[number];
export type ReviewState = (typeof REVIEW_VALUES)[number];
export type Contactability = (typeof CONTACTABILITY_VALUES)[number];
export type CrmStatus = (typeof CRM_STATUS_VALUES)[number];

export type CommunicationCategory =
  | 'reader_recommendation_taf'
  | 'purchase_confirmation'
  | 'other'
  | string;

export type CommunicationOutcome =
  | 'accepted'
  | 'rejected'
  | 'failed'
  | 'recorded_sent_delivery_unknown'
  | 'unknown'
  | string;

export type LatestCommunication = {
  occurredAt: string | null;
  category: CommunicationCategory;
  outcome: CommunicationOutcome;
  caption: string | null;
  deliveryKnown: boolean;
  deliveryNote: string | null;
};

export type LegacyCrm = {
  source: string | null;
  readerType: string | null;
  status: string | null;
  archiveReasonCode?: string | null;
  archiveDetails?: string | null;
  archivePriorStatus?: string | null;
};

export type ReaderLifecycleListItem = {
  readerProfileId: string;
  userId: string;
  name: string;
  email: string | null;
  emailDisplay: string | null;
  hasRealEmail: boolean;
  legacy: LegacyCrm;
  ownership: string;
  sources: string[];
  confidence: string;
  contactability: string;
  review: string;
  nurtureSuppressed: boolean;
  reasons: string[];
  latestCommunication: LatestCommunication | null;
  createdAt: string | null;
};

export type ReaderLifecycleListResponse = {
  ok: true;
  items: ReaderLifecycleListItem[];
  pageSize: number;
  nextCursor: string | null;
  hasMore: boolean;
  partial: boolean;
  totalCount: null;
};

export type LifecycleListFilters = {
  q: string;
  ownership: string;
  purchaseSource: string;
  confidence: string;
  review: string;
  contactability: string;
  status: string;
  includeArchived: boolean;
};

export const EMPTY_FILTERS: LifecycleListFilters = {
  q: '',
  ownership: '',
  purchaseSource: '',
  confidence: '',
  review: '',
  contactability: '',
  status: '',
  includeArchived: false,
};

export type PreviewErrorKind =
  | 'unauthorized'
  | 'not_configured'
  | 'unavailable'
  | 'not_found'
  | 'generic';

export type AccentTone =
  | 'purchaser'
  | 'provisional'
  | 'review'
  | 'dnc'
  | 'nonPurchaser'
  | 'gifted'
  | 'unknown';

const OWNERSHIP_LABELS: Record<string, string> = {
  purchaser: 'Purchaser',
  book_owner_gifted: 'Book Owner—Gifted',
  non_purchaser: 'Non-purchaser',
  unknown: 'Unknown',
};

const SOURCE_LABELS: Record<string, string> = {
  website: 'Website',
  amazon: 'Amazon',
  barnes_noble: 'Barnes & Noble',
  other: 'Other',
};

const CONFIDENCE_LABELS: Record<string, string> = {
  confirmed: 'Confirmed',
  provisional: 'Provisional',
  mixed: 'Mixed',
  unknown: 'Unknown',
};

const REVIEW_LABELS: Record<string, string> = {
  clear: 'Clear',
  incomplete: 'Incomplete',
  conflicting: 'Conflicting',
  identity_review_required: 'Identity Review Required',
};

const CONTACT_LABELS: Record<string, string> = {
  contactable: 'Locally contactable',
  suppressed_do_not_contact: 'Manual DNC',
  no_mailable_email: 'No mailable email',
};

const CATEGORY_LABELS: Record<string, string> = {
  reader_recommendation_taf: 'Reader recommendation',
  purchase_confirmation: 'Purchase confirmation',
  other: 'Other',
};

const OUTCOME_LABELS: Record<string, string> = {
  accepted: 'Accepted',
  rejected: 'Rejected',
  failed: 'Failed',
  recorded_sent_delivery_unknown: 'Recorded as sent; delivery unknown',
  unknown: 'Outcome unknown',
};

const CRM_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
  archived: 'Archived',
};

export function humanizeCode(raw: unknown, labels: Record<string, string>): string {
  if (raw == null || raw === '') return 'Unknown';
  const code = String(raw);
  if (labels[code]) return labels[code];
  const titled = code
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
  return titled || 'Unknown';
}

export function ownershipLabel(value: unknown): string {
  return humanizeCode(value, OWNERSHIP_LABELS);
}

export function sourceLabel(value: unknown): string {
  return humanizeCode(value, SOURCE_LABELS);
}

export function sourcesLabel(sources: unknown): string {
  if (!Array.isArray(sources) || sources.length === 0) return 'None recorded';
  const labels = sources.map((s) => sourceLabel(s));
  if (labels.length === 1) return labels[0];
  return labels.join(' + ');
}

export function confidenceLabel(value: unknown): string {
  return humanizeCode(value, CONFIDENCE_LABELS);
}

export function reviewLabel(value: unknown): string {
  return humanizeCode(value, REVIEW_LABELS);
}

export function contactabilityLabel(value: unknown): string {
  return humanizeCode(value, CONTACT_LABELS);
}

export function isConflictingReview(item: Pick<ReaderLifecycleListItem, 'review'>): boolean {
  return item.review === 'conflicting';
}

export function listOwnershipLabel(item: Pick<ReaderLifecycleListItem, 'ownership' | 'review'>): string {
  if (isConflictingReview(item)) return 'Ownership unresolved';
  return ownershipLabel(item.ownership);
}

export function listReviewSummary(item: Pick<ReaderLifecycleListItem, 'confidence' | 'review'>): {
  primary: string;
  secondary: string | null;
} {
  if (isConflictingReview(item)) {
    return { primary: 'Conflicting evidence', secondary: null };
  }
  return { primary: confidenceLabel(item.confidence), secondary: reviewLabel(item.review) };
}

export function listContactLabel(
  item: Pick<ReaderLifecycleListItem, 'contactability' | 'review'> & {
    legacy?: { status?: string | null } | null;
  },
): string {
  if (isConflictingReview(item)) return 'Nurture paused until resolved';
  if (item.legacy?.status === 'archived') {
    if (item.contactability === 'suppressed_do_not_contact') return 'Manual DNC';
    return 'Archived — outreach paused';
  }
  if (item.contactability === 'contactable') return 'Locally contactable*';
  return contactabilityLabel(item.contactability);
}

export function categoryLabel(value: unknown): string {
  return humanizeCode(value, CATEGORY_LABELS);
}

export function outcomeLabel(value: unknown): string {
  return humanizeCode(value, OUTCOME_LABELS);
}

export function crmStatusLabel(value: unknown): string {
  return humanizeCode(value, CRM_STATUS_LABELS);
}

export function emailDisplay(item: Pick<ReaderLifecycleListItem, 'email' | 'hasRealEmail' | 'emailDisplay'>): string {
  if (item.hasRealEmail && item.email) return item.email;
  return 'No mailable email.';
}

export function communicationTypeLabel(comm: LatestCommunication | null): string {
  if (!comm) return 'None recorded';
  return categoryLabel(comm.category);
}

export function communicationOutcomeCaption(comm: LatestCommunication | null): string {
  if (!comm) return 'No communication recorded';
  const parts = [outcomeLabel(comm.outcome)];
  if (comm.caption) parts.push(comm.caption);
  if (comm.deliveryKnown !== true) {
    parts.push(comm.deliveryNote || 'Delivery is unknown.');
  }
  return parts.join(' — ');
}

export function communicationListSummary(comm: LatestCommunication | null): string {
  if (!comm) return 'None recorded';
  const parts = [categoryLabel(comm.category)];
  const date = formatOccurredAt(comm.occurredAt);
  if (date !== '—') parts.push(date);
  parts.push(comm.deliveryKnown === true ? 'Delivery recorded' : 'Delivery unknown');
  return parts.join(' · ');
}

export function formatOccurredAt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function accentTone(item: ReaderLifecycleListItem): AccentTone {
  if (item.review === 'conflicting' || item.review === 'identity_review_required') return 'review';
  if (item.contactability === 'suppressed_do_not_contact') return 'dnc';
  if (item.review === 'incomplete' || item.confidence === 'provisional' || item.confidence === 'mixed') {
    return 'provisional';
  }
  if (item.ownership === 'purchaser' && item.confidence === 'confirmed') return 'purchaser';
  if (item.ownership === 'book_owner_gifted') return 'gifted';
  if (item.ownership === 'non_purchaser') return 'nonPurchaser';
  return 'unknown';
}

export function buildListQuery(filters: LifecycleListFilters, cursor: string | null): URLSearchParams {
  const params = new URLSearchParams();
  params.set('pageSize', String(DEFAULT_PAGE_SIZE));
  const q = filters.q.trim();
  if (q) params.set('q', q);
  if (filters.ownership) params.set('ownership', filters.ownership);
  if (filters.purchaseSource) params.set('purchaseSource', filters.purchaseSource);
  if (filters.confidence) params.set('confidence', filters.confidence);
  if (filters.review) params.set('review', filters.review);
  if (filters.contactability) params.set('contactability', filters.contactability);
  if (filters.status) params.set('status', filters.status);
  else if (filters.includeArchived) params.set('includeArchived', 'true');
  if (cursor) params.set('cursor', cursor);
  return params;
}

export function filtersEqual(a: LifecycleListFilters, b: LifecycleListFilters): boolean {
  return (
    a.q.trim() === b.q.trim() &&
    a.ownership === b.ownership &&
    a.purchaseSource === b.purchaseSource &&
    a.confidence === b.confidence &&
    a.review === b.review &&
    a.contactability === b.contactability &&
    a.status === b.status &&
    a.includeArchived === b.includeArchived
  );
}

export type CursorHistory = {
  stack: Array<string | null>;
  current: string | null;
};

export function initialCursorHistory(): CursorHistory {
  return { stack: [], current: null };
}

export function goNextPage(history: CursorHistory, nextCursor: string): CursorHistory {
  return {
    stack: [...history.stack, history.current],
    current: nextCursor,
  };
}

export function goPreviousPage(history: CursorHistory): CursorHistory {
  if (history.stack.length === 0) return history;
  const stack = history.stack.slice(0, -1);
  const current = history.stack[history.stack.length - 1];
  return { stack, current };
}

export function resetCursorHistory(): CursorHistory {
  return initialCursorHistory();
}

export function classifyHttpError(status: number, errorCode?: string): PreviewErrorKind {
  if (status === 401 || errorCode === 'unauthorized') return 'unauthorized';
  if (status === 404 || errorCode === 'Not found' || errorCode === 'not_found') return 'not_found';
  if (status === 500 || errorCode === 'admin_not_configured') return 'not_configured';
  if (status === 502 || errorCode === 'proxy_unavailable') return 'unavailable';
  return 'generic';
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function asStringOrNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value);
  return s.length ? s : null;
}

function asBool(value: unknown): boolean {
  return value === true;
}

export function parseLatestCommunication(raw: unknown): LatestCommunication | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  return {
    occurredAt: asStringOrNull(row.occurredAt),
    category: asString(row.category) || 'unknown',
    outcome: asString(row.outcome) || 'unknown',
    caption: asStringOrNull(row.caption),
    deliveryKnown: row.deliveryKnown === true,
    deliveryNote: asStringOrNull(row.deliveryNote),
  };
}

export function parseListItem(raw: unknown): ReaderLifecycleListItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const readerProfileId = asString(row.readerProfileId);
  const userId = asString(row.userId);
  if (!readerProfileId && !userId) return null;
  const legacyRaw = row.legacy && typeof row.legacy === 'object' ? (row.legacy as Record<string, unknown>) : {};
  const sources = Array.isArray(row.sources) ? row.sources.map((s) => String(s)) : [];
  const reasons = Array.isArray(row.reasons) ? row.reasons.map((s) => String(s)) : [];
  return {
    readerProfileId,
    userId,
    name: asString(row.name) || 'Unnamed reader',
    email: asStringOrNull(row.email),
    emailDisplay: asStringOrNull(row.emailDisplay),
    hasRealEmail: asBool(row.hasRealEmail),
    legacy: {
      source: asStringOrNull(legacyRaw.source),
      readerType: asStringOrNull(legacyRaw.readerType),
      status: asStringOrNull(legacyRaw.status),
      archiveReasonCode: asStringOrNull(legacyRaw.archiveReasonCode),
      archiveDetails: asStringOrNull(legacyRaw.archiveDetails),
      archivePriorStatus: asStringOrNull(legacyRaw.archivePriorStatus),
    },
    ownership: asString(row.ownership) || 'unknown',
    sources,
    confidence: asString(row.confidence) || 'unknown',
    contactability: asString(row.contactability) || 'unknown',
    review: asString(row.review) || 'unknown',
    nurtureSuppressed: asBool(row.nurtureSuppressed),
    reasons,
    latestCommunication: parseLatestCommunication(row.latestCommunication),
    createdAt: asStringOrNull(row.createdAt),
  };
}

export function parseListResponse(raw: unknown): {
  items: ReaderLifecycleListItem[];
  nextCursor: string | null;
  hasMore: boolean;
  partial: boolean;
  pageSize: number;
} {
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const itemsRaw = Array.isArray(body.items) ? body.items : [];
  const items = itemsRaw.map(parseListItem).filter((row): row is ReaderLifecycleListItem => row !== null);
  return {
    items,
    nextCursor: typeof body.nextCursor === 'string' && body.nextCursor ? body.nextCursor : null,
    hasMore: body.hasMore === true,
    partial: body.partial === true,
    pageSize: typeof body.pageSize === 'number' && body.pageSize > 0 ? body.pageSize : DEFAULT_PAGE_SIZE,
  };
}

export const LIVE_READONLY_BANNER =
  'LIVE READER LIFECYCLE BETA — Viewing live administrative records. Changes and emails are disabled.';

export const SYNTHETIC_PREVIEW_BANNER = 'LOCAL SYNTHETIC PREVIEW — Test records only.';

export const LIVE_EDITING_BANNER =
  'LIVE READER LIFECYCLE BETA — Changes affect live administrative records. No email, nurture, or Text-a-Friend request will be sent.';

/** @deprecated Use LIVE_READONLY_BANNER / readerLifecycleBannerText(). */
export const READ_ONLY_BANNER = LIVE_READONLY_BANNER;

export const EDITING_ENABLED_ENV = 'READER_LIFECYCLE_EDITING_ENABLED';
export const SYNTHETIC_PREVIEW_ENV = 'READER_LIFECYCLE_SYNTHETIC_PREVIEW';
export const FLAG_ENABLED_VALUE = '1';
export const LOOPBACK_HOSTS = Object.freeze(['localhost', '127.0.0.1', '::1']);

export function envFlagExactlyOne(value: string | undefined | null): boolean {
  return value === FLAG_ENABLED_VALUE;
}

export function readerLifecycleEditingEnabled(
  env: { [key: string]: string | undefined } = process.env,
): boolean {
  return envFlagExactlyOne(env[EDITING_ENABLED_ENV]);
}

export function configuredDeepquillBackendUrl(
  env: { [key: string]: string | undefined } = process.env,
): string | undefined {
  const preferred = env.DEEPQUILL_URL;
  if (typeof preferred === 'string' && preferred.length > 0) return preferred;
  const fallback = env.NEXT_PUBLIC_API_BASE_URL;
  if (typeof fallback === 'string' && fallback.length > 0) return fallback;
  return undefined;
}

export function backendUrlIsAllowlistedLoopback(raw: string | undefined | null): boolean {
  if (typeof raw !== 'string' || raw.length === 0) return false;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (parsed.username !== '' || parsed.password !== '') return false;
  const hostname = parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
    ? parsed.hostname.slice(1, -1)
    : parsed.hostname;
  for (const allowed of LOOPBACK_HOSTS) {
    if (hostname === allowed) return true;
  }
  return false;
}

export function readerLifecycleSyntheticPreview(
  env: { [key: string]: string | undefined } = process.env,
): boolean {
  return (
    envFlagExactlyOne(env[SYNTHETIC_PREVIEW_ENV]) &&
    backendUrlIsAllowlistedLoopback(configuredDeepquillBackendUrl(env))
  );
}

export function readerLifecycleBannerText(
  env: { [key: string]: string | undefined } = process.env,
): string {
  if (readerLifecycleSyntheticPreview(env)) return SYNTHETIC_PREVIEW_BANNER;
  if (readerLifecycleEditingEnabled(env)) return LIVE_EDITING_BANNER;
  return LIVE_READONLY_BANNER;
}

export const PROVIDER_WARNING =
  'Email-provider suppression status is not yet integrated. “Contactable” does not mean approved or safe to email.';

export const CONTACTABLE_ASTERISK_NOTE =
  '* “Locally contactable” is a local record only. Provider suppression status is not yet integrated.';

export const LIST_FILTER_HEADING = 'FILTER THE READER LIST';
export const LIST_FILTER_EXPLANATION = 'These controls do not change reader records.';

export const LIST_PROXY_PATH = '/api/admin/reader-lifecycle/readers';
export const LIST_PREVIEW_PATH = '/admin/reader-lifecycle-preview';

export function detailPreviewPath(readerProfileId: string): string {
  return `${LIST_PREVIEW_PATH}/${encodeURIComponent(readerProfileId)}`;
}

export function detailProxyPath(readerProfileId: string): string {
  return `${LIST_PROXY_PATH}/${encodeURIComponent(readerProfileId)}`;
}

export const FULFILLMENT_AUTH_HREF =
  '/admin/fulfillment/auth?redirect=/admin/reader-lifecycle-preview';
