'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useState } from 'react';
import {
  CONTACTABILITY_VALUES,
  CONFIDENCE_VALUES,
  CONTACTABLE_ASTERISK_NOTE,
  CRM_STATUS_VALUES,
  EMPTY_FILTERS,
  FULFILLMENT_AUTH_HREF,
  LIST_FILTER_EXPLANATION,
  LIST_FILTER_HEADING,
  LIST_PROXY_PATH,
  OWNERSHIP_VALUES,
  REVIEW_VALUES,
  SOURCE_VALUES,
  accentTone,
  buildListQuery,
  classifyHttpError,
  communicationListSummary,
  confidenceLabel,
  detailPreviewPath,
  contactabilityLabel,
  crmStatusLabel,
  emailDisplay,
  goNextPage,
  goPreviousPage,
  initialCursorHistory,
  listContactLabel,
  listOwnershipLabel,
  listReviewSummary,
  ownershipLabel,
  parseListResponse,
  resetCursorHistory,
  reviewLabel,
  sourceLabel,
  sourcesLabel,
  type AccentTone,
  type CursorHistory,
  type LifecycleListFilters,
  type PreviewErrorKind,
  type ReaderLifecycleListItem,
} from './readerLifecyclePreviewModel';
import styles from './preview.module.css';

const TONE_CLASS: Record<AccentTone, string> = {
  purchaser: styles.accentPurchaser,
  provisional: styles.accentProvisional,
  review: styles.accentReview,
  dnc: styles.accentDnc,
  nonPurchaser: styles.accentNonPurchaser,
  gifted: styles.accentGifted,
  unknown: styles.accentUnknown,
};

const PILL_CLASS: Record<AccentTone, string> = {
  purchaser: styles.pillPurchaser,
  provisional: styles.pillProvisional,
  review: styles.pillReview,
  dnc: styles.pillDnc,
  nonPurchaser: styles.pillNonPurchaser,
  gifted: styles.pillGifted,
  unknown: styles.pillUnknown,
};

const PREVIEW_SESSION_KEY = 'agnes.reader-lifecycle-preview.v1';

function isFilters(value: unknown): value is LifecycleListFilters {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.q === 'string' &&
    typeof row.ownership === 'string' &&
    typeof row.purchaseSource === 'string' &&
    typeof row.confidence === 'string' &&
    typeof row.review === 'string' &&
    typeof row.contactability === 'string' &&
    typeof row.status === 'string' &&
    typeof row.includeArchived === 'boolean'
  );
}

function isHistory(value: unknown): value is CursorHistory {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    Array.isArray(row.stack) &&
    row.stack.every((item) => item === null || typeof item === 'string') &&
    (row.current === null || typeof row.current === 'string')
  );
}

