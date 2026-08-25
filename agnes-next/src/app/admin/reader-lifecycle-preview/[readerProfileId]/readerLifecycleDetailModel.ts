/**
 * Presentation helpers for the read-only lifecycle detail preview.
 * No React/Next imports so the verification script can transpile this file.
 */

import {
  classifyHttpError,
  communicationListSummary,
  contactabilityLabel,
  emailDisplay,
  formatOccurredAt,
  humanizeCode,
  isConflictingReview,
  listContactLabel,
  listOwnershipLabel,
  listReviewSummary,
  parseListItem,
  sourceLabel,
  sourcesLabel,
  type PreviewErrorKind,
  type ReaderLifecycleListItem,
} from '../readerLifecyclePreviewModel';

export {
  classifyHttpError,
  communicationListSummary,
  emailDisplay,
  formatOccurredAt,
  listContactLabel,
  listOwnershipLabel,
  listReviewSummary,
  sourcesLabel,
};

const CALENDAR_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function formatCalendarDate(value: string | null | undefined): string {
  if (!value) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  if (!match) return '—';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return '—';
  if (month < 1 || month > 12 || day < 1 || day > 31) return '—';
  return `${CALENDAR_MONTHS[month - 1]} ${day}, ${year}`;
}

export type LifecycleReadErrorKind = PreviewErrorKind | 'forbidden';

export function classifyLifecycleReadError(status: number, errorCode?: string): LifecycleReadErrorKind {
  if (status === 403) return 'forbidden';
  return classifyHttpError(status, errorCode);
}

export const EMPTY_HISTORY =
  'No history is available in the current Reader Lifecycle records.';

export const AUDIT_HISTORY_NOTE =
  'This is a log of administrator edits to this Reader Lifecycle record. It is not communication history and not website Purchase accounting.';

export const AUDIT_HISTORY_EMPTY = 'No administrative changes are recorded for this reader.';

export const LOAD_EARLIER_CHANGES = 'Load earlier changes';

export const OUTREACH_PAUSED =
  'Outreach is paused until this record is resolved.';

export const PURCHASE_ACCOUNTING_NOTE =
  'Website Purchase records come from the checkout/webhook system and are not changed by Reader Manager classifications.';

export const CONTACT_DECISION_NOTE =
  'The newest manual decision controls the local Do Not Contact state. Email-provider unsubscribe, complaint, rejection, and invalid-address information is not yet integrated.';

export const IDENTITY_NO_MERGE = 'No automatic merge has occurred.';

export const NURTURE_NOT_CONNECTED_TO_JOBS =
  'Local nurture suppression shown here is display-only and is not connected to sending jobs.';

export const SMS_CONSENT_NOTE =
  'This is an existing CRM record only. SMS consent is not email-marketing permission.';

export const AGGREGATE_NOT_PROOF =
  'Campaign-level information—not proof that this individual purchased.';

const EVIDENCE_KIND_LABELS: Record<string, string> = {
  website_stripe: 'Website checkout evidence',
  manual_amazon: 'Amazon purchase evidence',
  manual_bn: 'Barnes & Noble purchase evidence',
  manual_other: 'Other retailer evidence',
  gift_book_owner: 'Gifted book-owner evidence',
  kris_personal_knowledge: 'Personal-knowledge evidence',
  aggregate_marketing_not_individual: 'Aggregate campaign evidence',
};

const EVIDENCE_STATUS_LABELS: Record<string, string> = {
  confirmed: 'Current—Confirmed',
  provisional: 'Current—Provisional',
  disputed: 'Disputed',
  superseded: 'Superseded',
};

const COMM_OUTCOME_LABELS: Record<string, string> = {
  accepted: 'Accepted',
  rejected: 'Rejected',
  failed: 'Failed',
  recorded_sent_delivery_unknown: 'Recorded as sent—delivery unknown',
  unknown: 'Unknown',
};

const TRIGGER_LABELS: Record<string, string> = {
  job: 'Automatic job',
  automatic: 'Automatic job',
  webhook: 'Webhook',
  admin: 'Admin',
  unknown: 'Unknown trigger',
};

