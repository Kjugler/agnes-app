/**
 * Pure helpers for the local Reader Lifecycle editing preview (Checkpoint 5E).
 * Posts go through the committed 5D proxies. Do not import from non-preview UI.
 */

import {
  errorCopy,
  type LifecycleEvidence,
  type LifecycleIdentityReview,
  type LifecycleReadErrorKind,
  type ReaderLifecycleDetail,
} from './readerLifecycleDetailModel';

export const LOCAL_CLASSIFICATION_NOTE =
  'Classification and nurture suppression shown here are local lifecycle results only.';
export const NO_EMAIL_STATEMENT = 'No email will be sent.';
export const NO_NURTURE_JOB = 'No nurture or Text-a-Friend request will be sent by these actions.';
export const ALLOW_CONTACT_WARNING =
  'This removes the latest manual Do Not Contact decision only. It does not create an email address, override an email-provider unsubscribe or mean that sending is safe.';
export const WEBSITE_WRONG_OWNER_NOTE =
  'Opening an identity review pauses outreach. It does not change website Purchase records or accounting.';
export const SUPERSEDE_CONFIRM_NOTE =
  'The original evidence will remain in history as superseded. A corrected replacement will be created.';
export const CONFIRM_REPLACES_NOTE =
  'A new confirmed record will replace the provisional record. The original provisional row stays in history.';
export const DISPUTE_CONSEQUENCE =
  'The evidence remains in history as disputed. Outreach remains paused while conflicting evidence exists. A live website Purchase, if present, remains accounting truth and is not changed.';
export const REPLACE_CONSEQUENCE =
  'The disputed snapshot remains in history. The replacement becomes the current evidence.';
export const IDENTITY_RESOLVE_NOTE =
  'No user merge occurs. No Purchase is reassigned. The original opener remains recorded. The resolving actor is written to the audit history.';
export const PROVISIONAL_ADD_NOTE =
  'Provisional evidence classifies the person using this local lifecycle result and pauses nurturing. It may later be corrected or confirmed. The UI cannot create confirmed evidence directly.';
export const WEBSITE_PURCHASE_CANNOT_EDIT =
  'Website Purchase records are accounting truth and cannot be edited here.';
export const LOCALLY_CONTACTABLE_NOT_SAFE =
  '“Locally contactable” does not mean approved or safe to email.';
export const AUDIT_HISTORY_NOT_IN_GET =
  'Administrative audit entries are stored by the write service but are not included in the current GET-detail contract.';

export type PermittedActionItem = {
  action: EditAction;
  label: string;
  tone: 'default' | 'warning' | 'danger';
};

export function permittedActions(reader: ReaderLifecycleDetail): PermittedActionItem[] {
  const items: PermittedActionItem[] = [];
  if (canAddEvidence(reader)) {
    items.push({ action: { type: 'addEvidence' }, label: 'Add provisional evidence', tone: 'default' });
  }
  for (const row of reader.evidenceHistory) {
    if (canConfirmEvidence(row)) {
      items.push({
        action: { type: 'confirmEvidence', evidenceId: row.id },
        label: `Confirm ${evidenceKindShort(row)} evidence`,
        tone: 'default',
      });
    }
    if (canCorrectEvidence(row)) {
      items.push({
        action: { type: 'correctEvidence', evidenceId: row.id },
        label: `Correct ${evidenceKindShort(row)} evidence`,
        tone: 'warning',
      });
    }
    if (canDisputeEvidence(row)) {
      items.push({
        action: { type: 'disputeEvidence', evidenceId: row.id },
        label: `Dispute ${evidenceKindShort(row)} evidence`,
        tone: 'danger',
      });
    }
    if (canReplaceEvidence(row)) {
      items.push({
        action: { type: 'replaceEvidence', evidenceId: row.id },
        label: `Replace disputed ${evidenceKindShort(row)} evidence`,
        tone: 'warning',
      });
    }
  }
  items.push({ action: { type: 'addDnc' }, label: 'Add Do Not Contact', tone: 'danger' });
  items.push({ action: { type: 'allowContact' }, label: 'Allow local contact', tone: 'warning' });
  items.push({ action: { type: 'openIdentityReview' }, label: 'Open identity review', tone: 'warning' });
  for (const review of openIdentityReviews(reader.identityReviews)) {
    items.push({
      action: { type: 'resolveIdentityReview', reviewId: review.id },
      label: 'Resolve identity review',
      tone: 'default',
    });
  }
  return items;
}