function readPreviewSession(): {
  draft: LifecycleListFilters;
  applied: LifecycleListFilters;
  history: CursorHistory;
} | null {
  try {
    const raw = sessionStorage.getItem(PREVIEW_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const row = parsed as Record<string, unknown>;
    if (!isFilters(row.draft) || !isFilters(row.applied) || !isHistory(row.history)) return null;
    return { draft: row.draft, applied: row.applied, history: row.history };
  } catch {
    return null;
  }
}

function writePreviewSession(value: {
  draft: LifecycleListFilters;
  applied: LifecycleListFilters;
  history: CursorHistory;
}) {
  try {
    sessionStorage.setItem(PREVIEW_SESSION_KEY, JSON.stringify(value));
  } catch {
    // Ignore quota or private-mode failures; the list still works without persistence.
  }
}

const ERROR_COPY: Record<PreviewErrorKind, { title: string; body: string }> = {
  unauthorized: {
    title: 'Sign in required',
    body: 'This preview uses the same fulfillment login as other admin tools.',
  },
  not_configured: {
    title: 'Configuration unavailable',
    body: 'The server is missing required administrative configuration. Nothing was changed.',
  },
  unavailable: {
    title: 'Lifecycle service unavailable',
    body: 'The read service could not be reached. Try again in a moment.',
  },
  generic: {
    title: 'Unable to load readers',
    body: 'A read error occurred. Nothing was changed.',
  },
  not_found: {
    title: 'Reader not found',
    body: 'No lifecycle reader exists for this identifier.',
  },
};

export default function ReaderLifecyclePreviewClient() {
  const formId = useId();
  const [draft, setDraft] = useState<LifecycleListFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<LifecycleListFilters>(EMPTY_FILTERS);
  const [history, setHistory] = useState<CursorHistory>(initialCursorHistory);
  const [items, setItems] = useState<ReaderLifecycleListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [partial, setPartial] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<PreviewErrorKind | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [sessionReady, setSessionReady] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorKind(null);
    try {
      const qs = buildListQuery(applied, history.current);
      const res = await fetch(`${LIST_PROXY_PATH}?${qs.toString()}`, {
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
        setItems([]);
        setHasMore(false);
        setPartial(false);
        setNextCursor(null);
        setErrorKind(classifyHttpError(res.status, code));
        return;
      }
      const parsed = parseListResponse(body);
      setItems(parsed.items);
      setHasMore(parsed.hasMore);
      setPartial(parsed.partial);
      setNextCursor(parsed.nextCursor);
    } catch {
      setItems([]);
      setHasMore(false);
      setPartial(false);
      setNextCursor(null);
      setErrorKind('unavailable');
    } finally {
      setLoading(false);
    }
  }, [applied, history.current, reloadToken]);

  useEffect(() => {
    const restored = readPreviewSession();
    if (restored) {
      setDraft(restored.draft);
      setApplied(restored.applied);
      setHistory(restored.history);
    }
    setSessionReady(true);
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    writePreviewSession({ draft, applied, history });
  }, [sessionReady, draft, applied, history]);

  useEffect(() => {
    if (!sessionReady) return;
    void load();
  }, [load, sessionReady]);

  function updateDraft<K extends keyof LifecycleListFilters>(key: K, value: LifecycleListFilters[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function applyFilters() {
    setApplied({ ...draft, q: draft.q.trim() });
    setHistory(resetCursorHistory());
  }

  function clearFilters() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setHistory(resetCursorHistory());
  }

  const showEmpty = !loading && !errorKind && items.length === 0;
  const canPrevious = history.stack.length > 0 && !loading;
  const canNext = hasMore && !loading && Boolean(nextCursor);

  return (
    <div>
      <form
        className={styles.filters}
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters();
        }}
        aria-labelledby={`${formId}-filters`}
        aria-describedby={`${formId}-filter-hint`}
      >
        <div className={styles.filterIntro}>
          <h2 id={`${formId}-filters`} className={styles.filterHeading}>
            {LIST_FILTER_HEADING}
          </h2>
          <p id={`${formId}-filter-hint`} className={styles.filterHint}>
            {LIST_FILTER_EXPLANATION}
          </p>
        </div>
        <label className={styles.fieldWide}>
          <span className={styles.label} id={`${formId}-q-label`}>
            Search name or email
          </span>
          <input
            id={`${formId}-q`}
            aria-labelledby={`${formId}-q-label`}
            className={styles.input}
            value={draft.q}
            onChange={(e) => updateDraft('q', e.target.value)}
            type="search"
            autoComplete="off"
          />
        </label>
        <FilterSelect
          id={`${formId}-ownership`}
          label="Ownership"
          value={draft.ownership}
          onChange={(value) => updateDraft('ownership', value)}
          options={OWNERSHIP_VALUES.map((value) => ({ value, label: ownershipLabel(value) }))}
        />
        <FilterSelect
          id={`${formId}-source`}
          label="Purchase source"
          value={draft.purchaseSource}
          onChange={(value) => updateDraft('purchaseSource', value)}
          options={SOURCE_VALUES.map((value) => ({ value, label: sourceLabel(value) }))}
        />
        <FilterSelect
          id={`${formId}-confidence`}
          label="Confidence"
          value={draft.confidence}
          onChange={(value) => updateDraft('confidence', value)}
          options={CONFIDENCE_VALUES.map((value) => ({ value, label: confidenceLabel(value) }))}
        />
        <FilterSelect
          id={`${formId}-review`}
          label="Review state"
          value={draft.review}
          onChange={(value) => updateDraft('review', value)}
          options={REVIEW_VALUES.map((value) => ({ value, label: reviewLabel(value) }))}
        />
        <FilterSelect
          id={`${formId}-contact`}
          label="Contactability"
          value={draft.contactability}
          onChange={(value) => updateDraft('contactability', value)}
          options={CONTACTABILITY_VALUES.map((value) => ({ value, label: contactabilityLabel(value) }))}
        />
        <label className={styles.field}>
          <span className={styles.label} id={`${formId}-status-label`}>
            CRM status
          </span>
          <select
            id={`${formId}-status`}
            aria-labelledby={`${formId}-status-label`}
            className={styles.select}
            value={draft.status}
            onChange={(e) => updateDraft('status', e.target.value)}
          >
            <option value="">Default (exclude archived)</option>
            {CRM_STATUS_VALUES.map((value) => (
              <option key={value} value={value}>
                {crmStatusLabel(value)}
              </option>
            ))}
            <option value="all">All statuses</option>
          </select>
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={draft.includeArchived}
            onChange={(e) => updateDraft('includeArchived', e.target.checked)}
            disabled={Boolean(draft.status)}
          />
          Include archived
        </label>
        <div className={styles.actions}>
          <button className={styles.button} type="submit">
            Apply filters
          </button>
          <button className={styles.buttonSecondary} type="button" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      </form>

      <div className={styles.statusBar} aria-live="polite">
        {loading ? <span>Loading readers…</span> : null}
        {!loading && !errorKind ? (
          <span>
            Showing {items.length} reader{items.length === 1 ? '' : 's'}
            {hasMore ? ' — more records exist' : ''}
          </span>
        ) : null}
        {partial ? (
          <span className={styles.partial}>
            Results may be incomplete: the backend scan safety limit was reached.
          </span>
        ) : null}
      </div>

      {!loading && !errorKind && items.length > 0 ? (
        <p className={styles.legend}>{CONTACTABLE_ASTERISK_NOTE}</p>
      ) : null}

      {errorKind ? (
        <div className={styles.message} role="alert">
          <p className={styles.errorTitle}>{ERROR_COPY[errorKind].title}</p>
          <p style={{ margin: '0 0 12px' }}>{ERROR_COPY[errorKind].body}</p>
          {errorKind === 'unauthorized' ? (
            <p style={{ margin: '0 0 12px' }}>
              <Link href={FULFILLMENT_AUTH_HREF} style={{ color: '#2563eb' }}>
                Sign in at fulfillment auth
              </Link>
            </p>
          ) : null}
          <button
            className={styles.buttonSecondary}
            type="button"
            onClick={() => setReloadToken((n) => n + 1)}
          >
            Retry
          </button>
        </div>
      ) : null}

      {showEmpty ? (
        <div className={styles.message} role="status">
          No readers found for these filters.
        </div>
      ) : null}

      {!errorKind && items.length > 0 ? (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.srOnly}>Classified readers</caption>
              <thead>
                <tr>
                  <th scope="col">Reader</th>
                  <th scope="col">Ownership / sources</th>
                  <th scope="col">Confidence / review</th>
                  <th scope="col">Contact</th>
                  <th scope="col">Latest communication</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <ReaderRow key={item.readerProfileId || item.userId} item={item} />
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.cards}>
            {items.map((item) => (
              <ReaderCard key={`card-${item.readerProfileId || item.userId}`} item={item} />
            ))}
          </div>
        </>
      ) : null}

      <div className={styles.pager}>
        <button
          className={styles.buttonSecondary}
          type="button"
          disabled={!canPrevious}
          onClick={() => setHistory((prev) => goPreviousPage(prev))}
        >
          Previous
        </button>
        <button
          className={styles.buttonSecondary}
          type="button"
          disabled={!canNext}
          onClick={() => {
            if (!nextCursor) return;
            setHistory((prev) => goNextPage(prev, nextCursor));
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className={styles.field}>
      <span className={styles.label} id={`${id}-label`}>
        {label}
      </span>
      <select
        id={id}
        aria-labelledby={`${id}-label`}
        className={styles.select}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Any</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReaderRow({ item }: { item: ReaderLifecycleListItem }) {
  const tone = accentTone(item);
  const review = listReviewSummary(item);
  return (
    <tr className={TONE_CLASS[tone]}>
      <td>
        <span className={styles.name}>{item.name}</span>
        <span>{emailDisplay(item)}</span>
        <div className={styles.muted}>{legacyLine(item)}</div>
        <Link className={styles.detailsLink} href={detailPreviewPath(item.readerProfileId)}>
          View details
        </Link>
      </td>
      <td>
        <span className={`${styles.pill} ${PILL_CLASS[tone]}`}>{listOwnershipLabel(item)}</span>
        <div style={{ marginTop: 6 }}>{sourcesLabel(item.sources)}</div>
      </td>
      <td>
        <div>{review.primary}</div>
        {review.secondary ? <div style={{ marginTop: 6 }}>{review.secondary}</div> : null}
      </td>
      <td>
        <div>{listContactLabel(item)}</div>
      </td>
      <td>{communicationListSummary(item.latestCommunication)}</td>
    </tr>
  );
}

function ReaderCard({ item }: { item: ReaderLifecycleListItem }) {
  const tone = accentTone(item);
  const review = listReviewSummary(item);
  return (
    <article className={`${styles.card} ${TONE_CLASS[tone]}`}>
      <span className={styles.name}>{item.name}</span>
      <div>{emailDisplay(item)}</div>
      <span className={`${styles.pill} ${PILL_CLASS[tone]}`} style={{ marginTop: 8 }}>
        {listOwnershipLabel(item)}
      </span>
      <dl className={styles.cardRow}>
        <dt>Sources</dt>
        <dd style={{ margin: 0 }}>{sourcesLabel(item.sources)}</dd>
        <dt>Confidence / review</dt>
        <dd style={{ margin: 0 }}>
          {review.primary}
          {review.secondary ? ` · ${review.secondary}` : ''}
        </dd>
        <dt>Contact</dt>
        <dd style={{ margin: 0 }}>{listContactLabel(item)}</dd>
        <dt>Last communication</dt>
        <dd style={{ margin: 0 }}>{communicationListSummary(item.latestCommunication)}</dd>
        <dt>Legacy CRM</dt>
        <dd style={{ margin: 0 }}>{legacyLine(item)}</dd>
      </dl>
      <Link className={styles.detailsLink} href={detailPreviewPath(item.readerProfileId)}>
        View details
      </Link>
    </article>
  );
}

function legacyLine(item: ReaderLifecycleListItem): string {
  const bits = [
    item.legacy.readerType ? `Type: ${item.legacy.readerType}` : null,
    item.legacy.source ? `Source: ${item.legacy.source}` : null,
    item.legacy.status ? `Status: ${item.legacy.status}` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(' · ') : 'No legacy CRM fields';
}