const DECISION_LABELS: Record<string, string> = {
  suppress: 'Suppress / Do Not Contact',
  allow: 'Allow / contact permitted',
};

const IDENTITY_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  dismissed: 'Resolved — dismissed',
  resolved_keep_separate: 'Resolved — keep separate',
};

const IDENTITY_REASON_LABELS: Record<string, string> = {
  duplicate_name: 'Possible duplicate name',
  similar_email: 'Similar email addresses',
  possible_wrong_website_owner: 'Possible wrong website owner',
  stripe_session_user_mismatch: 'Stripe session/user mismatch',
  other: 'Other',
};

const SALE_STATUS_LABELS: Record<string, string> = {
  live: 'Live',
  archived_beta: 'Archived beta (test) — not a live purchase',
};

const FULFILLMENT_STATUS_LABELS: Record<string, string> = {
  label_printed: 'Label printed',
  unfulfilled: 'Unfulfilled',
  fulfilled: 'Fulfilled',
  shipped: 'Shipped',
  'n/a': 'Not applicable',
  na: 'Not applicable',
};

const TEMPLATE_OR_ASK_LABELS: Record<string, string> = {
  purchase_confirmation_v1: 'Purchase confirmation—Version 1',
  ask_1: 'Ask #1',
  ask_2: 'Ask #2',
};

const EVIDENCE_REASON_LABELS: Record<string, string> = {
  live_website_purchase: 'Website purchase record',
  provisional_manual_retailer: 'Manual retailer record',
  confirmed_manual_retailer: 'Manual retailer record',
  provisional_personal_knowledge: 'Personal-knowledge record',
  gift_without_purchase: 'Gift without purchase',
  missing_purchase_date: 'Missing purchase date',
  disputed_association: 'Disputed association',
  corrected: 'Corrected earlier record',
  aggregate_not_individual_proof: 'Campaign-level information',
  synthetic: 'Synthetic preview',
};

const EVIDENCE_ORIGIN_LABELS: Record<string, string> = {
  mock: 'Synthetic preview',
  synthetic: 'Synthetic preview',
};

export type LifecyclePurchase = {
  id: string;
  createdAt: string | null;
  amount: number | null;
  currency: string | null;
  source: string | null;
  saleStatus: string;
  fulfillmentStatus: string | null;
  accountingTruth: boolean;
};

export type LifecycleEvidence = {
  id: string;
  kind: string;
  status: string;
  sourceLabel: string | null;
  purchaseDate: string | null;
  details: string | null;
  reason: string;
  actorType: string;
  actorLabel: string;
  origin: string;
  originRef: string | null;
  supersededById: string | null;
  createdAt: string | null;
  accountingTruth: boolean;
};

export type LifecycleCommunication = {
  id: string;
  occurredAt: string | null;
  category: string;
  templateOrAskId: string | null;
  outcome: string;
  trigger: string | null;
  caption: string | null;
  batchLabel: string | null;
  jobName: string | null;
  deliveryKnown: boolean;
  deliveryNote: string | null;
};

export type LifecycleContactDecision = {
  id: string;
  decision: string;
  reason: string;
  actorType: string;
  actorLabel: string;
  createdAt: string | null;
};

export type LifecycleIdentityReview = {
  id: string;
  primaryUserId: string;
  otherUserId: string | null;
  reasonCode: string;
  details: string | null;
  status: string;
  resolutionReason: string | null;
  resolvedAt: string | null;
  actorType: string;
  actorLabel: string;
  createdAt: string | null;
};

export type ReaderLifecycleDetail = ReaderLifecycleListItem & {
  notes: string;
  phone: string;
  smsConsentGranted: boolean;
  evidenceHistory: LifecycleEvidence[];
  purchases: LifecyclePurchase[];
  communications: LifecycleCommunication[];
  contactDecisions: LifecycleContactDecision[];
  identityReviews: LifecycleIdentityReview[];
  distinctions: {
    purchasesAreAccountingTruth: boolean;
    evidenceIsLifecycleHistory: boolean;
    providerSuppressionIntegrated: boolean;
    safeToSend: boolean;
  };
};

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

function asNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function isIdentityReviewRequired(item: Pick<ReaderLifecycleListItem, 'review'>): boolean {
  return item.review === 'identity_review_required';
}

export function isOutreachPaused(item: Pick<ReaderLifecycleListItem, 'review'>): boolean {
  return isConflictingReview(item) || isIdentityReviewRequired(item);
}

export function evidenceKindLabel(value: unknown): string {
  return humanizeCode(value, EVIDENCE_KIND_LABELS);
}

export function evidenceStatusLabel(value: unknown): string {
  return humanizeCode(value, EVIDENCE_STATUS_LABELS);
}

export function communicationHistoryOutcome(comm: Pick<LifecycleCommunication, 'outcome' | 'deliveryKnown'>): string {
  if (comm.deliveryKnown === true && String(comm.outcome).toLowerCase() === 'delivered') {
    return 'Delivered';
  }
  return humanizeCode(comm.outcome, COMM_OUTCOME_LABELS);
}

export function triggerLabel(value: unknown): string {
  if (value == null || value === '') return 'Unknown trigger';
  return humanizeCode(value, TRIGGER_LABELS);
}

export function decisionLabel(value: unknown): string {
  return humanizeCode(value, DECISION_LABELS);
}

export function identityStatusLabel(value: unknown): string {
  return humanizeCode(value, IDENTITY_STATUS_LABELS);
}

export function identityReasonLabel(value: unknown): string {
  return humanizeCode(value, IDENTITY_REASON_LABELS);
}

export function saleStatusLabel(value: unknown): string {
  return humanizeCode(value, SALE_STATUS_LABELS);
}

export function fulfillmentStatusLabel(value: unknown): string {
  if (value == null || value === '') return 'Not recorded';
  return humanizeCode(value, FULFILLMENT_STATUS_LABELS);
}

export function templateOrAskLabel(value: unknown, emptyLabel = 'None recorded'): string {
  if (value == null || String(value).trim() === '') return emptyLabel;
  const code = String(value).trim();
  if (TEMPLATE_OR_ASK_LABELS[code]) return TEMPLATE_OR_ASK_LABELS[code];
  const askMatch = /^ask_(\d+)$/i.exec(code);
  if (askMatch) return `Ask #${askMatch[1]}`;
  const versionMatch = /^(.*)_v(\d+)$/i.exec(code);
  if (versionMatch) {
    const base = humanizeCode(versionMatch[1], { purchase_confirmation: 'Purchase confirmation' });
    return `${base}—Version ${versionMatch[2]}`;
  }
  return humanizeCode(code, TEMPLATE_OR_ASK_LABELS);
}

export function evidenceReasonOriginLabel(row: Pick<LifecycleEvidence, 'reason' | 'origin'>): string {
  const reason = humanizeCode(row.reason, EVIDENCE_REASON_LABELS);
  const originCode = row.origin.trim();
  if (!originCode) return reason;
  const origin = humanizeCode(originCode, EVIDENCE_ORIGIN_LABELS);
  if (origin === reason) return reason;
  return `${reason} · ${origin}`;
}

export function isArchivedBetaPurchase(row: Pick<LifecyclePurchase, 'saleStatus'>): boolean {
  return row.saleStatus === 'archived_beta';
}

export function isAggregateEvidence(row: Pick<LifecycleEvidence, 'kind'>): boolean {
  return row.kind === 'aggregate_marketing_not_individual';
}

export function supersededRelationshipLabel(row: Pick<LifecycleEvidence, 'status' | 'supersededById'>): string | null {
  if (row.status !== 'superseded') return null;
  return 'A later administrative record replaced this one. The original snapshot stays in history.';
}

export function formatAmount(amount: number | null, currency: string | null): string {
  if (amount == null) return 'Amount not recorded';
  const cur = (currency || 'usd').toUpperCase();
  return `${amount.toFixed(2)} ${cur}`;
}

