/**
 * Reader Manager Phase 1 Checkpoint 5B — mutation service (no HTTP).
 *
 * Classification stays derived. Writes append evidence, contact decisions,
 * identity reviews, and audit rows. The only in-place evidence change is
 * status/supersededById in the same transaction as a replacement row.
 *
 * Identity-review resolution never overwrites opener actor fields.
 * Resolver identity is recorded on ReaderAdminAudit.
 *
 * Idempotency uses one shared origin (`admin_lifecycle_mutation`). The
 * normalized action is part of requestHash, so one key cannot apply two
 * different actions. Lookup/reservation happens before stale-status checks.
 *
 * resultJson stores a minimal mutation receipt (IDs, action, warnings,
 * timestamp). Replay returns that original receipt plus a freshly read
 * classified `reader`. It does not store the GET-detail payload or PII.
 *
 * Does not send email, enqueue jobs, or write Purchase/Order/ReferralConversion
 * /ReaderCommunication/accounting tables.
 */
const crypto = require('crypto');
const {
  getReaderLifecycleDetail,
  WRITE_METHODS,
  RAW_CLIENT_METHODS,
} = require('./readerLifecycleRead.cjs');
const {
  ARCHIVE_CONTACT_ORIGIN,
  RESTORE_CONTACT_ORIGIN,
  RESTORE_PRIOR_STATUS_REASON,
  archiveLaneSuppressActive,
  independentDncActive,
  resolvedRestorePlan,
} = require('./readerContactSuppression.cjs');

const IDEMPOTENCY_ORIGIN = 'admin_lifecycle_mutation';
const EVIDENCE_ORIGIN = Object.freeze({
  add: 'admin_manual',
  confirm: 'admin_confirm',
  correct: 'admin_correct',
  replace: 'admin_replace',
  decision: 'admin_decision',
});

const ADD_KINDS = Object.freeze(['manual_amazon', 'manual_bn', 'manual_other', 'gift_book_owner']);
const MUTABLE_KINDS = Object.freeze([
  'manual_amazon',
  'manual_bn',
  'manual_other',
  'gift_book_owner',
  'kris_personal_knowledge',
]);
const CURRENT_STATUSES = Object.freeze(['provisional', 'confirmed']);
const IDENTITY_REASON_CODES = Object.freeze([
  'duplicate_name',
  'similar_email',
  'possible_wrong_website_owner',
  'stripe_session_user_mismatch',
  'other',
]);
const ALLOWED_WRITE_DELEGATES = Object.freeze([
  'readerEvidence',
  'readerContactDecision',
  'readerIdentityReview',
  'readerAdminAudit',
  'readerMutationIdempotency',
  'readerProfile',
]);
const ARCHIVE_REASON_CODES = Object.freeze([
  'test_record',
  'invalid_contact',
  'duplicate_or_identity_issue',
  'other',
]);
const ARCHIVE_CONTACT_REASON_CODES = Object.freeze(['test_record', 'invalid_contact']);
const ARCHIVEABLE_STATUSES = Object.freeze(['active', 'inactive']);
const ARCHIVED_PROFILE_ERROR = 'lifecycle_profile_archived';
const DUPLICATE_ARCHIVE_WARNING =
  'Genuine duplicate-person uncertainty normally belongs in Identity Review. Archive does not merge or delete identities.';
const SOURCE_LABEL_BY_KIND = Object.freeze({
  manual_amazon: 'Amazon',
  manual_bn: 'Barnes & Noble',
  manual_other: 'other',
  gift_book_owner: 'gift',
});
const PROTECTED_KINDS = Object.freeze(['website_stripe', 'aggregate_marketing_not_individual']);

