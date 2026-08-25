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

export const EMPTY_HISTORY =
  'No history is available in the current Reader Lifecycle records.';

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

export function errorCopy(kind: PreviewErrorKind): { title: string; body: string } {
  if (kind === 'unauthorized') {
    return {
      title: 'Sign in required',
      body: 'This preview uses the same fulfillment login as other admin tools.',
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

export { contactabilityLabel, sourceLabel };
export type { PreviewErrorKind };