function evidenceKindShort(row: Pick<LifecycleEvidence, 'kind'>): string {
  if (row.kind === 'manual_amazon') return 'Amazon';
  if (row.kind === 'manual_bn') return 'Barnes & Noble';
  if (row.kind === 'manual_other') return 'other';
  if (row.kind === 'gift_book_owner') return 'gifted-book';
  return 'manual';
}

export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return '';
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : '';
}

export function actorName(actorId: string, actors: readonly LifecycleActor[] = []): string {
  const found = actors.find((actor) => actor.id === actorId);
  return found ? found.label : 'Unknown actor';
}

export const MIN_REASON_LENGTH = 8;
export const MAX_REASON_LENGTH = 500;
export const MAX_DETAILS_LENGTH = 2000;

export const ADD_KIND_OPTIONS = [
  { value: 'manual_amazon', label: 'Amazon purchase' },
  { value: 'manual_bn', label: 'Barnes & Noble purchase' },
  { value: 'manual_other', label: 'Other purchase' },
  { value: 'gift_book_owner', label: 'Gifted book ownership' },
] as const;

export const IDENTITY_OPEN_REASON_OPTIONS = [
  { value: 'duplicate_name', label: 'Duplicate name' },
  { value: 'similar_email', label: 'Similar email' },
  { value: 'possible_wrong_website_owner', label: 'Possible wrong website owner' },
  { value: 'stripe_session_user_mismatch', label: 'Stripe session/user mismatch' },
  { value: 'other', label: 'Other' },
] as const;

export const IDENTITY_RESOLVE_OPTIONS = [
  { value: 'dismissed', label: 'Dismiss review' },
  { value: 'resolved_keep_separate', label: 'Resolve—keep records separate' },
] as const;

export const ACTORS_PROXY_PATH = '/api/admin/reader-lifecycle/actors';
export const ACTORS_LOADING = 'Loading administrators…';
export const ACTORS_UNAVAILABLE =
  'Administrators could not be loaded. Saving is disabled until you retry. No helper was selected automatically.';
export const ACTORS_EMPTY = 'No active administrators are available. Saving is disabled.';

export function actorLoadErrorCopy(kind: LifecycleReadErrorKind): { title: string; body: string } {
  if (kind === 'forbidden') return errorCopy(kind);
  if (kind === 'unauthorized') {
    return {
      title: 'Sign in required',
      body: 'Sign in is required before a helper can be chosen.',
    };
  }
  return {
    title: 'Administrators unavailable',
    body: ACTORS_UNAVAILABLE,
  };
}

export type LifecycleActor = {
  id: string;
  label: string;
  active?: boolean;
};

export type AddEvidenceKind = (typeof ADD_KIND_OPTIONS)[number]['value'];
export type IdentityOpenReason = (typeof IDENTITY_OPEN_REASON_OPTIONS)[number]['value'];
export type IdentityResolveStatus = (typeof IDENTITY_RESOLVE_OPTIONS)[number]['value'];

export type EditAction =
  | { type: 'addEvidence' }
  | { type: 'confirmEvidence'; evidenceId: string }
  | { type: 'correctEvidence'; evidenceId: string }
  | { type: 'disputeEvidence'; evidenceId: string }
  | { type: 'replaceEvidence'; evidenceId: string }
  | { type: 'addDnc' }
  | { type: 'allowContact' }
  | { type: 'openIdentityReview' }
  | { type: 'resolveIdentityReview'; reviewId: string };

export type MutationErrorKind =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'stale'
  | 'idempotency_conflict'
  | 'accounting_protected'
  | 'mutations_disabled'
  | 'not_configured'
  | 'unavailable'
  | 'generic';

const MUTABLE_KINDS = new Set([
  'manual_amazon',
  'manual_bn',
  'manual_other',
  'gift_book_owner',
  'kris_personal_knowledge',
]);