export function phoneDisplay(phone: string): string {
  const trimmed = phone.trim();
  return trimmed ? trimmed : 'No phone recorded';
}

export function smsConsentLabel(granted: boolean): string {
  return granted ? 'Yes — existing CRM record only' : 'No — existing CRM record only';
}

export function safeRelatedUserId(id: string | null): string {
  if (!id) return 'None recorded';
  if (id.length <= 24) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

export function enteredBy(actorLabel: string, actorType: string): string {
  const label = actorLabel.trim() || 'Unknown actor';
  const type = actorType.trim();
  return type ? `${label} (${humanizeCode(type, { admin: 'Admin', job: 'Automatic job', webhook: 'Webhook' })})` : label;
}

export function groupEvidence(rows: LifecycleEvidence[]): {
  currentConfirmed: LifecycleEvidence[];
  currentProvisional: LifecycleEvidence[];
  disputed: LifecycleEvidence[];
  superseded: LifecycleEvidence[];
  historical: LifecycleEvidence[];
} {
  const currentConfirmed: LifecycleEvidence[] = [];
  const currentProvisional: LifecycleEvidence[] = [];
  const disputed: LifecycleEvidence[] = [];
  const superseded: LifecycleEvidence[] = [];
  const historical: LifecycleEvidence[] = [];
  for (const row of rows) {
    if (row.status === 'superseded') {
      superseded.push(row);
      historical.push(row);
    } else if (row.status === 'disputed') {
      disputed.push(row);
      historical.push(row);
    } else if (row.status === 'confirmed') currentConfirmed.push(row);
    else if (row.status === 'provisional') currentProvisional.push(row);
    else historical.push(row);
  }
  return { currentConfirmed, currentProvisional, disputed, superseded, historical };
}

export function supersededFoldLabel(count: number): string {
  const n = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  return n === 1 ? 'Earlier superseded evidence (1)' : `Earlier superseded evidence (${n})`;
}

function parsePurchase(raw: unknown): LifecyclePurchase | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  return {
    id: asString(row.id),
    createdAt: asStringOrNull(row.createdAt),
    amount: asNumberOrNull(row.amount),
    currency: asStringOrNull(row.currency),
    source: asStringOrNull(row.source),
    saleStatus: asString(row.saleStatus) || 'live',
    fulfillmentStatus: asStringOrNull(row.fulfillmentStatus),
    accountingTruth: row.accountingTruth !== false,
  };
}

function parseEvidence(raw: unknown): LifecycleEvidence | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  return {
    id: asString(row.id),
    kind: asString(row.kind) || 'unknown',
    status: asString(row.status) || 'unknown',
    sourceLabel: asStringOrNull(row.sourceLabel),
    purchaseDate: asStringOrNull(row.purchaseDate),
    details: asStringOrNull(row.details),
    reason: asString(row.reason) || 'unknown',
    actorType: asString(row.actorType),
    actorLabel: asString(row.actorLabel),
    origin: asString(row.origin),
    originRef: asStringOrNull(row.originRef),
    supersededById: asStringOrNull(row.supersededById),
    createdAt: asStringOrNull(row.createdAt),
    accountingTruth: asBool(row.accountingTruth),
  };
}

function parseCommunication(raw: unknown): LifecycleCommunication | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  return {
    id: asString(row.id),
    occurredAt: asStringOrNull(row.occurredAt),
    category: asString(row.category) || 'unknown',
    templateOrAskId: asStringOrNull(row.templateOrAskId),
    outcome: asString(row.outcome) || 'unknown',
    trigger: asStringOrNull(row.trigger),
    caption: asStringOrNull(row.caption),
    batchLabel: asStringOrNull(row.batchLabel),
    jobName: asStringOrNull(row.jobName),
    deliveryKnown: row.deliveryKnown === true,
    deliveryNote: asStringOrNull(row.deliveryNote),
  };
}