class LifecycleWriteError extends Error {
  constructor(code, httpStatus, message) {
    super(message);
    this.name = 'LifecycleWriteError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function denyWrite(label) {
  return () => {
    throw new LifecycleWriteError('forbidden_write', 500, `write to ${label} is not allowed`);
  };
}

function asMutationGuardedPrisma(prisma) {
  if (!prisma || typeof prisma !== 'object') {
    throw new LifecycleWriteError('prisma_required', 500, 'prisma client is required');
  }
  const delegateCache = new Map();
  return new Proxy(prisma, {
    get(target, prop, receiver) {
      if (prop === '$transaction') {
        return (arg, options) => {
          if (typeof arg !== 'function') {
            throw new LifecycleWriteError('forbidden_write', 500, 'array transactions are not allowed');
          }
          return target.$transaction((tx) => arg(asMutationGuardedPrisma(tx)), options);
        };
      }
      if (typeof prop === 'string' && RAW_CLIENT_METHODS.includes(prop)) {
        return denyWrite(prop);
      }
      const value = Reflect.get(target, prop, receiver);
      if (
        value &&
        typeof value === 'object' &&
        typeof prop === 'string' &&
        !prop.startsWith('$') &&
        !prop.startsWith('_')
      ) {
        if (!delegateCache.has(prop)) {
          delegateCache.set(
            prop,
            new Proxy(value, {
              get(delegate, method) {
                if (typeof method === 'string' && WRITE_METHODS.includes(method)) {
                  if (!ALLOWED_WRITE_DELEGATES.includes(prop)) {
                    return denyWrite(`${prop}.${method}`);
                  }
                }
                const fn = Reflect.get(delegate, method);
                return typeof fn === 'function' ? fn.bind(delegate) : fn;
              },
            }),
          );
        }
        return delegateCache.get(prop);
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function canonicalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const next = value[key];
      if (next === undefined) continue;
      out[key] = canonicalize(next);
    }
    return out;
  }
  if (typeof value === 'string') return value.trim();
  if (value === undefined) return null;
  return value;
}

function hashRequest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function requireIdempotencyKey(raw) {
  const key = asTrimmedString(raw);
  if (key.length < 8 || key.length > 128) {
    throw new LifecycleWriteError(
      'invalid_idempotency_key',
      400,
      'Idempotency-Key must be 8–128 characters',
    );
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new LifecycleWriteError(
      'invalid_idempotency_key',
      400,
      'Idempotency-Key contains unsupported characters',
    );
  }
  return key;
}

function requireReason(raw) {
  const reason = asTrimmedString(raw);
  if (reason.length < 8 || reason.length > 500) {
    throw new LifecycleWriteError('invalid_reason', 400, 'reason must be 8–500 characters');
  }
  return reason;
}

function optionalDetails(raw, { required = false } = {}) {
  if (raw == null) {
    if (required) {
      throw new LifecycleWriteError('invalid_details', 400, 'details are required');
    }
    return null;
  }
  const details = asTrimmedString(raw);
  if (!details) {
    if (required) {
      throw new LifecycleWriteError('invalid_details', 400, 'details are required');
    }
    return null;
  }
  if (details.length > 2000) {
    throw new LifecycleWriteError('invalid_details', 400, 'details must be at most 2000 characters');
  }
  return details;
}

function parsePurchaseDate(raw) {
  if (raw == null || raw === '') return null;
  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new LifecycleWriteError('invalid_purchase_date', 400, 'purchaseDate is not a valid date');
  }
  return date;
}

function sourceLabelForKind(kind, explicit) {
  if (explicit != null && asTrimmedString(explicit)) {
    const label = asTrimmedString(explicit);
    if (kind === 'kris_personal_knowledge') return label;
    const expected = SOURCE_LABEL_BY_KIND[kind];
    if (expected && label.toLowerCase() !== expected.toLowerCase() && !(kind === 'manual_bn' && /barnes/i.test(label))) {
      throw new LifecycleWriteError('invalid_source_label', 400, 'sourceLabel does not match kind');
    }
    return expected || label;
  }
  return SOURCE_LABEL_BY_KIND[kind] || null;
}

function rejectProtectedKind(kind) {
  if (PROTECTED_KINDS.includes(kind)) {
    throw new LifecycleWriteError(
      'website_purchase_protected',
      409,
      'Website Stripe purchases cannot be created, edited, disputed, or reassigned here. Open an identity review instead.',
    );
  }
}

function rejectStripeSessionId(value) {
  if (value != null && asTrimmedString(String(value))) {
    throw new LifecycleWriteError(
      'stripe_session_not_allowed',
      400,
      'stripeSessionId is not accepted on manual evidence and is not accounting truth',
    );
  }
}

function requireExpectedStatus(raw, allowed) {
  const status = asTrimmedString(raw);
  if (!allowed.includes(status)) {
    throw new LifecycleWriteError('invalid_expected_status', 400, 'expectedStatus does not match the allowed values');
  }
  return status;
}

function requireConfirmed(raw) {
  if (raw !== true) {
    throw new LifecycleWriteError('confirmation_required', 400, 'confirmed must be true');
  }
  return true;
}

function requireArchiveReasonCode(raw) {
  const code = asTrimmedString(raw);
  if (!ARCHIVE_REASON_CODES.includes(code)) {
    throw new LifecycleWriteError('invalid_reason_code', 400, 'reasonCode is not an approved archive reason');
  }
  return code;
}

async function loadContactDecisions(tx, userId) {
  return tx.readerContactDecision.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}

async function openRestoreFallbackReview(tx, { userId, actor }) {
  const existing = await tx.readerIdentityReview.findFirst({
    where: {
      primaryUserId: userId,
      reasonCode: RESTORE_PRIOR_STATUS_REASON,
      status: 'open',
    },
    select: { id: true },
  });
  if (existing) return existing;
  return tx.readerIdentityReview.create({
    data: {
      primaryUserId: userId,
      reasonCode: RESTORE_PRIOR_STATUS_REASON,
      details:
        'Restore could not use a recorded prior operational status. The profile was restored to inactive and held for administrative review. Discretionary outreach stays suppressed until review is resolved.',
      status: 'open',
      actorType: actor.actorType,
      actorLabel: actor.actorLabel,
      actorId: actor.actorId,
    },
  });
}

async function loadActor(tx, actorId) {
  const id = asTrimmedString(actorId);
  if (!id) {
    throw new LifecycleWriteError('actor_required', 400, 'actorId of an active FulfillmentUser is required');
  }
  const helper = await tx.fulfillmentUser.findUnique({ where: { id } });
  if (!helper) {
    throw new LifecycleWriteError('actor_not_found', 400, 'actorId does not match a fulfillment helper');
  }
  if (!helper.active) {
    throw new LifecycleWriteError('actor_inactive', 400, 'actorId belongs to an inactive fulfillment helper');
  }
  return { actorType: 'admin', actorLabel: helper.name, actorId: helper.id };
}

async function loadProfile(tx, readerProfileId) {
  const id = asTrimmedString(readerProfileId);
  if (!id) {
    throw new LifecycleWriteError('reader_not_found', 404, 'readerProfileId is required');
  }
  const profile = await tx.readerProfile.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      status: true,
      archiveReasonCode: true,
      archiveDetails: true,
      archivePriorStatus: true,
    },
  });
  if (!profile) {
    throw new LifecycleWriteError('reader_not_found', 404, 'Reader profile was not found');
  }
  return profile;
}

async function loadEvidence(tx, evidenceId) {
  const id = asTrimmedString(evidenceId);
  if (!id) {
    throw new LifecycleWriteError('evidence_not_found', 404, 'evidenceId is required');
  }
  const row = await tx.readerEvidence.findUnique({ where: { id } });
  if (!row) {
    throw new LifecycleWriteError('evidence_not_found', 404, 'Evidence was not found');
  }
  return row;
}

async function profileForUser(tx, userId) {
  const profile = await tx.readerProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true,
      status: true,
      archiveReasonCode: true,
      archiveDetails: true,
      archivePriorStatus: true,
    },
  });
  if (!profile) {
    throw new LifecycleWriteError('reader_not_found', 404, 'Reader profile was not found for this evidence');
  }
  return profile;
}