export function selectableActors(actors: readonly LifecycleActor[] = []): LifecycleActor[] {
  return actors.filter((actor) => actor.active !== false && Boolean(actor.id) && Boolean(actor.label));
}

export function isSelectableActorId(actorId: string, actors: readonly LifecycleActor[]): boolean {
  return selectableActors(actors).some((actor) => actor.id === actorId);
}

export function canSubmitWithActors(actors: readonly LifecycleActor[]): boolean {
  return selectableActors(actors).length > 0;
}

export function parseActorsResponse(raw: unknown): { actors: LifecycleActor[] } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  if (body.ok === false) return null;
  if (!Array.isArray(body.actors)) return null;
  const actors: LifecycleActor[] = [];
  for (const row of body.actors) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const rec = row as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id.trim() : '';
    const label = typeof rec.label === 'string' ? rec.label.trim() : '';
    if (!id || !label) continue;
    if (rec.active === false) continue;
    actors.push({ id, label });
  }
  return { actors };
}

export function isWebsiteAccountingEvidence(row: Pick<LifecycleEvidence, 'kind' | 'accountingTruth'>): boolean {
  return row.kind === 'website_stripe' || row.accountingTruth === true;
}

export function isCurrentEvidence(row: Pick<LifecycleEvidence, 'status' | 'supersededById'>): boolean {
  return (row.status === 'provisional' || row.status === 'confirmed') && !row.supersededById;
}

export function isManualMutableEvidence(row: Pick<LifecycleEvidence, 'kind' | 'accountingTruth'>): boolean {
  return MUTABLE_KINDS.has(row.kind) && !isWebsiteAccountingEvidence(row);
}

export function canConfirmEvidence(row: LifecycleEvidence): boolean {
  return isManualMutableEvidence(row) && row.status === 'provisional' && !row.supersededById;
}

export function canCorrectEvidence(row: LifecycleEvidence): boolean {
  return isManualMutableEvidence(row) && isCurrentEvidence(row);
}

export function canDisputeEvidence(row: LifecycleEvidence): boolean {
  return isManualMutableEvidence(row) && isCurrentEvidence(row);
}

export function canReplaceEvidence(row: LifecycleEvidence): boolean {
  return isManualMutableEvidence(row) && row.status === 'disputed';
}

export function openIdentityReviews(rows: LifecycleIdentityReview[]): LifecycleIdentityReview[] {
  return rows.filter((row) => row.status === 'open');
}

export function canAddEvidence(_reader?: Pick<ReaderLifecycleDetail, 'review'>): boolean {
  return true;
}

export function fieldErrorFromCode(code: string | undefined): { field: string; message: string } | null {
  const map: Record<string, { field: string; message: string }> = {
    invalid_reason: { field: 'reason', message: 'Enter a reason between 8 and 500 characters.' },
    actor_required: { field: 'actorId', message: 'Select who is taking this action.' },
    actor_not_found: { field: 'actorId', message: 'Select an active helper from the list.' },
    actor_inactive: { field: 'actorId', message: 'That helper is inactive and cannot take this action.' },
    invalid_details: { field: 'details', message: 'Details are missing or too long.' },
    invalid_purchase_date: { field: 'purchaseDate', message: 'Enter a valid purchase date, or leave it blank.' },
    invalid_kind: { field: 'kind', message: 'Select an allowed evidence type.' },
    invalid_reason_code: { field: 'reasonCode', message: 'Select a review reason.' },
    invalid_other_user: { field: 'otherUserId', message: 'The related record ID cannot be this same reader.' },
    other_user_not_found: { field: 'otherUserId', message: 'That related record ID was not found.' },
    invalid_decision: { field: 'decision', message: 'Choose Add Do Not Contact or Allow local contact.' },
    invalid_resolution: { field: 'status', message: 'Choose dismiss or keep records separate.' },
    invalid_status: { field: 'status', message: 'Status must be provisional or confirmed.' },
    invalid_expected_status: { field: 'form', message: 'This record changed. Reload before trying again.' },
  };
  return code && map[code] ? map[code] : null;
}