function parseDecision(raw: unknown): LifecycleContactDecision | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  return {
    id: asString(row.id),
    decision: asString(row.decision) || 'unknown',
    reason: asString(row.reason) || '',
    actorType: asString(row.actorType),
    actorLabel: asString(row.actorLabel),
    createdAt: asStringOrNull(row.createdAt),
  };
}

function parseIdentity(raw: unknown): LifecycleIdentityReview | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  return {
    id: asString(row.id),
    primaryUserId: asString(row.primaryUserId),
    otherUserId: asStringOrNull(row.otherUserId),
    reasonCode: asString(row.reasonCode) || 'unknown',
    details: asStringOrNull(row.details),
    status: asString(row.status) || 'unknown',
    resolutionReason: asStringOrNull(row.resolutionReason),
    resolvedAt: asStringOrNull(row.resolvedAt),
    actorType: asString(row.actorType),
    actorLabel: asString(row.actorLabel),
    createdAt: asStringOrNull(row.createdAt),
  };
}

export function parseDetailResponse(raw: unknown): ReaderLifecycleDetail | null {
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const readerRaw = body.reader && typeof body.reader === 'object' ? body.reader : body;
  const base = parseListItem(readerRaw);
  if (!base) return null;
  const row = readerRaw as Record<string, unknown>;
  const distinctionsRaw =
    row.distinctions && typeof row.distinctions === 'object'
      ? (row.distinctions as Record<string, unknown>)
      : {};
  return {
    ...base,
    notes: asString(row.notes),
    phone: asString(row.phone),
    smsConsentGranted: asBool(row.smsConsentGranted),
    evidenceHistory: Array.isArray(row.evidenceHistory)
      ? row.evidenceHistory.map(parseEvidence).filter((item): item is LifecycleEvidence => item !== null)
      : [],
    purchases: Array.isArray(row.purchases)
      ? row.purchases.map(parsePurchase).filter((item): item is LifecyclePurchase => item !== null)
      : [],
    communications: Array.isArray(row.communications)
      ? row.communications
          .map(parseCommunication)
          .filter((item): item is LifecycleCommunication => item !== null)
      : [],
    contactDecisions: Array.isArray(row.contactDecisions)
      ? row.contactDecisions
          .map(parseDecision)
          .filter((item): item is LifecycleContactDecision => item !== null)
      : [],
    identityReviews: Array.isArray(row.identityReviews)
      ? row.identityReviews
          .map(parseIdentity)
          .filter((item): item is LifecycleIdentityReview => item !== null)
      : [],
    distinctions: {
      purchasesAreAccountingTruth: distinctionsRaw.purchasesAreAccountingTruth !== false,
      evidenceIsLifecycleHistory: distinctionsRaw.evidenceIsLifecycleHistory !== false,
      providerSuppressionIntegrated: distinctionsRaw.providerSuppressionIntegrated === true,
      safeToSend: distinctionsRaw.safeToSend === true,
    },
  };
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  'evidence.add_provisional': 'Added provisional evidence',
  'evidence.add_gift': 'Added gifted-book evidence',
  'evidence.confirm': 'Confirmed evidence',
  'evidence.correct': 'Corrected evidence',
  'evidence.dispute': 'Disputed evidence',
  'evidence.replace_disputed': 'Replaced disputed evidence',
  'contact_decision.suppress': 'Added Do Not Contact',
  'contact_decision.allow': 'Allowed local contact',
  'identity_review.open': 'Opened identity review',
  'identity_review.resolve': 'Resolved identity review',
};

const AUDIT_ENTITY_LABELS: Record<string, string> = {
  ReaderEvidence: 'Purchase and ownership evidence',
  ReaderContactDecision: 'Contact decision',
  ReaderIdentityReview: 'Identity review',
};

const AUDIT_SUMMARY_SCALAR_KEYS = [
  'id',
  'kind',
  'status',
  'sourceLabel',
  'purchaseDate',
  'supersededById',
  'decision',
  'reasonCode',
  'resolutionReason',
  'resolvedAt',
  'createdAt',
  'updatedAt',
  'actorType',
  'actorLabel',
  'actorId',
  'originalId',
] as const;

