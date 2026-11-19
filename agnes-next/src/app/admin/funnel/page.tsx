'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type FunnelStage = {
  key: string;
  label: string;
  count: number;
  uniqueVisitors?: number | null;
  unit?: string;
  note?: string;
  authoritative?: boolean;
};

type LandingMetric = {
  key: string;
  label: string;
  raw: number | null;
  uniqueVisitors: number | null;
  note?: string;
};

type LandingRate = {
  display: string;
  numerator: number | null;
  denominator: number;
  percent: number | null;
};

type LandingCampaign = {
  source: string;
  medium: string;
  campaign: string;
  content: string;
  term: string;
  uniqueVisitors: number;
};

type LandingPagePerformance = {
  key: string;
  label: string;
  path: string;
  metrics: LandingMetric[];
  rates: {
    sampleEngagement: LandingRate;
    catalog: LandingRate;
    checkout: LandingRate;
    verifiedPurchase: LandingRate;
  };
  rateNotes: Record<string, string>;
  campaigns: LandingCampaign[];
  attributionGaps: string[];
};

type LandingPerformance = {
  pages: LandingPagePerformance[];
  overview: {
    uniqueVisitors: number;
    verifiedDirectPurchases: number;
    attributedVerifiedPurchases: number;
    unattributedVerifiedPurchases: number;
    retailerOutboundClicks: number;
    unknownVisitors: number;
    campaigns: LandingCampaign[];
    measurementEnds: string;
  };
  diagnostics: {
    missingVisitorId: number;
    missingLandingMetadata: number;
    unknownSourceVisitors: number;
    duplicateSubmissions: number;
    unmatchedCheckouts: number;
    unknownVisitActivity?: number;
    unmatchedPurchases: number;
    legacyEvents: Record<string, number>;
    eventsWithoutLanding: number;
  };
};

type FunnelReport = {
  ok: boolean;
  range?: { start: string; end: string; timeZone?: string };
  stages?: FunnelStage[];
  historicalStages?: FunnelStage[];
  landingPerformance?: LandingPerformance;
  engagement?: {
    readersAgreeScrollDepth: Record<string, number>;
    readersAgreeMedianSecondsOnPage: number | null;
    readersAgreeTimeOnPageEvents: number;
  };
  eventBreakdown?: Record<string, number>;
  chapterOpens?: Record<string, number>;
  downstream?: {
    purchases: number;
    referralConversions: number;
    textFriendShared: number;
    recommendationEmailsSent: number;
  };
  error?: string;
};

function ymdDenver(d: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function defaultRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { start: ymdDenver(start), end: ymdDenver(end) };
}

const UNIT_LABELS: Record<string, string> = {
  events: 'events',
  purchases: 'purchases',
  users: 'users',
  ledger_rows: 'ledger rows',
  referral_conversions: 'conversions',
};

const th: CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  borderBottom: '2px solid #e2e8f0',
  fontSize: 13,
  fontWeight: 600,
  color: '#334155',
};

const td: CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid #eef2f6',
  fontSize: 14,
  verticalAlign: 'top',
};

function countCell(stage: FunnelStage) {
  if (stage.unit && stage.unit !== 'events') {
    const label = UNIT_LABELS[stage.unit] || stage.unit;
    return `${stage.count} ${label}`;
  }
  return String(stage.count);
}

function uniqueCell(stage: FunnelStage) {
  if (stage.unit && stage.unit !== 'events') {
    return '—';
  }
  if (typeof stage.uniqueVisitors === 'number') return String(stage.uniqueVisitors);
  return '—';
}