export function evidenceLifecycleStatusLabel(row: Pick<LifecycleEvidence, 'status'>): string {
  if (row.status === 'provisional') return 'Current—Provisional';
  if (row.status === 'confirmed') return 'Current—Confirmed';
  if (row.status === 'disputed') return 'Disputed';
  if (row.status === 'superseded') return 'Superseded';
  return row.status || 'Unknown';
}

export function supersededRelationshipLabel(row: Pick<LifecycleEvidence, 'status' | 'supersededById'>): string | null {
  if (row.status !== 'superseded') return null;
  return 'A later administrative record replaced this one. The original snapshot stays in history.';
}

export function mutationPath(action: EditAction, readerProfileId: string): string {
  const base = '/api/admin/reader-lifecycle';
  switch (action.type) {
    case 'addEvidence':
      return `${base}/readers/${encodeURIComponent(readerProfileId)}/evidence`;
    case 'confirmEvidence':
      return `${base}/evidence/${encodeURIComponent(action.evidenceId)}/confirm`;
    case 'correctEvidence':
      return `${base}/evidence/${encodeURIComponent(action.evidenceId)}/correct`;
    case 'disputeEvidence':
      return `${base}/evidence/${encodeURIComponent(action.evidenceId)}/dispute`;
    case 'replaceEvidence':
      return `${base}/evidence/${encodeURIComponent(action.evidenceId)}/replace`;
    case 'addDnc':
    case 'allowContact':
      return `${base}/readers/${encodeURIComponent(readerProfileId)}/contact-decisions`;
    case 'openIdentityReview':
      return `${base}/readers/${encodeURIComponent(readerProfileId)}/identity-reviews`;
    case 'resolveIdentityReview':
      return `${base}/identity-reviews/${encodeURIComponent(action.reviewId)}/resolve`;
    default:
      return '';
  }
}

export function createIdempotencyKey(): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return uuid.replace(/[^A-Za-z0-9._:-]/g, '');
}

export function payloadFingerprint(payload: unknown): string {
  return JSON.stringify(payload);
}

export type IdempotencySession = {
  key: string;
  fingerprint: string;
};

export function beginIdempotencySession(payload: unknown): IdempotencySession {
  return { key: createIdempotencyKey(), fingerprint: payloadFingerprint(payload) };
}

export function idempotencyKeyForAttempt(
  session: IdempotencySession | null,
  payload: unknown,
  event: 'retry' | 'field-change' | 'new-intent',
): IdempotencySession {
  const fingerprint = payloadFingerprint(payload);
  if (event === 'retry' && session && session.fingerprint === fingerprint) return session;
  return { key: createIdempotencyKey(), fingerprint };
}

export function actionTitle(action: EditAction): string {
  switch (action.type) {
    case 'addEvidence':
      return 'Add provisional evidence';
    case 'confirmEvidence':
      return 'Confirm evidence';
    case 'correctEvidence':
      return 'Correct evidence';
    case 'disputeEvidence':
      return 'Dispute evidence';
    case 'replaceEvidence':
      return 'Replace disputed evidence';
    case 'addDnc':
      return 'Add Do Not Contact';
    case 'allowContact':
      return 'Allow local contact';
    case 'openIdentityReview':
      return 'Open identity review';
    case 'resolveIdentityReview':
      return 'Resolve identity review';
    default:
      return 'Lifecycle action';
  }
}

export function confirmButtonLabel(action: EditAction): string {
  switch (action.type) {
    case 'addEvidence':
      return 'Add provisional evidence';
    case 'confirmEvidence':
      return 'Confirm evidence';
    case 'correctEvidence':
      return 'Save corrected evidence';
    case 'disputeEvidence':
      return 'Dispute evidence';
    case 'replaceEvidence':
      return 'Replace evidence';
    case 'addDnc':
      return 'Add Do Not Contact';
    case 'allowContact':
      return 'Allow local contact';
    case 'openIdentityReview':
      return 'Open identity review';
    case 'resolveIdentityReview':
      return 'Resolve identity review';
    default:
      return 'Save';
  }
}

export function successMessage(action: EditAction): string {
  return `${actionTitle(action)} completed.`;
}

