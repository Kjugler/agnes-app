'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import {
  FULFILLMENT_AUTH_HREF,
  LIST_PREVIEW_PATH,
  crmStatusLabel,
  categoryLabel,
  detailProxyPath,
} from '../readerLifecyclePreviewModel';
import listStyles from '../preview.module.css';
import styles from './detail.module.css';
import {
  AGGREGATE_NOT_PROOF,
  AUDIT_HISTORY_EMPTY,
  AUDIT_HISTORY_NOTE,
  CONTACT_DECISION_NOTE,
  EMPTY_HISTORY,
  IDENTITY_NO_MERGE,
  LOAD_EARLIER_CHANGES,
  NURTURE_NOT_CONNECTED_TO_JOBS,
  OUTREACH_PAUSED,
  PURCHASE_ACCOUNTING_NOTE,
  SMS_CONSENT_NOTE,
  auditActionLabel,
  auditEntityTypeLabel,
  auditHistoryErrorCopy,
  auditHistoryProxyPath,
  auditSummaryLines,
  classifyLifecycleReadError,
  communicationHistoryOutcome,
  decisionLabel,
  emailDisplay,
  enteredBy,
  errorCopy,
  evidenceKindLabel,
  evidenceReasonOriginLabel,
  evidenceStatusLabel,
  formatAmount,
  formatCalendarDate,
  fulfillmentStatusLabel,
  formatOccurredAt,
  groupEvidence,
  identityReasonLabel,
  identityStatusLabel,
  isAggregateEvidence,
  isArchivedBetaPurchase,
  isOutreachPaused,
  listContactLabel,
  listOwnershipLabel,
  listReviewSummary,
  mergeAuditPages,
  parseAuditHistoryResponse,
  parseDetailResponse,
  phoneDisplay,
  safeRelatedUserId,
  saleStatusLabel,
  smsConsentLabel,
  sourceLabel,
  sourcesLabel,
  supersededFoldLabel,
  supersededRelationshipLabel,
  templateOrAskLabel,
  triggerLabel,
  type LifecycleAuditItem,
  type LifecycleCommunication,
  type LifecycleContactDecision,
  type LifecycleEvidence,
  type LifecycleIdentityReview,
  type LifecyclePurchase,
  type LifecycleReadErrorKind,
  type ReaderLifecycleDetail,
} from './readerLifecycleDetailModel';
import ReaderLifecycleEditPanel from './ReaderLifecycleEditPanel';
import { WEBSITE_WRONG_OWNER_NOTE, type EditAction } from './readerLifecycleEditModel';