function StageTable({ stages }: { stages: FunnelStage[] }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 32 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
        <thead>
          <tr>
            <th style={th}>Stage</th>
            <th style={{ ...th, textAlign: 'right' }}>Count</th>
            <th style={{ ...th, textAlign: 'right' }}>Unique visitors</th>
            <th style={th}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((stage) => (
            <tr
              key={stage.key}
              style={
                stage.authoritative
                  ? { background: '#f0fdf4' }
                  : undefined
              }
            >
              <td style={{ ...td, fontWeight: stage.authoritative ? 700 : 400 }}>
                {stage.label}
                {stage.authoritative ? (
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#15803d', marginTop: 2 }}>
                    Authoritative sales metric
                  </div>
                ) : null}
              </td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{countCell(stage)}</td>
              <td
                style={{
                  ...td,
                  textAlign: 'right',
                  color: stage.unit && stage.unit !== 'events' ? '#64748b' : undefined,
                  fontSize: stage.unit && stage.unit !== 'events' ? 13 : 14,
                }}
              >
                {uniqueCell(stage)}
              </td>
              <td style={{ ...td, color: '#64748b', fontSize: 13 }}>{stage.note || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function countOrDash(value: number | null) {
  return typeof value === 'number' ? String(value) : '—';
}

function CampaignTable({ rows }: { rows: LandingCampaign[] }) {
  if (!rows.length) return null;
  return (
    <div style={{ overflowX: 'auto', marginTop: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
        <thead>
          <tr>
            <th style={th}>Source</th>
            <th style={th}>Campaign</th>
            <th style={th}>Content</th>
            <th style={th}>Term</th>
            <th style={{ ...th, textAlign: 'right' }}>Unique visitors</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.source}|${row.medium}|${row.campaign}|${row.content}|${row.term}`}>
              <td style={td}>{row.source}</td>
              <td style={td}>{row.campaign}</td>
              <td style={td}>{row.content}</td>
              <td style={td}>{row.term}</td>
              <td style={{ ...td, textAlign: 'right' }}>{row.uniqueVisitors}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ margin: '8px 0 0 0', fontSize: 12, color: '#64748b' }}>
        Unique visitors are not additive across campaign rows. Click identifiers are omitted. A row
        labeled Advertising click id has a click id and no campaign name.
      </p>
    </div>
  );
}

function LandingPerformancePanel({ report }: { report: LandingPerformance }) {
  const rates: Array<{ key: keyof LandingPagePerformance['rates']; label: string }> = [
    { key: 'sampleEngagement', label: 'Landing page to sample reading' },
    { key: 'catalog', label: 'Landing page to catalog' },
    { key: 'checkout', label: 'Landing page to checkout' },
    { key: 'verifiedPurchase', label: 'Attributed verified purchase' },
  ];

  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px 0' }}>Landing Page Performance</h2>
      <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
        {report.overview.measurementEnds} The All Landing Pages unique count is deduplicated. Do not
        add the four page totals together.
      </p>

      <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 8px 0' }}>All landing pages</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
        <tbody>
          <tr>
            <td style={td}>Unique visitors</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{report.overview.uniqueVisitors}</td>
            <td style={{ ...td, color: '#64748b', fontSize: 13 }}>One person who opens more than one landing page counts once.</td>
          </tr>
          <tr>
            <td style={td}>Verified direct purchases</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{report.overview.verifiedDirectPurchases}</td>
            <td style={{ ...td, color: '#64748b', fontSize: 13 }}>Server Purchase rows. This is the sales total.</td>
          </tr>
          <tr>
            <td style={td}>Attributed verified purchases</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{report.overview.attributedVerifiedPurchases}</td>
            <td style={{ ...td, color: '#64748b', fontSize: 13 }}>Those sales with a defensible landing page.</td>
          </tr>
          <tr>
            <td style={td}>Unattributed verified purchases</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{report.overview.unattributedVerifiedPurchases}</td>
            <td style={{ ...td, color: '#64748b', fontSize: 13 }}>Confirmed sales with no reliable landing page.</td>
          </tr>
          <tr>
            <td style={td}>Retailer outbound clicks</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{report.overview.retailerOutboundClicks}</td>
            <td style={{ ...td, color: '#64748b', fontSize: 13 }}>Amazon and Barnes & Noble clicks. Not retailer sales.</td>
          </tr>
          <tr>
            <td style={td}>Unknown entry visitors</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{report.overview.unknownVisitors}</td>
            <td style={{ ...td, color: '#64748b', fontSize: 13 }}>Activity with a visitor id and no established landing page.</td>
          </tr>
        </tbody>
      </table>
      <CampaignTable rows={report.overview.campaigns} />

      {report.pages.map((page) => (
        <div key={page.key} style={{ marginTop: 28 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 8px 0' }}>
            {page.label} <span style={{ fontWeight: 400, color: '#64748b' }}>{page.path}</span>
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={th}>Metric</th>
                  <th style={{ ...th, textAlign: 'right' }}>Raw events</th>
                  <th style={{ ...th, textAlign: 'right' }}>Unique visitors</th>
                  <th style={th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {page.metrics.map((metric) => (
                  <tr key={metric.key}>
                    <td style={td}>{metric.label}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{countOrDash(metric.raw)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{countOrDash(metric.uniqueVisitors)}</td>
                    <td style={{ ...td, color: '#64748b', fontSize: 13 }}>{metric.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul style={{ margin: '12px 0 0 0', paddingLeft: 20, fontSize: 13, lineHeight: 1.55, color: '#334155' }}>
            {rates.map((rate) => (
              <li key={rate.key}>
                {rate.label}: <strong>{page.rates[rate.key].display}</strong>
                <span style={{ color: '#64748b' }}> — {page.rateNotes[rate.key]}</span>
              </li>
            ))}
          </ul>
          {page.attributionGaps.length > 0 ? (
            <p style={{ margin: '8px 0 0 0', fontSize: 13, color: '#9a3412' }}>
              Attribution gaps: {page.attributionGaps.join(' ')}
            </p>
          ) : null}
          <CampaignTable rows={page.campaigns} />
        </div>
      ))}

      <h3 style={{ fontSize: 15, fontWeight: 600, margin: '28px 0 8px 0' }}>Data quality</h3>
      <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.6, color: '#334155' }}>
        <li>Events missing a visitor id: {report.diagnostics.missingVisitorId}</li>
        <li>Landing views that could not be classified: {report.diagnostics.missingLandingMetadata}</li>
        <li>Landing visitors with no advertising parameters: {report.diagnostics.unknownSourceVisitors}</li>
        <li>Duplicate submissions within 2 seconds: {report.diagnostics.duplicateSubmissions}</li>
        <li>Checkout starts with no entry landing: {report.diagnostics.unmatchedCheckouts}</li>
        <li>Reading, catalog, checkout, or purchase events with no visit entry: {report.diagnostics.unknownVisitActivity || 0}</li>
        <li>Verified purchases with no landing link: {report.diagnostics.unmatchedPurchases}</li>
        <li>Events with neither a current landing nor an entry landing: {report.diagnostics.eventsWithoutLanding}</li>
        <li>
          Legacy event names still on record: Buy click {report.diagnostics.legacyEvents.READERS_AGREE_BUY_CLICK || 0},
          sample click {report.diagnostics.legacyEvents.READERS_AGREE_SAMPLE_CHAPTERS_CLICK || 0},
          unused start-reading {report.diagnostics.legacyEvents.READERS_AGREE_START_READING_CLICK || 0}
        </li>
      </ul>
    </section>
  );
}

export default function FunnelReportPage() {
  const initial = defaultRange();
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [data, setData] = useState<FunnelReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams({ start, end });
      const res = await fetch(`/api/admin/funnel-report?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const json = (await res.json()) as FunnelReport;
      if (!res.ok) {
        setErr(json.error || `HTTP ${res.status}`);
        setData(null);
        return;
      }
      setData(json);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Load failed');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div
      style={{
        maxWidth: 1080,
        margin: '0 auto',
        padding: '32px 20px 48px',
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        color: '#0f172a',
      }}
    >
      <p style={{ margin: '0 0 8px 0' }}>
        <Link href="/admin" style={{ color: '#2563eb', fontSize: 14 }}>
          ← Admin
        </Link>
        {' · '}
        <Link href="/admin/content" style={{ color: '#2563eb', fontSize: 14 }}>
          Content performance
        </Link>
      </p>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px 0' }}>Reader Funnel Report</h1>
      <p style={{ margin: '0 0 8px 0', fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>
        Current production path. Event stages show raw events and unique visitors (
        <code>ap_funnel_vid</code>
        ). Purchase recorded (server) is the sales source of truth. Landing Page
        Performance separates the four advertising pages. Click identifiers are
        not displayed.
      </p>
      <p style={{ margin: '0 0 24px 0', fontSize: 13, color: '#64748b' }}>
        Date range is America/Denver. The end date includes the entire selected Mountain Time day.
        {data?.range?.start && data?.range?.end
          ? ` Resolved: ${data.range.start} → ${data.range.end}${data.range.timeZone ? ` (${data.range.timeZone})` : ''}.`
          : null}
      </p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'flex-end',
          marginBottom: 24,
        }}
      >
        <label style={{ fontSize: 13 }}>
          Start
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            style={{ display: 'block', marginTop: 4, padding: '6px 8px' }}
          />
        </label>
        <label style={{ fontSize: 13 }}>
          End
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            style={{ display: 'block', marginTop: 4, padding: '6px 8px' }}
          />
        </label>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {err && (
        <p style={{ color: '#b91c1c', fontSize: 14, marginBottom: 16 }}>{err}</p>
      )}

      {data?.landingPerformance ? <LandingPerformancePanel report={data.landingPerformance} /> : null}

      {data?.stages && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px 0' }}>Conversion path</h2>
          <p style={{ margin: '0 0 12px 0', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
            Existing stage history. Readers Cheer is no longer included in the Readers Agree rows.
            World Wondering retailer clicks stay in Landing Page Performance.
          </p>
          <StageTable stages={data.stages} />
        </>
      )}

      {data?.historicalStages && data.historicalStages.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px 0' }}>Historical (legacy CTAs)</h2>
          <p style={{ margin: '0 0 12px 0', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
            These event types are no longer fired by the current Readers Agree v2 landing. They are
            not current conversion metrics.
          </p>
          <StageTable stages={data.historicalStages} />
        </>
      )}

      {data?.engagement && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px 0' }}>
            Readers Agree engagement
          </h2>
          <ul style={{ margin: '0 0 24px 0', paddingLeft: 20, fontSize: 14, lineHeight: 1.6 }}>
            <li>
              Scroll depth (25 / 50 / 75 / 100%):{' '}
              {[25, 50, 75, 100]
                .map((d) => `${d}%=${data.engagement?.readersAgreeScrollDepth?.[d] ?? 0}`)
                .join(', ')}
            </li>
            <li>
              Median time on page:{' '}
              {data.engagement.readersAgreeMedianSecondsOnPage != null
                ? `${data.engagement.readersAgreeMedianSecondsOnPage}s`
                : '—'}
            </li>
            <li>Time-on-page events: {data.engagement.readersAgreeTimeOnPageEvents}</li>
          </ul>
        </>
      )}

      {data?.eventBreakdown && Object.keys(data.eventBreakdown).length > 0 && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px 0' }}>Event breakdown</h2>
          <p style={{ margin: '0 0 12px 0', fontSize: 13, color: '#64748b' }}>
            Raw Event counts for all funnel types in range, including legacy and undisplayed types.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
              <thead>
                <tr>
                  <th style={th}>Event type</th>
                  <th style={{ ...th, textAlign: 'right' }}>Count</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.eventBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => (
                    <tr key={type}>
                      <td style={{ ...td, fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>
                        {type}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>{count}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
