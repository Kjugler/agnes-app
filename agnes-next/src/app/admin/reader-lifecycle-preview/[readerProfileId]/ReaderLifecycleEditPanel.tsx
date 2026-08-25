'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { FULFILLMENT_AUTH_HREF } from '../readerLifecyclePreviewModel';
import {
  evidenceKindLabel,
  formatOccurredAt,
  parseDetailResponse,
  type LifecycleEvidence,
  type ReaderLifecycleDetail,
} from './readerLifecycleDetailModel';
import styles from './detail.module.css';
import listStyles from '../preview.module.css';
import {
  ADD_KIND_OPTIONS,
  ALLOW_CONTACT_WARNING,
  CONFIRM_REPLACES_NOTE,
  DISPUTE_CONSEQUENCE,
  IDENTITY_OPEN_REASON_OPTIONS,
  IDENTITY_RESOLVE_NOTE,
  IDENTITY_RESOLVE_OPTIONS,
  NO_EMAIL_STATEMENT,
  NO_NURTURE_JOB,
  PROVISIONAL_ADD_NOTE,
  REPLACE_CONSEQUENCE,
  SUPERSEDE_CONFIRM_NOTE,
  WEBSITE_WRONG_OWNER_NOTE,
  actionTitle,
  actorName,
  addEvidencePayload,
  beginIdempotencySession,
  canCorrectEvidence,
  classifyMutationError,
  confirmButtonLabel,
  confirmEvidencePayload,
  contactDecisionPayload,
  correctEvidencePayload,
  disputeEvidencePayload,
  expectedClassificationNote,
  fieldErrorFromCode,
  historyPreservationNote,
  idempotencyKeyForAttempt,
  mutationErrorCopy,
  mutationPath,
  openIdentityReviewPayload,
  parseMutationResponse,
  permittedActions,
  replaceEvidencePayload,
  resolveIdentityReviewPayload,
  selectableActors,
  successMessage,
  toDateInputValue,
  validateDetails,
  validateReason,
  type AddEvidenceDraft,
  type AddEvidenceKind,
  type CorrectEvidenceDraft,
  type EditAction,
  type IdempotencySession,
  type IdentityOpenReason,
  type IdentityResolveStatus,
  type MutationErrorKind,
  type OpenReviewDraft,
} from './readerLifecycleEditModel';

type FieldErrors = Record<string, string>;

type CommonDraft = {
  reason: string;
  actorId: string;
  acknowledged: boolean;
};

const ACTORS = selectableActors();

function emptyAddDraft(): AddEvidenceDraft {
  return { kind: 'manual_amazon', purchaseDate: '', details: '', reason: '', actorId: '' };
}

function emptyCorrectDraft(): CorrectEvidenceDraft {
  return {
    kind: 'manual_amazon',
    purchaseDate: '',
    details: '',
    status: 'provisional',
    reason: '',
    actorId: '',
    expectedStatus: 'provisional',
  };
}

function emptyOpenDraft(): OpenReviewDraft {
  return { reasonCode: 'possible_wrong_website_owner', details: '', otherUserId: '', reason: '', actorId: '' };
}

function emptyCommon(): CommonDraft {
  return { reason: '', actorId: '', acknowledged: false };
}