export default function ReaderLifecycleDetailClient({
  readerProfileId,
}: {
  readerProfileId: string;
}) {
  const [reader, setReader] = useState<ReaderLifecycleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<LifecycleReadErrorKind | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [requestedAction, setRequestedAction] = useState<EditAction | null>(null);
  const [auditEpoch, setAuditEpoch] = useState(0);

  const handleReaderUpdated = useCallback((next: ReaderLifecycleDetail) => {
    setReader(next);
    setAuditEpoch((n) => n + 1);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorKind(null);
    try {
      const res = await fetch(detailProxyPath(readerProfileId), {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
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
        setReader(null);
        setErrorKind(classifyLifecycleReadError(res.status, code));
        return;
      }
      setReader(parseDetailResponse(body));
    } catch {
      setReader(null);
      setErrorKind('unavailable');
    } finally {
      setLoading(false);
    }
  }, [readerProfileId, reloadToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = errorKind ? errorCopy(errorKind) : null;
  const review = reader ? listReviewSummary(reader) : null;

  return (
    <div>
      <BackLink readerProfileId={readerProfileId} />
      {loading ? <p className={listStyles.statusBar}>Loading reader…</p> : null}
      {errorKind && copy ? (
        <div className={listStyles.message} role="alert">
          <p className={listStyles.errorTitle}>{copy.title}</p>
          <p style={{ margin: '0 0 12px' }}>{copy.body}</p>
          {errorKind === 'unauthorized' ? (
            <p style={{ margin: '0 0 12px' }}>
              <Link href={FULFILLMENT_AUTH_HREF} style={{ color: '#2563eb' }}>
                Sign in at fulfillment auth
              </Link>
            </p>
          ) : null}
          <button
            className={listStyles.buttonSecondary}
            type="button"
            onClick={() => setReloadToken((n) => n + 1)}
          >
            Retry
          </button>
        </div>
      ) : null}

      {!loading && !errorKind && !reader ? (
        <div className={listStyles.message} role="status">
          No lifecycle reader could be displayed.
        </div>
      ) : null}

      {reader && review ? (
        <>
          {isOutreachPaused(reader) ? (
            <p className={styles.paused} role="status">
              {OUTREACH_PAUSED}
            </p>
          ) : null}

          <section className={styles.section} aria-labelledby="summary-heading">
            <h2 id="summary-heading" className={styles.sectionTitle}>
              {reader.name}
            </h2>
            <p style={{ margin: '0 0 12px' }}>{emailDisplay(reader)}</p>
            <dl className={styles.summary}>
              <div>
                <dt>Phone</dt>
                <dd>{phoneDisplay(reader.phone)}</dd>
              </div>
              <div>
                <dt>Legacy CRM</dt>
                <dd>
                  {[
                    reader.legacy.readerType ? `Type: ${reader.legacy.readerType}` : null,
                    reader.legacy.source ? `Source: ${reader.legacy.source}` : null,
                    reader.legacy.status ? `Status: ${crmStatusLabel(reader.legacy.status)}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'No legacy CRM fields'}
                </dd>
              </div>
            </dl>
            <dl className={styles.axes}>
              <div className={styles.axis}>
                <dt>Ownership</dt>
                <dd>{listOwnershipLabel(reader)}</dd>
              </div>
              <div className={styles.axis}>
                <dt>Purchase sources</dt>
                <dd>{sourcesLabel(reader.sources)}</dd>
              </div>
              <div className={styles.axis}>
                <dt>Confidence</dt>
                <dd>{review.primary === 'Conflicting evidence' ? 'Unresolved' : review.primary}</dd>
              </div>
              <div className={styles.axis}>
                <dt>Review state</dt>
                <dd>{review.secondary || review.primary}</dd>
              </div>
              <div className={styles.axis}>
                <dt>Contactability</dt>
                <dd>{listContactLabel(reader)}</dd>
              </div>
            </dl>
            {reader.nurtureSuppressed ? (
              <p className={styles.sectionNote} style={{ marginTop: 12 }}>
                Nurture is locally suppressed. {NURTURE_NOT_CONNECTED_TO_JOBS}
              </p>
            ) : (
              <p className={styles.sectionNote} style={{ marginTop: 12 }}>
                {NURTURE_NOT_CONNECTED_TO_JOBS}
              </p>
            )}
            <ReaderLifecycleEditPanel
              reader={reader}
              onReaderUpdated={handleReaderUpdated}
              requestedAction={requestedAction}
              onRequestedActionConsumed={() => setRequestedAction(null)}
            />
          </section>

          <PurchasesSection
            rows={reader.purchases}
            onOpenIdentityReview={() => setRequestedAction({ type: 'openIdentityReview' })}
          />
          <EvidenceSection rows={reader.evidenceHistory} />
          <CommunicationsSection rows={reader.communications} />
          <DecisionsSection rows={reader.contactDecisions} />
          <IdentitySection rows={reader.identityReviews} />
          <NotesSection reader={reader} />
          <AuditHistorySection readerProfileId={reader.readerProfileId} reloadToken={auditEpoch} />
        </>
      ) : null}
    </div>
  );
}

function BackLink({ readerProfileId }: { readerProfileId: string }) {
  function goBack(event: MouseEvent<HTMLAnchorElement>) {
    if (typeof window === 'undefined') return;
    const referrer = document.referrer;
    const fromList =
      referrer.includes(LIST_PREVIEW_PATH) &&
      !referrer.includes(`/${encodeURIComponent(readerProfileId)}`);
    if (fromList && window.history.length > 1) {
      event.preventDefault();
      window.history.back();
    }
  }

  return (
    <p className={styles.back}>
      <Link href={LIST_PREVIEW_PATH} onClick={goBack}>
        ← Back to Reader Lifecycle preview
      </Link>
    </p>
  );
}

function Empty({ children }: { children?: ReactNode }) {
  return <p className={styles.empty}>{children || EMPTY_HISTORY}</p>;
}

function PurchasesSection({
  rows,
  onOpenIdentityReview,
}: {
  rows: LifecyclePurchase[];
  onOpenIdentityReview: () => void;
}) {
  return (
    <section className={styles.section} aria-labelledby="purchases-heading">
      <h2 id="purchases-heading" className={styles.sectionTitle}>
        Website Purchase Records
      </h2>
      <p className={styles.sectionNote}>{PURCHASE_ACCOUNTING_NOTE}</p>
      <p className={styles.accountingNote}>{WEBSITE_WRONG_OWNER_NOTE}</p>
      {rows.length === 0 ? (
        <Empty>No website purchase records. {EMPTY_HISTORY}</Empty>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Purchase date</th>
                  <th scope="col">Source</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Sale status</th>
                  <th scope="col">Fulfillment</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatOccurredAt(row.createdAt)}</td>
                    <td>{row.source ? sourceLabel(row.source) : 'Not recorded'}</td>
                    <td>{formatAmount(row.amount, row.currency)}</td>
                    <td className={isArchivedBetaPurchase(row) ? styles.archived : undefined}>
                      {saleStatusLabel(row.saleStatus)}
                    </td>
                    <td>{fulfillmentStatusLabel(row.fulfillmentStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.stack}>
            {rows.map((row) => (
              <article className={styles.block} key={`p-${row.id}`}>
                <strong>{formatOccurredAt(row.createdAt)}</strong>
                <div>{row.source ? sourceLabel(row.source) : 'Not recorded'}</div>
                <div>{formatAmount(row.amount, row.currency)}</div>
                <div className={isArchivedBetaPurchase(row) ? styles.archived : undefined}>
                  {saleStatusLabel(row.saleStatus)}
                </div>
                <div className={styles.muted}>{fulfillmentStatusLabel(row.fulfillmentStatus)}</div>
              </article>
            ))}
          </div>
        </>
      )}
      {rows.length > 0 ? (
        <p className={styles.manageBar}>
          <button className={styles.actionWarning} type="button" onClick={onOpenIdentityReview}>
            Open identity review
          </button>
        </p>
      ) : null}
    </section>
  );
}

function EvidenceBlock({ row, historical }: { row: LifecycleEvidence; historical?: boolean }) {
  return (
    <article className={`${styles.block} ${historical ? styles.historical : ''}`}>
      <strong>{evidenceKindLabel(row.kind)}</strong>
      <div>
        <span className={styles.statusText}>{evidenceStatusLabel(row.status)}</span>
        {row.sourceLabel ? ` · ${sourceLabel(row.sourceLabel)}` : ''}
      </div>
      {supersededRelationshipLabel(row) ? (
        <p className={styles.relationship}>{supersededRelationshipLabel(row)}</p>
      ) : null}
      <dl>
        <dt>Purchase date</dt>
        <dd>{formatCalendarDate(row.purchaseDate)}</dd>
        <dt>Details</dt>
        <dd>{row.details || 'None recorded'}</dd>
        <dt>Reason / origin</dt>
        <dd>{evidenceReasonOriginLabel(row)}</dd>
        <dt>Entered by</dt>
        <dd>{enteredBy(row.actorLabel, row.actorType)}</dd>
        <dt>Created</dt>
        <dd>{formatOccurredAt(row.createdAt)}</dd>
      </dl>
      {isAggregateEvidence(row) ? <p className={styles.aggregate}>{AGGREGATE_NOT_PROOF}</p> : null}
    </article>
  );
}

function EvidenceSection({ rows }: { rows: LifecycleEvidence[] }) {
  const grouped = groupEvidence(rows);
  return (
    <section className={styles.section} aria-labelledby="evidence-heading">
      <h2 id="evidence-heading" className={styles.sectionTitle}>
        Purchase and Ownership Evidence
      </h2>
      <p className={styles.sectionNote}>
        ReaderEvidence is lifecycle history. It is not the same as Website Purchase records, which
        remain accounting truth.
      </p>
      {rows.length === 0 ? (
        <Empty>No evidence history. {EMPTY_HISTORY}</Empty>
      ) : (
        <>
          {grouped.currentConfirmed.map((row) => (
            <EvidenceBlock key={row.id} row={row} />
          ))}
          {grouped.currentProvisional.map((row) => (
            <EvidenceBlock key={row.id} row={row} />
          ))}
          {grouped.disputed.length ? (
            <>
              <h3 className={styles.historicalTitle}>Disputed or conflicting evidence</h3>
              {grouped.disputed.map((row) => (
                <EvidenceBlock key={row.id} row={row} />
              ))}
            </>
          ) : null}
          {grouped.superseded.length ? (
            <details className={styles.supersededFold}>
              <summary>{supersededFoldLabel(grouped.superseded.length)}</summary>
              {grouped.superseded.map((row) => (
                <EvidenceBlock key={row.id} row={row} historical />
              ))}
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}

function CommunicationsSection({ rows }: { rows: LifecycleCommunication[] }) {
  return (
    <section className={styles.section} aria-labelledby="comms-heading">
      <h2 id="comms-heading" className={styles.sectionTitle}>
        Communication History
      </h2>
      {rows.length === 0 ? (
        <Empty>No communication history recorded. {EMPTY_HISTORY}</Empty>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Type</th>
                  <th scope="col">Template / ask</th>
                  <th scope="col">Date</th>
                  <th scope="col">Trigger</th>
                  <th scope="col">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{categoryLabel(row.category)}</td>
                    <td>{templateOrAskLabel(row.templateOrAskId)}</td>
                    <td>{formatOccurredAt(row.occurredAt)}</td>
                    <td>
                      {triggerLabel(row.trigger)}
                      {row.batchLabel ? ` · ${row.batchLabel}` : ''}
                    </td>
                    <td>
                      {communicationHistoryOutcome(row)}
                      {row.caption ? <div className={styles.muted}>{row.caption}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.stack}>
            {rows.map((row) => (
              <article className={styles.block} key={`c-${row.id}`}>
                <strong>{categoryLabel(row.category)}</strong>
                <div>{formatOccurredAt(row.occurredAt)}</div>
                <div>{templateOrAskLabel(row.templateOrAskId, 'No template or ask identifier')}</div>
                <div>
                  {triggerLabel(row.trigger)}
                  {row.batchLabel ? ` · ${row.batchLabel}` : ''}
                </div>
                <div>{communicationHistoryOutcome(row)}</div>
                {row.caption ? <div className={styles.muted}>{row.caption}</div> : null}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function DecisionsSection({ rows }: { rows: LifecycleContactDecision[] }) {
  return (
    <section className={styles.section} aria-labelledby="decisions-heading">
      <h2 id="decisions-heading" className={styles.sectionTitle}>
        Contact Decisions
      </h2>
      <p className={styles.sectionNote}>{CONTACT_DECISION_NOTE}</p>
      {rows.length === 0 ? (
        <Empty>No manual contact decisions. {EMPTY_HISTORY}</Empty>
      ) : (
        rows.map((row) => (
          <article className={styles.block} key={row.id}>
            <strong>{decisionLabel(row.decision)}</strong>
            <div>Reason: {row.reason || 'None recorded'}</div>
            <div>Actor: {enteredBy(row.actorLabel, row.actorType)}</div>
            <div className={styles.muted}>{formatOccurredAt(row.createdAt)}</div>
          </article>
        ))
      )}
    </section>
  );
}

function IdentitySection({ rows }: { rows: LifecycleIdentityReview[] }) {
  return (
    <section className={styles.section} aria-labelledby="identity-heading">
      <h2 id="identity-heading" className={styles.sectionTitle}>
        Identity Review
      </h2>
      <p className={styles.sectionNote}>{IDENTITY_NO_MERGE}</p>
      {rows.length === 0 ? (
        <Empty>No identity review. {EMPTY_HISTORY}</Empty>
      ) : (
        rows.map((row) => (
          <article className={styles.block} key={row.id}>
            <strong>{identityStatusLabel(row.status)}</strong>
            <div>{identityReasonLabel(row.reasonCode)}</div>
            <div>Related user ID: {safeRelatedUserId(row.otherUserId)}</div>
            <div>{row.details || 'No additional details'}</div>
            {row.resolvedAt || row.resolutionReason ? (
              <div className={styles.muted}>
                Resolved {formatOccurredAt(row.resolvedAt)}
                {row.resolutionReason ? ` · ${row.resolutionReason}` : ''}
              </div>
            ) : null}
            <div className={styles.muted}>{enteredBy(row.actorLabel, row.actorType)}</div>
          </article>
        ))
      )}
    </section>
  );
}

function NotesSection({ reader }: { reader: ReaderLifecycleDetail }) {
  const notes = reader.notes.trim();
  return (
    <section className={styles.section} aria-labelledby="notes-heading">
      <h2 id="notes-heading" className={styles.sectionTitle}>
        Notes and legacy contact information
      </h2>
      <dl className={styles.summary}>
        <div>
          <dt>CRM notes</dt>
          <dd>{notes || `No notes. ${EMPTY_HISTORY}`}</dd>
        </div>
        <div>
          <dt>SMS consent</dt>
          <dd>
            {smsConsentLabel(reader.smsConsentGranted)}
            <div className={styles.muted}>{SMS_CONSENT_NOTE}</div>
          </dd>
        </div>
        <div>
          <dt>Email state</dt>
          <dd>{emailDisplay(reader)}</dd>
        </div>
        <div>
          <dt>Phone state</dt>
          <dd>{phoneDisplay(reader.phone)}</dd>
        </div>
      </dl>
    </section>
  );
}

function AuditHistorySection({
  readerProfileId,
  reloadToken,
}: {
  readerProfileId: string;
  reloadToken: number;
}) {
  const [items, setItems] = useState<LifecycleAuditItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [errorKind, setErrorKind] = useState<LifecycleReadErrorKind | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const loadPage = useCallback(
    async (cursor: string | null, append: boolean) => {
      if (append) setLoadingEarlier(true);
      else {
        setLoading(true);
        setItems([]);
        setNextCursor(null);
        setHasMore(false);
      }
      setErrorKind(null);
      try {
        const res = await fetch(auditHistoryProxyPath(readerProfileId, cursor), {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
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
          setErrorKind(classifyLifecycleReadError(res.status, code));
          if (!append) setItems([]);
          return;
        }
        const parsed = parseAuditHistoryResponse(body);
        if (!parsed || (parsed.readerProfileId && parsed.readerProfileId !== readerProfileId)) {
          setErrorKind('generic');
          if (!append) setItems([]);
          return;
        }
        setItems((prev) => (append ? mergeAuditPages(prev, parsed.items) : parsed.items));
        setNextCursor(parsed.nextCursor);
        setHasMore(parsed.hasMore && Boolean(parsed.nextCursor));
      } catch {
        setErrorKind('unavailable');
        if (!append) setItems([]);
      } finally {
        setLoading(false);
        setLoadingEarlier(false);
      }
    },
    [readerProfileId],
  );

  useEffect(() => {
    void loadPage(null, false);
  }, [loadPage, reloadToken, retryToken]);

  const copy = errorKind ? auditHistoryErrorCopy(errorKind) : null;

  return (
    <section className={styles.section} aria-labelledby="audit-heading">
      <h2 id="audit-heading" className={styles.sectionTitle}>
        Administrative Change History
      </h2>
      <p className={styles.sectionNote}>{AUDIT_HISTORY_NOTE}</p>
      {loading ? <p className={styles.muted}>Loading administrative history…</p> : null}
      {copy ? (
        <div className={listStyles.message} role="alert">
          <p className={listStyles.errorTitle}>{copy.title}</p>
          <p style={{ margin: '0 0 12px' }}>{copy.body}</p>
          {errorKind === 'unauthorized' ? (
            <p style={{ margin: '0 0 12px' }}>
              <Link href={FULFILLMENT_AUTH_HREF} style={{ color: '#2563eb' }}>
                Sign in at fulfillment auth
              </Link>
            </p>
          ) : null}
          <button
            className={listStyles.buttonSecondary}
            type="button"
            onClick={() => setRetryToken((n) => n + 1)}
          >
            Retry
          </button>
        </div>
      ) : null}
      {!loading && !errorKind && items.length === 0 ? <Empty>{AUDIT_HISTORY_EMPTY}</Empty> : null}
      {!errorKind
        ? items.map((row) => {
            const beforeLines = auditSummaryLines(row.before);
            const afterLines = auditSummaryLines(row.after);
            return (
              <article className={styles.block} key={row.id}>
                <strong>{formatOccurredAt(row.createdAt)}</strong>
                <div>{auditActionLabel(row.action)}</div>
                <dl>
                  <dt>Affected record</dt>
                  <dd>{auditEntityTypeLabel(row.entityType)}</dd>
                  <dt>Administrator</dt>
                  <dd>{row.actorLabel || 'Unknown administrator'}</dd>
                  <dt>Administrative reason</dt>
                  <dd className={styles.auditValue}>{row.reason || 'None recorded'}</dd>
                  <dt>Before</dt>
                  <dd>
                    {beforeLines.length ? (
                      <ul className={styles.auditSummary}>
                        {beforeLines.map((line) => (
                          <li key={`${row.id}-before-${line.label}`}>
                            <span className={styles.muted}>{line.label}: </span>
                            {line.value}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      'No earlier values to summarize.'
                    )}
                  </dd>
                  <dt>After</dt>
                  <dd>
                    {afterLines.length ? (
                      <ul className={styles.auditSummary}>
                        {afterLines.map((line) => (
                          <li key={`${row.id}-after-${line.label}`}>
                            <span className={styles.muted}>{line.label}: </span>
                            {line.value}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      'No later values to summarize.'
                    )}
                  </dd>
                </dl>
              </article>
            );
          })
        : null}
      {!errorKind && hasMore && nextCursor ? (
        <p className={styles.manageBar}>
          <button
            className={styles.secondary}
            type="button"
            disabled={loadingEarlier}
            onClick={() => void loadPage(nextCursor, true)}
          >
            {loadingEarlier ? 'Loading earlier changes…' : LOAD_EARLIER_CHANGES}
          </button>
        </p>
      ) : null}
    </section>
  );
}
