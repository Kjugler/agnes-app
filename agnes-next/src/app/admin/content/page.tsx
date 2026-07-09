'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type ChapterRow = {
  chapterId: string;
  label: string;
  opened: number;
  averageTime: string | null;
  purchased: number;
  conversionPercent: number | null;
};

type CtaRow = {
  key: string;
  label: string;
  clicked: number;
  purchased: number;
  conversionPercent: number | null;
};

type ContentReport = {
  ok: boolean;
  range?: { start: string; end: string };
  chapters?: ChapterRow[];
  readersAgreeCtas?: CtaRow[];
  notes?: { conversionBasis?: string; averageTimeBasis?: string };
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

const card: CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: '20px 22px',
  background: '#fff',
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
};

const statLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#64748b',
  marginBottom: 4,
};

const statValue: CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: '#0f172a',
  lineHeight: 1.2,
};

function formatPct(value: number | null | undefined) {
  if (value == null) return '—';
  return `${value}%`;
}

export default function ContentReportPage() {
  const initial = defaultRange();
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [data, setData] = useState<ContentReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams({ start, end });
      const res = await fetch(`/api/admin/content-report?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const json = (await res.json()) as ContentReport;
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
        <Link href="/admin/funnel" style={{ color: '#2563eb', fontSize: 14 }}>
          Funnel report
        </Link>
        {' · '}
        <Link href="/admin/content" style={{ color: '#2563eb', fontSize: 14 }}>
          Content performance
        </Link>
      </p>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px 0' }}>Content Performance</h1>
      <p style={{ margin: '0 0 24px 0', fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>
        Which sample chapters and Readers Agree CTAs actually lead to purchases.
      </p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'flex-end',
          marginBottom: 28,
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

      {err && <p style={{ color: '#b91c1c', fontSize: 14, marginBottom: 16 }}>{err}</p>}

      {data?.chapters && (
        <>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 16px 0' }}>Sample chapters</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
              marginBottom: 40,
            }}
          >
            {data.chapters.map((row) => (
              <div key={row.chapterId} style={card}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 700 }}>{row.label}</h3>
                <div style={{ display: 'grid', gap: 14 }}>
                  <div>
                    <div style={statLabel}>Opened</div>
                    <div style={statValue}>{row.opened}</div>
                  </div>
                  <div>
                    <div style={statLabel}>Average time</div>
                    <div style={statValue}>{row.averageTime ?? '—'}</div>
                  </div>
                  <div>
                    <div style={statLabel}>Conversion</div>
                    <div style={{ ...statValue, color: '#15803d' }}>
                      {formatPct(row.conversionPercent)}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                      {row.purchased} purchased
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {data?.readersAgreeCtas && (
        <>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 8px 0' }}>
            Readers Agree CTAs
          </h2>
          <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#64748b' }}>
            Clicks on the three cards from `/readers-agree`, matched to purchases by visitor ID.
          </p>
          <div style={{ display: 'grid', gap: 12 }}>
            {data.readersAgreeCtas.map((row) => (
              <div
                key={row.key}
                style={{
                  ...card,
                  display: 'grid',
                  gridTemplateColumns: '1fr repeat(3, minmax(80px, auto))',
                  gap: 16,
                  alignItems: 'center',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 15 }}>{row.label}</div>
                <div>
                  <div style={statLabel}>Clicked</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{row.clicked}</div>
                </div>
                <div>
                  <div style={statLabel}>Purchased</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{row.purchased}</div>
                </div>
                <div>
                  <div style={statLabel}>Conversion</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#15803d' }}>
                    {formatPct(row.conversionPercent)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {data?.notes && (
        <p style={{ marginTop: 32, fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
          {data.notes.conversionBasis}
          {' '}
          {data.notes.averageTimeBasis}
        </p>
      )}
    </div>
  );
}