export default function ReaderLifecycleEditPanel({
  reader,
  onReaderUpdated,
  requestedAction,
  onRequestedActionConsumed,
}: {
  reader: ReaderLifecycleDetail;
  onReaderUpdated: (next: ReaderLifecycleDetail) => void;
  requestedAction?: EditAction | null;
  onRequestedActionConsumed?: () => void;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [action, setAction] = useState<EditAction | null>(null);
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [inFlight, setInFlight] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<MutationErrorKind | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [session, setSession] = useState<IdempotencySession | null>(null);
  const [addDraft, setAddDraft] = useState<AddEvidenceDraft>(emptyAddDraft());
  const [correctDraft, setCorrectDraft] = useState<CorrectEvidenceDraft>(emptyCorrectDraft());
  const [openDraft, setOpenDraft] = useState<OpenReviewDraft>(emptyOpenDraft());
  const [common, setCommon] = useState<CommonDraft>(emptyCommon());
  const [resolveStatus, setResolveStatus] = useState<IdentityResolveStatus>('resolved_keep_separate');
  const manageRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);
  const headingId = useId();
  const dialogTitleId = useId();

  const actions = permittedActions(reader);
  const evidence = findEvidence(reader, action);
  const error = errorKind ? mutationErrorCopy(errorKind) : null;

  useEffect(() => {
    if (!requestedAction) return;
    setPanelOpen(true);
    startAction(requestedAction);
    onRequestedActionConsumed?.();
  }, [requestedAction]);

  useEffect(() => {
    if (!panelOpen) return;
    const target = step === 'confirm' ? dialogRef.current : panelRef.current;
    const focusable = target?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
  }, [panelOpen, action, step]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (inFlightRef.current) return;
      event.preventDefault();
      if (step === 'confirm') {
        setStep('form');
        setSession(null);
        return;
      }
      if (action) {
        setAction(null);
        return;
      }
      closePanel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [action, step]);

  function startAction(next: EditAction) {
    setAction(next);
    setStep('form');
    setErrorKind(null);
    setFieldErrors({});
    setSession(null);
    setSuccess(null);
    setCommon(emptyCommon());
    setOpenDraft(emptyOpenDraft());
    setAddDraft(emptyAddDraft());
    const row = findEvidence(reader, next);
    if (row && (next.type === 'correctEvidence' || next.type === 'replaceEvidence')) {
      setCorrectDraft({
        kind: row.kind,
        purchaseDate: toDateInputValue(row.purchaseDate),
        details: row.details || '',
        status: next.type === 'replaceEvidence' ? 'provisional' : row.status === 'confirmed' ? 'confirmed' : 'provisional',
        reason: '',
        actorId: '',
        expectedStatus: row.status,
      });
    }
    if (next.type === 'resolveIdentityReview') {
      setResolveStatus('resolved_keep_separate');
    }
  }

  function closePanel() {
    setPanelOpen(false);
    setAction(null);
    setStep('form');
    setSession(null);
    setErrorKind(null);
    setFieldErrors({});
    queueMicrotask(() => manageRef.current?.focus());
  }

  function currentPayload(): Record<string, string> | null {
    if (!action) return null;
    if (action.type === 'addEvidence') return addEvidencePayload(addDraft);
    if (action.type === 'confirmEvidence') {
      return confirmEvidencePayload(common.reason, common.actorId, evidence?.status || 'provisional');
    }
    if (action.type === 'correctEvidence') {
      return correctEvidencePayload({ ...correctDraft, reason: common.reason, actorId: common.actorId });
    }
    if (action.type === 'disputeEvidence') {
      return disputeEvidencePayload(common.reason, common.actorId, evidence?.status || 'provisional');
    }
    if (action.type === 'replaceEvidence') {
      return replaceEvidencePayload({ ...correctDraft, reason: common.reason, actorId: common.actorId });
    }
    if (action.type === 'addDnc') return contactDecisionPayload('suppress', common.reason, common.actorId);
    if (action.type === 'allowContact') return contactDecisionPayload('allow', common.reason, common.actorId);
    if (action.type === 'openIdentityReview') {
      return openIdentityReviewPayload({ ...openDraft, reason: common.reason, actorId: common.actorId });
    }
    if (action.type === 'resolveIdentityReview') {
      return resolveIdentityReviewPayload(resolveStatus, common.reason, common.actorId);
    }
    return null;
  }

  function validateForm(): FieldErrors {
    const errors: FieldErrors = {};
    const reason = action?.type === 'addEvidence' ? addDraft.reason : action?.type === 'openIdentityReview' ? common.reason : common.reason;
    const actorId = action?.type === 'addEvidence' ? addDraft.actorId : action?.type === 'openIdentityReview' ? common.actorId : common.actorId;
    if (action?.type === 'addEvidence') {
      const reasonErr = validateReason(addDraft.reason);
      if (reasonErr) errors.reason = reasonErr;
      const detailsErr = validateDetails(addDraft.details);
      if (detailsErr) errors.details = detailsErr;
      if (!addDraft.actorId) errors.actorId = 'Select who is taking this action.';
    } else {
      const reasonErr = validateReason(reason);
      if (reasonErr) errors.reason = reasonErr;
      if (!actorId) errors.actorId = 'Select who is taking this action.';
    }
    if (action?.type === 'openIdentityReview' && openDraft.reasonCode === 'other') {
      const detailsErr = validateDetails(openDraft.details, true);
      if (detailsErr) errors.details = detailsErr;
    }
    if (action?.type === 'confirmEvidence' && !common.acknowledged) {
      errors.acknowledged = 'Confirm that a new confirmed record will replace the provisional record.';
    }
    if (action?.type === 'correctEvidence' || action?.type === 'replaceEvidence') {
      const detailsErr = validateDetails(correctDraft.details);
      if (detailsErr) errors.details = detailsErr;
    }
    return errors;
  }

  function goToConfirm(event: FormEvent) {
    event.preventDefault();
    const errors = validateForm();
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setErrorKind('validation');
      return;
    }
    const payload = currentPayload();
    if (!payload || !action) return;
    setErrorKind(null);
    setSession(beginIdempotencySession(payload));
    setStep('confirm');
  }

  async function submit(mode: 'save' | 'retry') {
    if (!action || inFlightRef.current) return;
    const payload = currentPayload();
    if (!payload) return;
    const nextSession =
      mode === 'retry'
        ? idempotencyKeyForAttempt(session, payload, 'retry')
        : session && session.fingerprint === JSON.stringify(payload)
          ? session
          : beginIdempotencySession(payload);
    setSession(nextSession);
    inFlightRef.current = true;
    setInFlight(true);
    setErrorKind(null);
    try {
      const res = await fetch(mutationPath(action, reader.readerProfileId), {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': nextSession.key,
        },
        body: JSON.stringify(payload),
      });
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      if (!res.ok) {
        const code =
          body && typeof body === 'object' && 'error' in body
            ? String((body as { error?: unknown }).error || '')
            : '';
        const kind = classifyMutationError(res.status, code);
        setErrorKind(kind);
        const field = fieldErrorFromCode(code);
        setFieldErrors(field ? { [field.field]: field.message } : {});
        if (kind === 'idempotency_conflict') setSession(null);
        return;
      }
      const parsed = parseMutationResponse(body);
      const nextReader = parsed ? parseDetailResponse({ reader: parsed.reader }) : null;
      if (!nextReader) {
        setErrorKind('generic');
        return;
      }
      onReaderUpdated(nextReader);
      setSuccess(successMessage(action));
      setAction(null);
      setStep('form');
      setSession(null);
      setFieldErrors({});
    } catch {
      setErrorKind('unavailable');
    } finally {
      inFlightRef.current = false;
      setInFlight(false);
    }
  }

  return (
    <div>
      <div className={styles.manageBar}>
        <button
          ref={manageRef}
          className={styles.primary}
          type="button"
          onClick={() => {
            setPanelOpen(true);
            setSuccess(null);
          }}
        >
          Manage lifecycle record
        </button>
      </div>
      {success ? (
        <p className={styles.success} role="status">
          {success}
        </p>
      ) : null}

      {panelOpen ? (
        <div className={styles.panel} ref={panelRef}>
          <h3 id={headingId} className={styles.panelTitle}>
            Permitted lifecycle actions
          </h3>
          <p className={styles.formNote}>{NO_NURTURE_JOB}</p>
          {!action ? (
            <>
              <div className={styles.actionList} role="group" aria-labelledby={headingId}>
                {actions.map((item) => (
                  <button
                    key={`${item.action.type}-${'evidenceId' in item.action ? item.action.evidenceId : 'reviewId' in item.action ? item.action.reviewId : 'row'}`}
                    className={
                      item.tone === 'danger'
                        ? styles.actionDanger
                        : item.tone === 'warning'
                          ? styles.actionWarning
                          : styles.actionDefault
                    }
                    type="button"
                    onClick={() => startAction(item.action)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className={styles.formActions} style={{ marginTop: 12 }}>
                <button className={styles.secondary} type="button" onClick={closePanel}>
                  Cancel—make no changes
                </button>
              </div>
            </>
          ) : (
            <form className={styles.form} onSubmit={goToConfirm} noValidate>
              <h4 className={styles.panelTitle}>{actionTitle(action)}</h4>
              {error && step === 'form' ? (
                <ErrorBox kind={errorKind} copy={error} inFlight={inFlight} onRetry={() => void submit('retry')} />
              ) : null}
              {Object.keys(fieldErrors).length ? (
                <div className={styles.errorSummary} role="alert">
                  <p style={{ margin: 0, fontWeight: 700 }}>Please correct the highlighted fields.</p>
                  <ul>
                    {Object.entries(fieldErrors).map(([field, message]) => (
                      <li key={field}>
                        <a href={`#field-${field}`}>{message}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {action.type === 'addEvidence' ? (
                <AddEvidenceFields draft={addDraft} setDraft={setAddDraft} errors={fieldErrors} disabled={inFlight} />
              ) : null}
              {action.type === 'confirmEvidence' && evidence ? (
                <>
                  <EvidenceSummary row={evidence} />
                  <p className={styles.formNote}>{CONFIRM_REPLACES_NOTE}</p>
                  <AckField
                    checked={common.acknowledged}
                    disabled={inFlight}
                    error={fieldErrors.acknowledged}
                    onChange={(acknowledged) => setCommon((prev) => ({ ...prev, acknowledged }))}
                  />
                  <ReasonActorFields
                    reason={common.reason}
                    actorId={common.actorId}
                    errors={fieldErrors}
                    disabled={inFlight}
                    onChange={(patch) => setCommon((prev) => ({ ...prev, ...patch }))}
                  />
                </>
              ) : null}
              {(action.type === 'correctEvidence' || action.type === 'replaceEvidence') && evidence ? (
                <>
                  <EvidenceSummary row={evidence} title="Original evidence" />
                  {action.type === 'replaceEvidence' ? <p className={styles.formNote}>{REPLACE_CONSEQUENCE}</p> : <p className={styles.formNote}>{SUPERSEDE_CONFIRM_NOTE}</p>}
                  <CorrectFields
                    draft={correctDraft}
                    original={evidence}
                    errors={fieldErrors}
                    disabled={inFlight}
                    allowStatus={canCorrectEvidence(evidence) || action.type === 'replaceEvidence'}
                    onChange={setCorrectDraft}
                  />
                  <ReasonActorFields
                    reason={common.reason}
                    actorId={common.actorId}
                    errors={fieldErrors}
                    disabled={inFlight}
                    onChange={(patch) => setCommon((prev) => ({ ...prev, ...patch }))}
                  />
                </>
              ) : null}
              {action.type === 'disputeEvidence' && evidence ? (
                <>
                  <EvidenceSummary row={evidence} />
                  <p className={styles.formNote}>{DISPUTE_CONSEQUENCE}</p>
                  <ReasonActorFields
                    reason={common.reason}
                    actorId={common.actorId}
                    errors={fieldErrors}
                    disabled={inFlight}
                    onChange={(patch) => setCommon((prev) => ({ ...prev, ...patch }))}
                  />
                </>
              ) : null}
              {action.type === 'addDnc' || action.type === 'allowContact' ? (
                <>
                  {action.type === 'allowContact' ? <p className={styles.formNote}>{ALLOW_CONTACT_WARNING}</p> : null}
                  <ReasonActorFields
                    reason={common.reason}
                    actorId={common.actorId}
                    errors={fieldErrors}
                    disabled={inFlight}
                    onChange={(patch) => setCommon((prev) => ({ ...prev, ...patch }))}
                  />
                </>
              ) : null}
              {action.type === 'openIdentityReview' ? (
                <>
                  <p className={styles.formNote}>{WEBSITE_WRONG_OWNER_NOTE}</p>
                  <OpenReviewFields draft={openDraft} setDraft={setOpenDraft} errors={fieldErrors} disabled={inFlight} />
                  <ReasonActorFields
                    reason={common.reason}
                    actorId={common.actorId}
                    errors={fieldErrors}
                    disabled={inFlight}
                    onChange={(patch) => setCommon((prev) => ({ ...prev, ...patch }))}
                  />
                </>
              ) : null}
              {action.type === 'resolveIdentityReview' ? (
                <>
                  <p className={styles.formNote}>{IDENTITY_RESOLVE_NOTE}</p>
                  <Field id="status" label="Resolution" error={fieldErrors.status}>
                    <select
                      id="field-status"
                      value={resolveStatus}
                      disabled={inFlight}
                      onChange={(event) => setResolveStatus(event.target.value as IdentityResolveStatus)}
                    >
                      {IDENTITY_RESOLVE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <ReasonActorFields
                    reason={common.reason}
                    actorId={common.actorId}
                    errors={fieldErrors}
                    disabled={inFlight}
                    reasonLabel="Resolution reason"
                    onChange={(patch) => setCommon((prev) => ({ ...prev, ...patch }))}
                  />
                </>
              ) : null}

              <div className={styles.formActions}>
                <button className={styles.secondary} type="button" disabled={inFlight} onClick={() => setAction(null)}>
                  Cancel—make no changes
                </button>
                <button className={styles.primary} type="submit" disabled={inFlight}>
                  Review changes
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}

      {step === 'confirm' && action ? (
        <div className={styles.overlay}>
          <div
            className={`${styles.dialog} ${action.type === 'disputeEvidence' || action.type === 'addDnc' ? styles.dialogDanger : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            tabIndex={-1}
            ref={dialogRef}
          >
            <h3 id={dialogTitleId} className={styles.dialogTitle}>
              Confirm {actionTitle(action).toLowerCase()}
            </h3>
            {error ? (
              <ErrorBox kind={errorKind} copy={error} inFlight={inFlight} onRetry={() => void submit('retry')} />
            ) : null}
            <ol className={styles.confirmList}>
              <li>
                <strong>What will be added or changed</strong>
                {changeSummary(action, { addDraft, correctDraft, openDraft, common, resolveStatus, evidence })}
              </li>
              <li>
                <strong>What history will be preserved</strong>
                {historyPreservationNote(action)}
              </li>
              <li>
                <strong>Expected classification consequence</strong>
                {expectedClassificationNote(action)}
              </li>
              <li>
                <strong>Local nurture suppression</strong>
                Nurturing may be locally suppressed after this change. This preview does not enroll or send nurture.
              </li>
              <li>
                <strong>Email</strong>
                {NO_EMAIL_STATEMENT}
              </li>
              <li>
                <strong>Action taken by</strong>
                {actorName(action.type === 'addEvidence' ? addDraft.actorId : common.actorId)}
              </li>
              <li>
                <strong>Administrative reason</strong>
                The entered reason will be stored with this administrative action.
              </li>
            </ol>
            <div className={styles.formActions}>
              <button
                className={styles.secondary}
                type="button"
                disabled={inFlight}
                onClick={() => {
                  setStep('form');
                  setSession(null);
                }}
              >
                Cancel—make no changes
              </button>
              <button
                className={action.type === 'disputeEvidence' || action.type === 'addDnc' ? styles.danger : styles.primary}
                type="button"
                disabled={inFlight}
                onClick={() => void submit('save')}
              >
                {inFlight ? 'Saving…' : confirmButtonLabel(action)}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function findEvidence(reader: ReaderLifecycleDetail, action: EditAction | null): LifecycleEvidence | null {
  if (!action || !('evidenceId' in action)) return null;
  return reader.evidenceHistory.find((row) => row.id === action.evidenceId) || null;
}

function ErrorBox({
  kind,
  copy,
  inFlight,
  onRetry,
}: {
  kind: MutationErrorKind | null;
  copy: { title: string; body: string; allowRetry: boolean };
  inFlight: boolean;
  onRetry: () => void;
}) {
  return (
    <div className={styles.errorSummary} role="alert">
      <p style={{ margin: '0 0 6px', fontWeight: 700 }}>{copy.title}</p>
      <p style={{ margin: 0 }}>{copy.body}</p>
      {kind === 'unauthorized' ? (
        <p style={{ margin: '8px 0 0' }}>
          <Link href={FULFILLMENT_AUTH_HREF} style={{ color: '#2563eb' }}>
            Sign in at fulfillment auth
          </Link>
        </p>
      ) : null}
      {kind === 'not_found' || kind === 'stale' ? (
        <p style={{ margin: '8px 0 0' }}>
          <button className={listStyles.buttonSecondary} type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </p>
      ) : null}
      {copy.allowRetry ? (
        <p style={{ margin: '8px 0 0' }}>
          <button className={styles.primary} type="button" disabled={inFlight} onClick={onRetry}>
            Retry
          </button>
        </p>
      ) : null}
    </div>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className={`${styles.field} ${error ? styles.fieldError : ''}`}>
      <label htmlFor={`field-${id}`}>{label}</label>
      {children}
      {error ? (
        <p className={styles.fieldMessage} id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ReasonActorFields({
  reason,
  actorId,
  errors,
  disabled,
  onChange,
  reasonLabel = 'Reason for this administrative entry',
}: {
  reason: string;
  actorId: string;
  errors: FieldErrors;
  disabled: boolean;
  onChange: (patch: Partial<CommonDraft>) => void;
  reasonLabel?: string;
}) {
  return (
    <>
      <Field id="reason" label={reasonLabel} error={errors.reason}>
        <textarea
          id="field-reason"
          value={reason}
          disabled={disabled}
          aria-invalid={Boolean(errors.reason)}
          onChange={(event) => onChange({ reason: event.target.value })}
        />
      </Field>
      <Field id="actorId" label="Action taken by" error={errors.actorId}>
        <select
          id="field-actorId"
          value={actorId}
          disabled={disabled}
          aria-invalid={Boolean(errors.actorId)}
          onChange={(event) => onChange({ actorId: event.target.value })}
        >
          <option value="">Select an active helper</option>
          {ACTORS.map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.name}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}

function AddEvidenceFields({
  draft,
  setDraft,
  errors,
  disabled,
}: {
  draft: AddEvidenceDraft;
  setDraft: (draft: AddEvidenceDraft) => void;
  errors: FieldErrors;
  disabled: boolean;
}) {
  return (
    <>
      <p className={styles.formNote}>{PROVISIONAL_ADD_NOTE}</p>
      <Field id="kind" label="Evidence type" error={errors.kind}>
        <select
          id="field-kind"
          value={draft.kind}
          disabled={disabled}
          onChange={(event) => setDraft({ ...draft, kind: event.target.value as AddEvidenceKind })}
        >
          {ADD_KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field id="purchaseDate" label="Purchase date (optional)" error={errors.purchaseDate}>
        <input
          id="field-purchaseDate"
          type="date"
          value={draft.purchaseDate}
          disabled={disabled}
          onChange={(event) => setDraft({ ...draft, purchaseDate: event.target.value })}
        />
      </Field>
      <Field id="details" label="Details (optional)" error={errors.details}>
        <textarea
          id="field-details"
          value={draft.details}
          disabled={disabled}
          onChange={(event) => setDraft({ ...draft, details: event.target.value })}
        />
      </Field>
      <ReasonActorFields
        reason={draft.reason}
        actorId={draft.actorId}
        errors={errors}
        disabled={disabled}
        onChange={(patch) => setDraft({ ...draft, ...patch })}
      />
    </>
  );
}

function OpenReviewFields({
  draft,
  setDraft,
  errors,
  disabled,
}: {
  draft: OpenReviewDraft;
  setDraft: (draft: OpenReviewDraft) => void;
  errors: FieldErrors;
  disabled: boolean;
}) {
  return (
    <>
      <Field id="reasonCode" label="Review reason" error={errors.reasonCode}>
        <select
          id="field-reasonCode"
          value={draft.reasonCode}
          disabled={disabled}
          onChange={(event) => setDraft({ ...draft, reasonCode: event.target.value as IdentityOpenReason })}
        >
          {IDENTITY_OPEN_REASON_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        id="details"
        label={draft.reasonCode === 'other' ? 'Details (required for Other)' : 'Details (optional)'}
        error={errors.details}
      >
        <textarea
          id="field-details"
          value={draft.details}
          disabled={disabled}
          onChange={(event) => setDraft({ ...draft, details: event.target.value })}
        />
      </Field>
      <Field id="otherUserId" label="Related internal record ID (optional, not a merge instruction)" error={errors.otherUserId}>
        <input
          id="field-otherUserId"
          value={draft.otherUserId}
          disabled={disabled}
          autoComplete="off"
          onChange={(event) => setDraft({ ...draft, otherUserId: event.target.value })}
        />
      </Field>
    </>
  );
}

function CorrectFields({
  draft,
  original,
  errors,
  disabled,
  allowStatus,
  onChange,
}: {
  draft: CorrectEvidenceDraft;
  original: LifecycleEvidence;
  errors: FieldErrors;
  disabled: boolean;
  allowStatus: boolean;
  onChange: (draft: CorrectEvidenceDraft) => void;
}) {
  return (
    <>
      <dl className={styles.changeList}>
        <dt>Proposed retailer/kind</dt>
        <dd>
          {draft.kind !== original.kind
            ? `${evidenceKindLabel(original.kind)} → ${evidenceKindLabel(draft.kind)}`
            : evidenceKindLabel(draft.kind)}
        </dd>
        <dt>Proposed purchase date</dt>
        <dd>
          {toDateInputValue(original.purchaseDate) !== draft.purchaseDate
            ? `${formatOccurredAt(original.purchaseDate)} → ${draft.purchaseDate || 'Not recorded'}`
            : draft.purchaseDate || 'Not recorded'}
        </dd>
        <dt>Proposed details</dt>
        <dd>{draft.details || 'None recorded'}</dd>
        <dt>Proposed status</dt>
        <dd>
          {draft.status !== original.status ? `${original.status} → ${draft.status}` : draft.status}
        </dd>
      </dl>
      <Field id="kind" label="Retailer / kind" error={errors.kind}>
        <select
          id="field-kind"
          value={draft.kind}
          disabled={disabled}
          onChange={(event) => onChange({ ...draft, kind: event.target.value })}
        >
          {ADD_KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field id="purchaseDate" label="Purchase date" error={errors.purchaseDate}>
        <input
          id="field-purchaseDate"
          type="date"
          value={draft.purchaseDate}
          disabled={disabled}
          onChange={(event) => onChange({ ...draft, purchaseDate: event.target.value })}
        />
      </Field>
      <Field id="details" label="Details" error={errors.details}>
        <textarea
          id="field-details"
          value={draft.details}
          disabled={disabled}
          onChange={(event) => onChange({ ...draft, details: event.target.value })}
        />
      </Field>
      {allowStatus ? (
        <Field id="status" label="Status" error={errors.status}>
          <select
            id="field-status"
            value={draft.status}
            disabled={disabled}
            onChange={(event) => onChange({ ...draft, status: event.target.value as 'provisional' | 'confirmed' })}
          >
            <option value="provisional">Provisional</option>
            <option value="confirmed">Confirmed</option>
          </select>
        </Field>
      ) : null}
    </>
  );
}

function AckField({
  checked,
  disabled,
  error,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  error?: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className={`${styles.field} ${error ? styles.fieldError : ''}`}>
      <label className={styles.ack} htmlFor="field-acknowledged">
        <input
          id="field-acknowledged"
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>
          I understand a new confirmed record will replace the provisional record while preserving the original
          history.
        </span>
      </label>
      {error ? <p className={styles.fieldMessage}>{error}</p> : null}
    </div>
  );
}

function EvidenceSummary({ row, title = 'Existing evidence' }: { row: LifecycleEvidence; title?: string }) {
  return (
    <article className={styles.block}>
      <strong>{title}</strong>
      <div>{evidenceKindLabel(row.kind)}</div>
      <div>Status: {row.status}</div>
      <div>Purchase date: {formatOccurredAt(row.purchaseDate)}</div>
      <div>Details: {row.details || 'None recorded'}</div>
    </article>
  );
}

function changeSummary(
  action: EditAction,
  drafts: {
    addDraft: AddEvidenceDraft;
    correctDraft: CorrectEvidenceDraft;
    openDraft: OpenReviewDraft;
    common: CommonDraft;
    resolveStatus: IdentityResolveStatus;
    evidence: LifecycleEvidence | null;
  },
): string {
  if (action.type === 'addEvidence') {
    const option = ADD_KIND_OPTIONS.find((item) => item.value === drafts.addDraft.kind);
    return `Add provisional ${option?.label || 'evidence'}.`;
  }
  if (action.type === 'confirmEvidence') return 'Create a confirmed replacement for the current provisional evidence.';
  if (action.type === 'correctEvidence') return 'Create a corrected replacement. The original row becomes superseded.';
  if (action.type === 'disputeEvidence') return 'Mark the current evidence as disputed.';
  if (action.type === 'replaceEvidence') return 'Create replacement evidence for the disputed row.';
  if (action.type === 'addDnc') return 'Add a manual Do Not Contact decision.';
  if (action.type === 'allowContact') return 'Add an allow-contact decision that removes the latest manual Do Not Contact only.';
  if (action.type === 'openIdentityReview') {
    const option = IDENTITY_OPEN_REASON_OPTIONS.find((item) => item.value === drafts.openDraft.reasonCode);
    return `Open an identity review (${option?.label || 'review'}).`;
  }
  if (action.type === 'resolveIdentityReview') {
    const option = IDENTITY_RESOLVE_OPTIONS.find((item) => item.value === drafts.resolveStatus);
    return option?.label || 'Resolve the identity review.';
  }
  return 'Apply this administrative change.';
}