const AUDIT_SUMMARY_OBJECT_KEYS = ['replacement', 'opener', 'resolver'] as const;
const AUDIT_CALENDAR_DATE_KEYS = new Set(['purchaseDate']);
const AUDIT_TIMESTAMP_KEYS = new Set(['createdAt', 'updatedAt', 'resolvedAt']);
const AUDIT_SKIP_DISPLAY_KEYS = new Set(['id', 'actorId', 'originalId']);

export interface AuditSummary {
  [key: string]: string | number | boolean | null | AuditSummary | undefined;
}

export type LifecycleAuditItem = {
  id: string;
  createdAt: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  actorType: string;
  actorLabel: string;
  actorId: string | null;
  reason: string | null;
  before: AuditSummary | null;
  after: AuditSummary | null;
};

export type LifecycleAuditHistory = {
  readerProfileId: string;
  items: LifecycleAuditItem[];
  pageSize: number;
  nextCursor: string | null;
  hasMore: boolean;
};

export function auditHistoryProxyPath(readerProfileId: string, cursor?: string | null): string {
  const encoded = encodeURIComponent(readerProfileId);
  const base = `/api/admin/reader-lifecycle/readers/${encoded}/audit-history`;
  if (!cursor) return base;
  return `${base}?cursor=${encodeURIComponent(cursor)}`;
}

export function auditActionLabel(value: unknown): string {
  return humanizeCode(value, AUDIT_ACTION_LABELS);
}

export function auditEntityTypeLabel(value: unknown): string {
  return humanizeCode(value, AUDIT_ENTITY_LABELS);
}

function parseAuditSummary(raw: unknown, depth = 0): AuditSummary | null {
  if (raw == null) return null;
  if (depth > 4) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const out: AuditSummary = {};
  for (const key of AUDIT_SUMMARY_SCALAR_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    const value = row[key];
    if (value == null) {
      out[key] = null;
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    }
  }
  for (const key of AUDIT_SUMMARY_OBJECT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    const nested = parseAuditSummary(row[key], depth + 1);
    if (nested) out[key] = nested;
  }
  return Object.keys(out).length ? out : null;
}

function parseAuditItem(raw: unknown): LifecycleAuditItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const id = asString(row.id).trim();
  if (!id) return null;
  return {
    id,
    createdAt: asStringOrNull(row.createdAt),
    action: asString(row.action),
    entityType: asString(row.entityType),
    entityId: asStringOrNull(row.entityId),
    actorType: asString(row.actorType),
    actorLabel: asString(row.actorLabel) || 'Unknown administrator',
    actorId: asStringOrNull(row.actorId),
    reason: asStringOrNull(row.reason),
    before: parseAuditSummary(row.before),
    after: parseAuditSummary(row.after),
  };
}

export function parseAuditHistoryResponse(raw: unknown): LifecycleAuditHistory | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  if (body.ok === false) return null;
  if (!Array.isArray(body.items)) return null;
  const readerProfileId = asString(body.readerProfileId);
  const items = body.items
    .map(parseAuditItem)
    .filter((item): item is LifecycleAuditItem => item !== null);
  return {
    readerProfileId,
    items,
    pageSize: typeof body.pageSize === 'number' && body.pageSize > 0 ? body.pageSize : items.length || 50,
    nextCursor: typeof body.nextCursor === 'string' && body.nextCursor ? body.nextCursor : null,
    hasMore: body.hasMore === true,
  };
}

export function mergeAuditPages(
  existing: LifecycleAuditItem[],
  incoming: LifecycleAuditItem[],
): LifecycleAuditItem[] {
  const seen = new Set(existing.map((row) => row.id));
  const next = existing.slice();
  for (const row of incoming) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    next.push(row);
  }
  return next;
}

