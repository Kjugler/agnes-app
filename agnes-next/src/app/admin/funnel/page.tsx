'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type FunnelStage = {
  key: string;
  label: string;
  count: number;
  note?: string;
};

type FunnelReport = {
  ok: boolean;
  range?: { start: string; end: string };
  stages?: FunnelStage[];
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

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function defaultRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { start: ymd(start), end: ymd(end) };
}

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
        maxWidth: 960,
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
      <p style={{ margin: '0 0 24px 0', fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>
        First-party funnel events from the deepquill Event table, connected to Purchase,
        ReferralConversion, recommendation outreach, and Text-a-Friend ledger rows.
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

      {data?.stages && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px 0' }}>Conversion path</h2>
          <div style={{ overflowX: 'auto', marginBottom: 32 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={th}>Stage</th>
                  <th style={{ ...th, textAlign: 'right' }}>Count</th>
                  <th style={th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {data.stages.map((stage) => (
                  <tr key={stage.key}>
                    <td style={td}>{stage.label}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{stage.count}</td>
                    <td style={{ ...td, color: '#64748b', fontSize: 13 }}>{stage.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