export function classifyMutationError(status: number, errorCode?: string): MutationErrorKind {
  const code = String(errorCode || '');
  if (status === 400) return 'validation';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 503 || code === 'lifecycle_mutations_disabled') return 'mutations_disabled';
  if (status === 409 && code === 'idempotency_conflict') return 'idempotency_conflict';
  if (status === 409 && (code === 'website_purchase_protected' || code === 'stripe_session_not_allowed')) {
    return 'accounting_protected';
  }
  if (status === 409) return 'stale';
  if (status === 500 || code === 'admin_not_configured') return 'not_configured';
  if (status === 502 || code === 'proxy_unavailable' || status === 0) return 'unavailable';
  return 'generic';
}

export function mutationErrorCopy(kind: MutationErrorKind): { title: string; body: string; allowRetry: boolean } {
  if (kind === 'validation') {
    return {
      title: 'This form could not be saved',
      body: 'Check the highlighted fields. Nothing was changed.',
      allowRetry: false,
    };
  }
  if (kind === 'unauthorized') {
    return {
      title: 'Sign in required',
      body: 'This preview uses the same fulfillment login as other admin tools.',
      allowRetry: false,
    };
  }
  if (kind === 'forbidden') {
    return { title: 'Access denied', body: 'This action is not permitted.', allowRetry: false };
  }
  if (kind === 'mutations_disabled') {
    return {
      title: 'Saving is disabled',
      body: 'Lifecycle edits are turned off on this server. Nothing was changed.',
      allowRetry: false,
    };
  }
  if (kind === 'not_found') {
    return {
      title: 'Record not found',
      body: 'This record changed or no longer exists. Reload before trying again.',
      allowRetry: false,
    };
  }
  if (kind === 'stale') {
    return {
      title: 'This record changed',
      body: 'Someone else changed this record. Reload before trying again.',
      allowRetry: false,
    };
  }
  if (kind === 'idempotency_conflict') {
    return {
      title: 'This save attempt cannot be reused',
      body: 'Start a fresh save intent. The previous request used the same key for a different change.',
      allowRetry: false,
    };
  }
  if (kind === 'accounting_protected') {
    return {
      title: 'Website Purchase records cannot be changed here',
      body: 'Open an identity review instead. Accounting records stay unchanged.',
      allowRetry: false,
    };
  }
  if (kind === 'not_configured') {
    return {
      title: 'Configuration unavailable',
      body: 'The server is missing required administrative configuration. Nothing was changed.',
      allowRetry: false,
    };
  }
  if (kind === 'unavailable') {
    return {
      title: 'Save did not complete',
      body: 'The service could not be reached. You can retry this unchanged request.',
      allowRetry: true,
    };
  }
  return { title: 'Unable to save', body: 'A save error occurred. Nothing safe was displayed from the server.', allowRetry: false };
}

export function validateReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (trimmed.length < MIN_REASON_LENGTH) return `Reason must be at least ${MIN_REASON_LENGTH} characters.`;
  if (trimmed.length > MAX_REASON_LENGTH) return `Reason must be at most ${MAX_REASON_LENGTH} characters.`;
  return null;
}

export function validateDetails(details: string, required = false): string | null {
  const trimmed = details.trim();
  if (required && trimmed.length < MIN_REASON_LENGTH) {
    return `Details must be at least ${MIN_REASON_LENGTH} characters.`;
  }
  if (trimmed.length > MAX_DETAILS_LENGTH) return `Details must be at most ${MAX_DETAILS_LENGTH} characters.`;
  return null;
}

export type AddEvidenceDraft = {
  kind: AddEvidenceKind;
  purchaseDate: string;
  details: string;
  reason: string;
  actorId: string;
};

export function addEvidencePayload(draft: AddEvidenceDraft): Record<string, string> {
  const body: Record<string, string> = {
    kind: draft.kind,
    reason: draft.reason.trim(),
    actorId: draft.actorId,
  };
  if (draft.purchaseDate.trim()) body.purchaseDate = draft.purchaseDate.trim();
  if (draft.details.trim()) body.details = draft.details.trim();
  return body;
}

export function confirmEvidencePayload(reason: string, actorId: string, expectedStatus: string): Record<string, string> {
  return { reason: reason.trim(), actorId, expectedStatus };
}

export type CorrectEvidenceDraft = {
  kind: string;
  purchaseDate: string;
  details: string;
  status: 'provisional' | 'confirmed';
  reason: string;
  actorId: string;
  expectedStatus: string;
};

