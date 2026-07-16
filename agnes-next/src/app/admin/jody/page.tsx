'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type FunnelStep = {
  key: string;
  label: string;
  count: number;
  conversionFromPrevious: number | null;
  conversionFromTop: number | null;
};

type JodyReport = {
  ok: boolean;
  range?: { start: string; end: string };
  metrics?: Record<string, number>;
  funnel?: FunnelStep[];
  notes?: {
    chapter1FinishedBasis?: string;
    identityBasis?: string;
    trustNote?: string;
    plannedEngagementMetrics?: string[];
  };
  error?: string;
};

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function defaultRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { start: ymd(start), end: ymd(end) };
}

function formatPct(value: number | null | undefined) {
  if (value == null) return '—';
  return `${value}%`;
}

const card: CSSProperties = {
  border: '1px solid #ccfbf1',
  borderRadius: 12,
  padding: '22px 24px',
  background: 'linear-gradient(180deg, #f0fdfa 0%, #ffffff 100%)',
  boxShadow: '0 2px 8px rgba(13, 148, 136, 0.08)',
};

const metricRow: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 16,
  padding: '14px 0',
  borderBottom: '1px solid #e2e8f0',
};

const metricLabel: CSSProperties = {
  fontSize: 15,
  color: '#0f172a',
  fontWeight: 500,
  flex: 1,
};

const metricValue: CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  color: '#0d9488',
  fontVariantNumeric: 'tabular-nums',
  minWidth: 72,
  textAlign: 'right',
};

const metricSub: CSSProperties = {
  fontSize: 12,
  color: '#64748b',
  minWidth: 88,
  textAlign: 'right',
};

export default function JodyDashboardPage() {
  const initial = defaultRange();
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [data, setData] = useState<JodyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams({ start, end });
      const res = await fetch(`/api/admin/jody-report?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const json = (await res.json()) as JodyReport;
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

  const funnel = data?.funnel ?? [];
  const maxCount = Math.max(...funnel.map((s) => s.count), 1);

  return (
    <div
      style={{
        maxWidth: 720,
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
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
        <img
          src="/jody-icons/jody-em2.png"
          alt=""
          width={48}
          height={48}
          style={{ borderRadius: '50%', objectFit: 'cover', border: '2px solid #99f6e4' }}
        />
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Jody Dashboard</h1>
      </div>
      <p style={{ margin: '0 0 24px 0', fontSize: 14, color: '#64748b', lineHeight: 1.55 }}>
        Where readers meet Jody — and where trust converts to verified email. Use this to find
        friction, not to pressure more asks.
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
            borderRadius: 8,
            border: 'none',
            background: '#0d9488',
            color: '#fff',
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {err && (
        <p style={{ color: '#b91c1c', fontSize: 14, marginBottom: 16 }}>
          {err}
          {err === 'unauthorized' && (
            <>
              {' '}
              — save your fulfillment token at{' '}
              <Link href="/admin/fulfillment/auth" style={{ color: '#2563eb' }}>
                /admin/fulfillment/auth
              </Link>
            </>
          )}
        </p>
      )}

      {data?.ok && (
        <div style={card}>
          {funnel.map((step) => (
            <div key={step.key}>
              <div style={metricRow}>
                <span style={metricLabel}>{step.label}</span>
                <span style={metricValue}>{step.count.toLocaleString()}</span>
                <span style={metricSub}>
                  {step.conversionFromPrevious != null
                    ? `${formatPct(step.conversionFromPrevious)} from prev`
                    : step.conversionFromTop != null
                      ? `${formatPct(step.conversionFromTop)} of top`
                      : '—'}
                </span>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 3,
                  background: '#e2e8f0',
                  marginBottom: 4,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.max(4, (step.count / maxCount) * 100)}%`,
                    background: 'linear-gradient(90deg, #14b8a6, #0d9488)',
                    borderRadius: 3,
                    transition: 'width 400ms ease',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {data?.metrics && (
        <div style={{ marginTop: 20, fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
          <p style={{ margin: '0 0 6px 0' }}>
            <strong>Not Now</strong> (trust-preserving declines):{' '}
            {(data.metrics.rememberPlaceDeclined ?? 0).toLocaleString()}
          </p>
          <p style={{ margin: '0 0 6px 0' }}>
            <strong>Updates declined</strong>:{' '}
            {(data.metrics.updatesDeclined ?? 0).toLocaleString()}
          </p>
          {data.notes?.chapter1FinishedBasis && (
            <p style={{ margin: '12px 0 0 0' }}>
              Chapter 1 finished: {data.notes.chapter1FinishedBasis}
            </p>
          )}
          {data.notes?.trustNote && (
            <p style={{ margin: '8px 0 0 0', fontStyle: 'italic' }}>{data.notes.trustNote}</p>
          )}
          {data.notes?.plannedEngagementMetrics && (
            <p style={{ margin: '16px 0 0 0', fontSize: 12, color: '#94a3b8' }}>
              <strong>Coming soon:</strong>{' '}
              {data.notes.plannedEngagementMetrics
                .map((m: string) =>
                  m
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/^./, (c) => c.toUpperCase())
                    .trim(),
                )
                .join(' · ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