function assertProfileNotArchived(profile) {
  if (profile && profile.status === 'archived') {
    throw new LifecycleWriteError(
      ARCHIVED_PROFILE_ERROR,
      409,
      'Archived operational readers can only be restored',
    );
  }
}

function assertCurrentEvidence(row) {
  rejectProtectedKind(row.kind);
  if (!MUTABLE_KINDS.includes(row.kind)) {
    throw new LifecycleWriteError('evidence_kind_not_mutable', 400, 'This evidence kind cannot be changed here');
  }
  if (row.supersededById) {
    throw new LifecycleWriteError('stale_evidence', 409, 'Evidence was already superseded');
  }
}

function assertExpectedCurrent(row, expectedStatus) {
  if (row.status !== expectedStatus || row.supersededById) {
    throw new LifecycleWriteError(
      'stale_evidence',
      409,
      'Evidence was changed by another request',
    );
  }
}

async function countCurrentSameKind(tx, userId, kind, exceptId) {
  return tx.readerEvidence.count({
    where: {
      userId,
      kind,
      status: { in: [...CURRENT_STATUSES] },
      supersededById: null,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
  });
}

async function writeAudit(tx, { userId, actor, action, entityType, entityId, beforeJson, afterJson, reason }) {
  return tx.readerAdminAudit.create({
    data: {
      relatedUserId: userId,
      actorType: actor.actorType,
      actorLabel: actor.actorLabel,
      actorId: actor.actorId,
      action,
      entityType,
      entityId,
      beforeJson: beforeJson == null ? undefined : beforeJson,
      afterJson: afterJson == null ? undefined : afterJson,
      reason,
    },
  });
}

async function loadClassifiedReader(prismaOrTx, readerProfileId) {
  const reader = await getReaderLifecycleDetail(prismaOrTx, { readerProfileId });
  if (!reader) {
    throw new LifecycleWriteError('reader_not_found', 404, 'Reader profile was not found after mutation');
  }
  return reader;
}

function mutationReceipt({ warnings, mutation, readerProfileId, userId, completedAt }) {
  return cloneJson({
    ok: true,
    warnings: Array.isArray(warnings) ? warnings : [],
    completedAt: completedAt || new Date().toISOString(),
    readerProfileId,
    userId,
    mutation,
  });
}

function toServiceResult(receipt, reader, replay) {
  return {
    ok: true,
    replay: Boolean(replay),
    warnings: receipt.warnings || [],
    completedAt: receipt.completedAt || null,
    readerProfileId: receipt.readerProfileId,
    mutation: receipt.mutation,
    reader,
  };
}

function assertCompletedReceipt(stored) {
  if (!stored || stored.pending || !stored.readerProfileId || !stored.mutation) {
    throw new LifecycleWriteError(
      'idempotency_incomplete',
      409,
      'Idempotency-Key is already reserved',
    );
  }
}

function assertMatchingHash(existing, requestHash) {
  if (existing.requestHash !== requestHash) {
    throw new LifecycleWriteError(
      'idempotency_conflict',
      409,
      'Idempotency-Key was reused with a different request',
    );
  }
}

async function replayCompleted(prismaOrTx, existing, requestHash) {
  assertMatchingHash(existing, requestHash);
  assertCompletedReceipt(existing.resultJson);
  const reader = await loadClassifiedReader(prismaOrTx, existing.resultJson.readerProfileId);
  return toServiceResult(existing.resultJson, reader, true);
}

async function completeMutation(tx, { profile, warnings, mutation }) {
  const reader = await loadClassifiedReader(tx, profile.id);
  return {
    readerProfileId: profile.id,
    userId: profile.userId,
    warnings: warnings || [],
    mutation,
    reader,
  };
}

async function withIdempotency(prisma, { idempotencyKey, action, request }, mutate) {
  const originRef = requireIdempotencyKey(idempotencyKey);
  const requestHash = hashRequest({ action, request });
  const guarded = asMutationGuardedPrisma(prisma);

  const existing = await guarded.readerMutationIdempotency.findUnique({
    where: { origin_originRef: { origin: IDEMPOTENCY_ORIGIN, originRef } },
  });
  if (existing && existing.resultJson && !existing.resultJson.pending) {
    return replayCompleted(prisma, existing, requestHash);
  }

  return guarded.$transaction(async (tx) => {
    try {
      await tx.readerMutationIdempotency.create({
        data: {
          origin: IDEMPOTENCY_ORIGIN,
          originRef,
          requestHash,
          action,
          resultJson: { pending: true },
        },
      });
    } catch (err) {
      if (err && err.code === 'P2002') {
        const raced = await tx.readerMutationIdempotency.findUnique({
          where: { origin_originRef: { origin: IDEMPOTENCY_ORIGIN, originRef } },
        });
        if (!raced) throw err;
        return replayCompleted(tx, raced, requestHash);
      }
      throw err;
    }

    const result = await mutate(tx);
    const receipt = mutationReceipt(result);
    await tx.readerMutationIdempotency.update({
      where: { origin_originRef: { origin: IDEMPOTENCY_ORIGIN, originRef } },
      data: {
        relatedUserId: result.userId || null,
        entityType: result.mutation ? result.mutation.entityType : null,
        entityId: result.mutation ? result.mutation.entityId : null,
        resultJson: receipt,
      },
    });
    return toServiceResult(receipt, result.reader, false);
  });
}

async function insertEvidence(tx, { userId, kind, status, sourceLabel, purchaseDate, details, reason, actor, origin, originRef }) {
  return tx.readerEvidence.create({
    data: {
      userId,
      kind,
      status,
      sourceLabel,
      purchaseDate,
      stripeSessionId: null,
      details,
      reason,
      actorType: actor.actorType,
      actorLabel: actor.actorLabel,
      actorId: actor.actorId,
      origin,
      originRef,
    },
  });
}

async function supersedeEvidence(tx, { evidenceId, expectedStatus, supersededById }) {
  const updated = await tx.readerEvidence.updateMany({
    where: { id: evidenceId, status: expectedStatus, supersededById: null },
    data: { status: 'superseded', supersededById },
  });
  if (updated.count !== 1) {
    throw new LifecycleWriteError('stale_evidence', 409, 'Evidence was changed by another request');
  }
}

async function addEvidence(prisma, input = {}) {
  rejectStripeSessionId(input.stripeSessionId);
  const kind = asTrimmedString(input.kind);
  if (!ADD_KINDS.includes(kind)) {
    if (kind === 'website_stripe' || kind === 'aggregate_marketing_not_individual') {
      rejectProtectedKind(kind);
    }
    throw new LifecycleWriteError('invalid_kind', 400, 'kind must be a manual retailer or gift evidence kind');
  }
  const purchaseDate = parsePurchaseDate(input.purchaseDate);
  const details = optionalDetails(input.details);
  const reason = requireReason(input.reason);
  const sourceLabel = sourceLabelForKind(kind, input.sourceLabel);
  const request = {
    readerProfileId: asTrimmedString(input.readerProfileId),
    kind,
    purchaseDate: purchaseDate ? purchaseDate.toISOString() : null,
    details,
    sourceLabel,
    reason,
    actorId: asTrimmedString(input.actorId),
  };
  return withIdempotency(prisma, { idempotencyKey: input.idempotencyKey, action: 'evidence.add', request }, async (tx) => {
    const actor = await loadActor(tx, input.actorId);
    const profile = await loadProfile(tx, input.readerProfileId);
    assertProfileNotArchived(profile);
    const sameKind = await countCurrentSameKind(tx, profile.userId, kind);
    const created = await insertEvidence(tx, {
      userId: profile.userId,
      kind,
      status: 'provisional',
      sourceLabel,
      purchaseDate,
      details,
      reason,
      actor,
      origin: EVIDENCE_ORIGIN.add,
      originRef: requireIdempotencyKey(input.idempotencyKey),
    });
    const audit = await writeAudit(tx, {
      userId: profile.userId,
      actor,
      action: kind === 'gift_book_owner' ? 'evidence.add_gift' : 'evidence.add_provisional',
      entityType: 'ReaderEvidence',
      entityId: created.id,
      beforeJson: null,
      afterJson: created,
      reason,
    });
    const warnings = sameKind > 0 ? ['multiple_current_same_kind'] : [];
    return completeMutation(tx, {
      profile,
      warnings,
      mutation: {
        action: 'evidence.add',
        entityType: 'ReaderEvidence',
        entityId: created.id,
        evidenceId: created.id,
        auditId: audit.id,
      },
    });
  });
}

async function confirmEvidence(prisma, input = {}) {
  const expectedStatus = requireExpectedStatus(input.expectedStatus, ['provisional']);
  const reason = requireReason(input.reason);
  const request = {
    evidenceId: asTrimmedString(input.evidenceId),
    expectedStatus,
    reason,
    actorId: asTrimmedString(input.actorId),
  };
  return withIdempotency(prisma, { idempotencyKey: input.idempotencyKey, action: 'evidence.confirm', request }, async (tx) => {
    const actor = await loadActor(tx, input.actorId);
    const original = await loadEvidence(tx, input.evidenceId);
    assertCurrentEvidence(original);
    assertExpectedCurrent(original, expectedStatus);
    const profile = await profileForUser(tx, original.userId);
    assertProfileNotArchived(profile);
    const replacement = await insertEvidence(tx, {
      userId: original.userId,
      kind: original.kind,
      status: 'confirmed',
      sourceLabel: original.sourceLabel,
      purchaseDate: original.purchaseDate,
      details: original.details,
      reason,
      actor,
      origin: EVIDENCE_ORIGIN.confirm,
      originRef: requireIdempotencyKey(input.idempotencyKey),
    });
    await supersedeEvidence(tx, {
      evidenceId: original.id,
      expectedStatus,
      supersededById: replacement.id,
    });
    const audit = await writeAudit(tx, {
      userId: original.userId,
      actor,
      action: 'evidence.confirm',
      entityType: 'ReaderEvidence',
      entityId: replacement.id,
      beforeJson: original,
      afterJson: { originalId: original.id, replacement },
      reason,
    });
    return completeMutation(tx, {
      profile,
      mutation: {
        action: 'evidence.confirm',
        entityType: 'ReaderEvidence',
        entityId: replacement.id,
        evidenceId: replacement.id,
        predecessorEvidenceId: original.id,
        replacementEvidenceId: replacement.id,
        auditId: audit.id,
      },
    });
  });
}

async function correctEvidence(prisma, input = {}) {
  rejectStripeSessionId(input.stripeSessionId);
  const expectedStatus = requireExpectedStatus(input.expectedStatus, [...CURRENT_STATUSES]);
  const reason = requireReason(input.reason);
  const nextKind = input.kind == null ? null : asTrimmedString(input.kind);
  if (nextKind) {
    if (PROTECTED_KINDS.includes(nextKind)) rejectProtectedKind(nextKind);
    if (!ADD_KINDS.includes(nextKind) && nextKind !== 'kris_personal_knowledge') {
      throw new LifecycleWriteError('invalid_kind', 400, 'corrected kind is not allowed');
    }
  }
  const nextStatus = input.status == null ? null : asTrimmedString(input.status);
  if (nextStatus && !CURRENT_STATUSES.includes(nextStatus)) {
    throw new LifecycleWriteError('invalid_status', 400, 'corrected status must be provisional or confirmed');
  }
  const purchaseDate = input.purchaseDate === undefined ? undefined : parsePurchaseDate(input.purchaseDate);
  const details = input.details === undefined ? undefined : optionalDetails(input.details);
  const request = {
    evidenceId: asTrimmedString(input.evidenceId),
    expectedStatus,
    kind: nextKind,
    status: nextStatus,
    purchaseDate: purchaseDate === undefined ? undefined : purchaseDate ? purchaseDate.toISOString() : null,
    details,
    sourceLabel: input.sourceLabel == null ? null : asTrimmedString(input.sourceLabel),
    reason,
    actorId: asTrimmedString(input.actorId),
  };
  return withIdempotency(prisma, { idempotencyKey: input.idempotencyKey, action: 'evidence.correct', request }, async (tx) => {
    const actor = await loadActor(tx, input.actorId);
    const original = await loadEvidence(tx, input.evidenceId);
    assertCurrentEvidence(original);
    assertExpectedCurrent(original, expectedStatus);
    const kind = nextKind || original.kind;
    const status = nextStatus || original.status;
    const sourceLabel =
      nextKind || input.sourceLabel != null
        ? sourceLabelForKind(kind, input.sourceLabel)
        : original.sourceLabel;
    const profile = await profileForUser(tx, original.userId);
    assertProfileNotArchived(profile);
    const replacement = await insertEvidence(tx, {
      userId: original.userId,
      kind,
      status,
      sourceLabel,
      purchaseDate: purchaseDate === undefined ? original.purchaseDate : purchaseDate,
      details: details === undefined ? original.details : details,
      reason,
      actor,
      origin: EVIDENCE_ORIGIN.correct,
      originRef: requireIdempotencyKey(input.idempotencyKey),
    });
    await supersedeEvidence(tx, {
      evidenceId: original.id,
      expectedStatus,
      supersededById: replacement.id,
    });
    const sameKind = await countCurrentSameKind(tx, original.userId, kind, replacement.id);
    const audit = await writeAudit(tx, {
      userId: original.userId,
      actor,
      action: 'evidence.correct',
      entityType: 'ReaderEvidence',
      entityId: replacement.id,
      beforeJson: original,
      afterJson: { originalId: original.id, replacement },
      reason,
    });
    return completeMutation(tx, {
      profile,
      warnings: sameKind > 0 ? ['multiple_current_same_kind'] : [],
      mutation: {
        action: 'evidence.correct',
        entityType: 'ReaderEvidence',
        entityId: replacement.id,
        evidenceId: replacement.id,
        predecessorEvidenceId: original.id,
        replacementEvidenceId: replacement.id,
        auditId: audit.id,
      },
    });
  });
}

async function disputeEvidence(prisma, input = {}) {
  const expectedStatus = requireExpectedStatus(input.expectedStatus, [...CURRENT_STATUSES]);
  const reason = requireReason(input.reason);
  const request = {
    evidenceId: asTrimmedString(input.evidenceId),
    expectedStatus,
    reason,
    actorId: asTrimmedString(input.actorId),
  };
  return withIdempotency(prisma, { idempotencyKey: input.idempotencyKey, action: 'evidence.dispute', request }, async (tx) => {
    const actor = await loadActor(tx, input.actorId);
    const original = await loadEvidence(tx, input.evidenceId);
    assertCurrentEvidence(original);
    assertExpectedCurrent(original, expectedStatus);
    const profile = await profileForUser(tx, original.userId);
    assertProfileNotArchived(profile);
    const updated = await tx.readerEvidence.updateMany({
      where: { id: original.id, status: expectedStatus, supersededById: null },
      data: { status: 'disputed' },
    });
    if (updated.count !== 1) {
      throw new LifecycleWriteError('stale_evidence', 409, 'Evidence was changed by another request');
    }
    const disputed = await tx.readerEvidence.findUnique({ where: { id: original.id } });
    const audit = await writeAudit(tx, {
      userId: original.userId,
      actor,
      action: 'evidence.dispute',
      entityType: 'ReaderEvidence',
      entityId: original.id,
      beforeJson: original,
      afterJson: disputed,
      reason,
    });
    return completeMutation(tx, {
      profile,
      mutation: {
        action: 'evidence.dispute',
        entityType: 'ReaderEvidence',
        entityId: original.id,
        evidenceId: original.id,
        auditId: audit.id,
      },
    });
  });
}

async function replaceEvidence(prisma, input = {}) {
  rejectStripeSessionId(input.stripeSessionId);
  const expectedStatus = requireExpectedStatus(input.expectedStatus, ['disputed']);
  const reason = requireReason(input.reason);
  const nextKind = input.kind == null ? null : asTrimmedString(input.kind);
  if (nextKind) {
    if (PROTECTED_KINDS.includes(nextKind)) rejectProtectedKind(nextKind);
    if (!ADD_KINDS.includes(nextKind) && nextKind !== 'kris_personal_knowledge') {
      throw new LifecycleWriteError('invalid_kind', 400, 'replacement kind is not allowed');
    }
  }
  const nextStatus = input.status == null ? 'confirmed' : asTrimmedString(input.status);
  if (!CURRENT_STATUSES.includes(nextStatus)) {
    throw new LifecycleWriteError('invalid_status', 400, 'replacement status must be provisional or confirmed');
  }
  const purchaseDate = input.purchaseDate === undefined ? undefined : parsePurchaseDate(input.purchaseDate);
  const details = input.details === undefined ? undefined : optionalDetails(input.details);
  const request = {
    evidenceId: asTrimmedString(input.evidenceId),
    expectedStatus,
    kind: nextKind,
    status: nextStatus,
    purchaseDate: purchaseDate === undefined ? undefined : purchaseDate ? purchaseDate.toISOString() : null,
    details,
    sourceLabel: input.sourceLabel == null ? null : asTrimmedString(input.sourceLabel),
    reason,
    actorId: asTrimmedString(input.actorId),
  };
  return withIdempotency(prisma, { idempotencyKey: input.idempotencyKey, action: 'evidence.replace', request }, async (tx) => {
    const actor = await loadActor(tx, input.actorId);
    const original = await loadEvidence(tx, input.evidenceId);
    rejectProtectedKind(original.kind);
    if (!MUTABLE_KINDS.includes(original.kind)) {
      throw new LifecycleWriteError('evidence_kind_not_mutable', 400, 'This evidence kind cannot be changed here');
    }
    if (original.status !== 'disputed' || original.supersededById) {
      throw new LifecycleWriteError('stale_evidence', 409, 'Evidence was changed by another request');
    }
    assertExpectedCurrent(original, expectedStatus);
    const kind = nextKind || original.kind;
    const sourceLabel =
      nextKind || input.sourceLabel != null
        ? sourceLabelForKind(kind, input.sourceLabel)
        : original.sourceLabel;
    const profile = await profileForUser(tx, original.userId);
    assertProfileNotArchived(profile);
    const replacement = await insertEvidence(tx, {
      userId: original.userId,
      kind,
      status: nextStatus,
      sourceLabel,
      purchaseDate: purchaseDate === undefined ? original.purchaseDate : purchaseDate,
      details: details === undefined ? original.details : details,
      reason,
      actor,
      origin: EVIDENCE_ORIGIN.replace,
      originRef: requireIdempotencyKey(input.idempotencyKey),
    });
    await supersedeEvidence(tx, {
      evidenceId: original.id,
      expectedStatus: 'disputed',
      supersededById: replacement.id,
    });
    const audit = await writeAudit(tx, {
      userId: original.userId,
      actor,
      action: 'evidence.replace_disputed',
      entityType: 'ReaderEvidence',
      entityId: replacement.id,
      beforeJson: original,
      afterJson: { originalId: original.id, replacement },
      reason,
    });
    return completeMutation(tx, {
      profile,
      mutation: {
        action: 'evidence.replace',
        entityType: 'ReaderEvidence',
        entityId: replacement.id,
        evidenceId: replacement.id,
        predecessorEvidenceId: original.id,
        replacementEvidenceId: replacement.id,
        auditId: audit.id,
      },
    });
  });
}

async function addContactDecision(prisma, input = {}) {
  const decision = asTrimmedString(input.decision);
  if (decision !== 'suppress' && decision !== 'allow') {
    throw new LifecycleWriteError('invalid_decision', 400, 'decision must be suppress or allow');
  }
  const reason = requireReason(input.reason);
  const request = {
    readerProfileId: asTrimmedString(input.readerProfileId),
    decision,
    reason,
    actorId: asTrimmedString(input.actorId),
  };
  return withIdempotency(prisma, { idempotencyKey: input.idempotencyKey, action: 'contact_decision.add', request }, async (tx) => {
    const actor = await loadActor(tx, input.actorId);
    const profile = await loadProfile(tx, input.readerProfileId);
    assertProfileNotArchived(profile);
    const created = await tx.readerContactDecision.create({
      data: {
        userId: profile.userId,
        decision,
        reason,
        actorType: actor.actorType,
        actorLabel: actor.actorLabel,
        actorId: actor.actorId,
        origin: EVIDENCE_ORIGIN.decision,
        originRef: requireIdempotencyKey(input.idempotencyKey),
      },
    });
    const audit = await writeAudit(tx, {
      userId: profile.userId,
      actor,
      action: decision === 'suppress' ? 'contact_decision.suppress' : 'contact_decision.allow',
      entityType: 'ReaderContactDecision',
      entityId: created.id,
      beforeJson: null,
      afterJson: created,
      reason,
    });
    return completeMutation(tx, {
      profile,
      mutation: {
        action: `contact_decision.${decision}`,
        entityType: 'ReaderContactDecision',
        entityId: created.id,
        decisionId: created.id,
        auditId: audit.id,
      },
    });
  });
}

async function openIdentityReview(prisma, input = {}) {
  const reasonCode = asTrimmedString(input.reasonCode);
  if (!IDENTITY_REASON_CODES.includes(reasonCode)) {
    throw new LifecycleWriteError('invalid_reason_code', 400, 'reasonCode is not an approved identity reason');
  }
  const details = optionalDetails(input.details, { required: reasonCode === 'other' });
  if (reasonCode === 'other' && (!details || details.length < 8)) {
    throw new LifecycleWriteError('invalid_details', 400, 'details are required when reasonCode is other');
  }
  const reason = requireReason(input.reason);
  const otherUserId = asTrimmedString(input.otherUserId) || null;
  const request = {
    readerProfileId: asTrimmedString(input.readerProfileId),
    reasonCode,
    details,
    otherUserId,
    reason,
    actorId: asTrimmedString(input.actorId),
  };
  return withIdempotency(prisma, { idempotencyKey: input.idempotencyKey, action: 'identity_review.open', request }, async (tx) => {
    const actor = await loadActor(tx, input.actorId);
    const profile = await loadProfile(tx, input.readerProfileId);
    assertProfileNotArchived(profile);
    if (otherUserId) {
      if (otherUserId === profile.userId) {
        throw new LifecycleWriteError('invalid_other_user', 400, 'otherUserId cannot be the same as the primary reader');
      }
      const other = await tx.user.findUnique({ where: { id: otherUserId }, select: { id: true } });
      if (!other) {
        throw new LifecycleWriteError('other_user_not_found', 404, 'otherUserId was not found');
      }
    }
    const duplicate = await tx.readerIdentityReview.findFirst({
      where: {
        primaryUserId: profile.userId,
        otherUserId: otherUserId,
        reasonCode,
        status: 'open',
      },
    });
    if (duplicate) {
      throw new LifecycleWriteError(
        'duplicate_open_identity_review',
        409,
        'An identical open identity review already exists',
      );
    }
    const created = await tx.readerIdentityReview.create({
      data: {
        primaryUserId: profile.userId,
        otherUserId,
        reasonCode,
        details,
        status: 'open',
        actorType: actor.actorType,
        actorLabel: actor.actorLabel,
        actorId: actor.actorId,
      },
    });
    const audit = await writeAudit(tx, {
      userId: profile.userId,
      actor,
      action: 'identity_review.open',
      entityType: 'ReaderIdentityReview',
      entityId: created.id,
      beforeJson: null,
      afterJson: created,
      reason,
    });
    return completeMutation(tx, {
      profile,
      mutation: {
        action: 'identity_review.open',
        entityType: 'ReaderIdentityReview',
        entityId: created.id,
        reviewId: created.id,
        auditId: audit.id,
      },
    });
  });
}

async function resolveIdentityReview(prisma, input = {}) {
  const expectedStatus = requireExpectedStatus(input.expectedStatus, ['open']);
  const status = asTrimmedString(input.status);
  if (status !== 'dismissed' && status !== 'resolved_keep_separate') {
    throw new LifecycleWriteError(
      'invalid_resolution',
      400,
      'status must be dismissed or resolved_keep_separate',
    );
  }
  const resolutionReason = requireReason(input.resolutionReason);
  const request = {
    reviewId: asTrimmedString(input.reviewId),
    expectedStatus,
    status,
    resolutionReason,
    actorId: asTrimmedString(input.actorId),
  };
  return withIdempotency(prisma, { idempotencyKey: input.idempotencyKey, action: 'identity_review.resolve', request }, async (tx) => {
    const actor = await loadActor(tx, input.actorId);
    const reviewId = asTrimmedString(input.reviewId);
    if (!reviewId) {
      throw new LifecycleWriteError('review_not_found', 404, 'reviewId is required');
    }
    const original = await tx.readerIdentityReview.findUnique({ where: { id: reviewId } });
    if (!original) {
      throw new LifecycleWriteError('review_not_found', 404, 'Identity review was not found');
    }
    if (original.status !== expectedStatus) {
      throw new LifecycleWriteError('stale_review', 409, 'Identity review was changed by another request');
    }
    const profile = await profileForUser(tx, original.primaryUserId);
    assertProfileNotArchived(profile);
    const resolvedAt = new Date();
    const updated = await tx.readerIdentityReview.updateMany({
      where: { id: original.id, status: 'open' },
      data: {
        status,
        resolutionReason,
        resolvedAt,
      },
    });
    if (updated.count !== 1) {
      throw new LifecycleWriteError('stale_review', 409, 'Identity review was changed by another request');
    }
    const resolved = await tx.readerIdentityReview.findUnique({ where: { id: original.id } });
    if (
      resolved.actorType !== original.actorType ||
      resolved.actorLabel !== original.actorLabel ||
      resolved.actorId !== original.actorId
    ) {
      throw new LifecycleWriteError('opener_attribution_lost', 500, 'Resolver must not overwrite opener actor fields');
    }
    const audit = await writeAudit(tx, {
      userId: original.primaryUserId,
      actor,
      action: 'identity_review.resolve',
      entityType: 'ReaderIdentityReview',
      entityId: original.id,
      beforeJson: {
        id: original.id,
        status: original.status,
        opener: {
          actorType: original.actorType,
          actorLabel: original.actorLabel,
          actorId: original.actorId,
        },
      },
      afterJson: {
        id: resolved.id,
        status: resolved.status,
        resolutionReason: resolved.resolutionReason,
        resolvedAt: resolved.resolvedAt,
        opener: {
          actorType: resolved.actorType,
          actorLabel: resolved.actorLabel,
          actorId: resolved.actorId,
        },
        resolver: {
          actorType: actor.actorType,
          actorLabel: actor.actorLabel,
          actorId: actor.actorId,
        },
      },
      reason: resolutionReason,
    });
    return completeMutation(tx, {
      profile,
      mutation: {
        action: 'identity_review.resolve',
        entityType: 'ReaderIdentityReview',
        entityId: original.id,
        reviewId: original.id,
        auditId: audit.id,
      },
    });
  });
}

async function archiveReader(prisma, input = {}) {
  const expectedStatus = requireExpectedStatus(input.expectedStatus, [...ARCHIVEABLE_STATUSES]);
  const reasonCode = requireArchiveReasonCode(input.reasonCode);
  const details = optionalDetails(input.details, { required: reasonCode === 'other' });
  if (reasonCode === 'other' && (!details || details.length < 8)) {
    throw new LifecycleWriteError('invalid_details', 400, 'details are required when reasonCode is other');
  }
  const reason = requireReason(input.reason);
  const confirmed = requireConfirmed(input.confirmed);
  const request = {
    readerProfileId: asTrimmedString(input.readerProfileId),
    expectedStatus,
    reasonCode,
    details,
    reason,
    actorId: asTrimmedString(input.actorId),
    confirmed,
  };
  return withIdempotency(prisma, { idempotencyKey: input.idempotencyKey, action: 'profile.archive', request }, async (tx) => {
    const actor = await loadActor(tx, input.actorId);
    const profile = await loadProfile(tx, input.readerProfileId);
    assertProfileNotArchived(profile);
    const archiveDetails = details || reason;
    const updated = await tx.readerProfile.updateMany({
      where: { id: profile.id, status: expectedStatus },
      data: {
        status: 'archived',
        archiveReasonCode: reasonCode,
        archiveDetails,
        archivePriorStatus: expectedStatus,
      },
    });
    if (updated.count !== 1) {
      throw new LifecycleWriteError('stale_status', 409, 'Reader profile status was changed by another request');
    }
    const after = await tx.readerProfile.findUnique({
      where: { id: profile.id },
      select: {
        id: true,
        status: true,
        archiveReasonCode: true,
        archiveDetails: true,
        archivePriorStatus: true,
      },
    });
    let contactDecisionId = null;
    if (ARCHIVE_CONTACT_REASON_CODES.includes(reasonCode)) {
      const createdDecision = await tx.readerContactDecision.create({
        data: {
          userId: profile.userId,
          decision: 'suppress',
          reason,
          actorType: actor.actorType,
          actorLabel: actor.actorLabel,
          actorId: actor.actorId,
          origin: ARCHIVE_CONTACT_ORIGIN,
          originRef: requireIdempotencyKey(input.idempotencyKey),
        },
      });
      contactDecisionId = createdDecision.id;
    }
    const warnings = reasonCode === 'duplicate_or_identity_issue' ? [DUPLICATE_ARCHIVE_WARNING] : [];
    const audit = await writeAudit(tx, {
      userId: profile.userId,
      actor,
      action: 'profile.archive',
      entityType: 'ReaderProfile',
      entityId: profile.id,
      beforeJson: {
        status: profile.status,
        archiveReasonCode: profile.archiveReasonCode || null,
        archiveDetails: profile.archiveDetails || null,
        archivePriorStatus: profile.archivePriorStatus || null,
      },
      afterJson: {
        status: after.status,
        archiveReasonCode: after.archiveReasonCode,
        archiveDetails: after.archiveDetails,
        archivePriorStatus: after.archivePriorStatus,
        contactDecisionId,
        operation: 'archive',
      },
      reason,
    });
    return completeMutation(tx, {
      profile,
      warnings,
      mutation: {
        action: 'profile.archive',
        entityType: 'ReaderProfile',
        entityId: profile.id,
        priorStatus: expectedStatus,
        newStatus: 'archived',
        reasonCode,
        contactDecisionId,
        auditId: audit.id,
      },
    });
  });
}

async function restoreReader(prisma, input = {}) {
  const expectedStatus = requireExpectedStatus(input.expectedStatus, ['archived']);
  const reason = requireReason(input.reason);
  const confirmed = requireConfirmed(input.confirmed);
  const request = {
    readerProfileId: asTrimmedString(input.readerProfileId),
    expectedStatus,
    reason,
    actorId: asTrimmedString(input.actorId),
    confirmed,
  };
  return withIdempotency(prisma, { idempotencyKey: input.idempotencyKey, action: 'profile.restore', request }, async (tx) => {
    const actor = await loadActor(tx, input.actorId);
    const profile = await loadProfile(tx, input.readerProfileId);
    const restorePlan = resolvedRestorePlan(profile.archivePriorStatus);
    const restoredStatus = restorePlan.status;
    const updated = await tx.readerProfile.updateMany({
      where: { id: profile.id, status: 'archived' },
      data: {
        status: restoredStatus,
        archiveReasonCode: null,
        archiveDetails: null,
        archivePriorStatus: null,
      },
    });
    if (updated.count !== 1) {
      throw new LifecycleWriteError('stale_status', 409, 'Reader profile status was changed by another request');
    }
    const after = await tx.readerProfile.findUnique({
      where: { id: profile.id },
      select: {
        id: true,
        status: true,
        archiveReasonCode: true,
        archiveDetails: true,
        archivePriorStatus: true,
      },
    });
    const decisions = await loadContactDecisions(tx, profile.userId);
    const independentDoNotContactPreserved = independentDncActive(decisions);
    let contactDecisionId = null;
    if (archiveLaneSuppressActive(decisions)) {
      const createdDecision = await tx.readerContactDecision.create({
        data: {
          userId: profile.userId,
          decision: 'allow',
          reason,
          actorType: actor.actorType,
          actorLabel: actor.actorLabel,
          actorId: actor.actorId,
          origin: RESTORE_CONTACT_ORIGIN,
          originRef: requireIdempotencyKey(input.idempotencyKey),
        },
      });
      contactDecisionId = createdDecision.id;
    }
    let restoreReviewId = null;
    const warnings = [];
    if (restorePlan.fallback) {
      const review = await openRestoreFallbackReview(tx, { userId: profile.userId, actor });
      restoreReviewId = review.id;
      warnings.push('prior_status_unavailable');
    }
    const audit = await writeAudit(tx, {
      userId: profile.userId,
      actor,
      action: 'profile.restore',
      entityType: 'ReaderProfile',
      entityId: profile.id,
      beforeJson: {
        status: profile.status,
        archiveReasonCode: profile.archiveReasonCode || null,
        archiveDetails: profile.archiveDetails || null,
        archivePriorStatus: profile.archivePriorStatus || null,
      },
      afterJson: {
        status: after.status,
        archiveReasonCode: after.archiveReasonCode,
        archiveDetails: after.archiveDetails,
        archivePriorStatus: after.archivePriorStatus,
        contactDecisionId,
        restoreReviewId,
        operation: 'restore',
        restoreFallback: restorePlan.fallback,
        independentDoNotContactPreserved,
      },
      reason,
    });
    return completeMutation(tx, {
      profile,
      warnings,
      mutation: {
        action: 'profile.restore',
        entityType: 'ReaderProfile',
        entityId: profile.id,
        priorStatus: 'archived',
        newStatus: restoredStatus,
        contactDecisionId,
        restoreReviewId,
        restoreFallback: restorePlan.fallback,
        auditId: audit.id,
      },
    });
  });
}

function createReaderLifecycleWriteService(prisma) {
  return {
    addEvidence: (input) => addEvidence(prisma, input),
    confirmEvidence: (input) => confirmEvidence(prisma, input),
    correctEvidence: (input) => correctEvidence(prisma, input),
    disputeEvidence: (input) => disputeEvidence(prisma, input),
    replaceEvidence: (input) => replaceEvidence(prisma, input),
    addContactDecision: (input) => addContactDecision(prisma, input),
    openIdentityReview: (input) => openIdentityReview(prisma, input),
    resolveIdentityReview: (input) => resolveIdentityReview(prisma, input),
    archiveReader: (input) => archiveReader(prisma, input),
    restoreReader: (input) => restoreReader(prisma, input),
  };
}

module.exports = {
  createReaderLifecycleWriteService,
  LifecycleWriteError,
  asMutationGuardedPrisma,
  IDEMPOTENCY_ORIGIN,
  ADD_KINDS,
  IDENTITY_REASON_CODES,
  ARCHIVE_REASON_CODES,
  ARCHIVE_CONTACT_ORIGIN,
  RESTORE_CONTACT_ORIGIN,
  RESTORE_PRIOR_STATUS_REASON,
  DUPLICATE_ARCHIVE_WARNING,
  ARCHIVED_PROFILE_ERROR,
  ALLOWED_WRITE_DELEGATES,
};