function auditFieldLabel(key: string): string {
  const labels: Record<string, string> = {
    kind: 'Evidence type',
    status: 'Status',
    sourceLabel: 'Source',
    purchaseDate: 'Purchase date',
    supersededById: 'Superseded',
    decision: 'Decision',
    reasonCode: 'Review reason',
    resolutionReason: 'Resolution note',
    resolvedAt: 'Resolved at',
    createdAt: 'Created',
    updatedAt: 'Updated',
    actorType: 'Actor type',
    actorLabel: 'Administrator',
    replacement: 'Replacement',
    opener: 'Opened by',
    resolver: 'Resolved by',
  };
  return labels[key] || humanizeCode(key, {});
}

function auditFieldValue(key: string, value: string | number | boolean | null): string {
  if (value == null || value === '') return 'Not recorded';
  if (key === 'kind') return evidenceKindLabel(value);
  if (key === 'status') return evidenceStatusLabel(value);
  if (key === 'decision') return decisionLabel(value);
  if (key === 'reasonCode') return identityReasonLabel(value);
  if (key === 'sourceLabel') return sourceLabel(value);
  if (key === 'supersededById') return 'Replaced by a later administrative record';
  if (AUDIT_CALENDAR_DATE_KEYS.has(key)) return formatCalendarDate(String(value));
  if (AUDIT_TIMESTAMP_KEYS.has(key)) return formatOccurredAt(String(value));
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  return String(value);
}

export type AuditSummaryLine = { label: string; value: string };

export function auditSummaryLines(summary: AuditSummary | null, prefix = ''): AuditSummaryLine[] {
  if (!summary) return [];
  const lines: AuditSummaryLine[] = [];
  for (const key of AUDIT_SUMMARY_SCALAR_KEYS) {
    if (AUDIT_SKIP_DISPLAY_KEYS.has(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(summary, key)) continue;
    const value = summary[key];
    if (value !== null && typeof value === 'object') continue;
    const label = `${prefix}${auditFieldLabel(key)}`;
    lines.push({ label, value: auditFieldValue(key, value as string | number | boolean | null) });
  }
  for (const key of AUDIT_SUMMARY_OBJECT_KEYS) {
    const nested = summary[key];
    if (!nested || typeof nested !== 'object') continue;
    lines.push(...auditSummaryLines(nested, `${auditFieldLabel(key)}: `));
  }
  return lines;
}

export function errorCopy(kind: LifecycleReadErrorKind): { title: string; body: string } {
  if (kind === 'unauthorized') {
    return {
      title: 'Sign in required',
      body: 'This preview uses the same fulfillment login as other admin tools.',
    };
  }
  if (kind === 'forbidden') {
    return {
      title: 'Access denied',
      body: 'You do not have permission to view this record.',
    };
  }
  if (kind === 'not_configured') {
    return {
      title: 'Configuration unavailable',
      body: 'The server is missing required administrative configuration. Nothing was changed.',
    };
  }
  if (kind === 'unavailable') {
    return {
      title: 'Lifecycle service unavailable',
      body: 'The read service could not be reached. Try again in a moment.',
    };
  }
  if (kind === 'not_found') {
    return {
      title: 'Reader not found',
      body: 'No lifecycle reader exists for this identifier.',
    };
  }
  return {
    title: 'Unable to load this reader',
    body: 'A read error occurred. Nothing was changed.',
  };
}

export function auditHistoryErrorCopy(kind: LifecycleReadErrorKind): { title: string; body: string } {
  if (kind === 'unauthorized') return errorCopy(kind);
  if (kind === 'forbidden') return errorCopy(kind);
  if (kind === 'not_configured') return errorCopy(kind);
  if (kind === 'unavailable') {
    return {
      title: 'Administrative history unavailable',
      body: 'The history service could not be reached. Try again in a moment.',
    };
  }
  if (kind === 'not_found') {
    return {
      title: 'History not found',
      body: 'No administrative history exists for this identifier.',
    };
  }
  return {
    title: 'Unable to load administrative history',
    body: 'A read error occurred. Missing history was not invented.',
  };
}

export { contactabilityLabel, sourceLabel };
export type { PreviewErrorKind };