export function correctEvidencePayload(draft: CorrectEvidenceDraft): Record<string, string> {
  const body: Record<string, string> = {
    reason: draft.reason.trim(),
    actorId: draft.actorId,
    expectedStatus: draft.expectedStatus,
    kind: draft.kind,
    status: draft.status,
  };
  if (draft.purchaseDate.trim()) body.purchaseDate = draft.purchaseDate.trim();
  if (draft.details.trim()) body.details = draft.details.trim();
  return body;
}

export function disputeEvidencePayload(reason: string, actorId: string, expectedStatus: string): Record<string, string> {
  return { reason: reason.trim(), actorId, expectedStatus };
}

export function replaceEvidencePayload(draft: CorrectEvidenceDraft): Record<string, string> {
  return correctEvidencePayload(draft);
}

export function contactDecisionPayload(decision: 'suppress' | 'allow', reason: string, actorId: string): Record<string, string> {
  return { decision, reason: reason.trim(), actorId };
}

export type OpenReviewDraft = {
  reasonCode: IdentityOpenReason;
  details: string;
  otherUserId: string;
  reason: string;
  actorId: string;
};

export function openIdentityReviewPayload(draft: OpenReviewDraft): Record<string, string> {
  const body: Record<string, string> = {
    reasonCode: draft.reasonCode,
    reason: draft.reason.trim(),
    actorId: draft.actorId,
  };
  if (draft.details.trim()) body.details = draft.details.trim();
  if (draft.otherUserId.trim()) body.otherUserId = draft.otherUserId.trim();
  return body;
}

export function resolveIdentityReviewPayload(
  status: IdentityResolveStatus,
  resolutionReason: string,
  actorId: string,
): Record<string, string> {
  return { status, resolutionReason: resolutionReason.trim(), actorId, expectedStatus: 'open' };
}

export function expectedClassificationNote(action: EditAction): string {
  switch (action.type) {
    case 'addEvidence':
      return 'The person will be classified from the new provisional evidence. Nurturing is locally suppressed.';
    case 'confirmEvidence':
      return 'Confirmed manual evidence will raise confidence where appropriate. Nurturing stays locally suppressed for purchasers.';
    case 'correctEvidence':
      return 'Classification will be recomputed from the replacement evidence.';
    case 'disputeEvidence':
      return 'Review state becomes conflicting and outreach stays paused.';
    case 'replaceEvidence':
      return 'Classification will be recomputed from the replacement. Conflict may clear if no other conflict remains.';
    case 'addDnc':
      return 'Contactability becomes Do Not Contact. Nurturing is locally suppressed.';
    case 'allowContact':
      return 'The latest manual Do Not Contact is reversed. Unmailable email still prevents mailing.';
    case 'openIdentityReview':
      return 'Ownership is held as unknown and outreach is paused until the review is resolved.';
    case 'resolveIdentityReview':
      return 'Classification is recomputed. No merge and no Purchase reassignment occur.';
    default:
      return 'Classification will be recomputed from current lifecycle records.';
  }
}

export function historyPreservationNote(action: EditAction): string {
  switch (action.type) {
    case 'addEvidence':
      return 'Existing evidence, purchases, and communications stay in history.';
    case 'confirmEvidence':
      return CONFIRM_REPLACES_NOTE;
    case 'correctEvidence':
      return SUPERSEDE_CONFIRM_NOTE;
    case 'disputeEvidence':
      return DISPUTE_CONSEQUENCE;
    case 'replaceEvidence':
      return REPLACE_CONSEQUENCE;
    case 'addDnc':
    case 'allowContact':
      return 'Previous contact decisions remain visible as history rows.';
    case 'openIdentityReview':
      return 'Existing identity-review rows remain. This opens a new review.';
    case 'resolveIdentityReview':
      return IDENTITY_RESOLVE_NOTE;
    default:
      return 'Existing history rows remain.';
  }
}

export function parseMutationResponse(raw: unknown): { ok: boolean; replay: boolean; reader: unknown } | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  if (body.ok !== true) return null;
  return { ok: true, replay: body.replay === true, reader: body.reader };
}
