'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

type RepLedger = {
  ok: boolean;
  rep?: { name: string; role: string; referralCode: string };
  summary?: {
    directSales: number;
    downlineSales: number;
    directCommissionsCents: number;
    overrideEarningsCents: number;
    totalEarnedCents: number;
    totalPointsGenerated: number;
    conversionCount: number;
    referralCodePerformance: { code: string; topPerformingLink: string | null };
  };
  range?: { start: string; end: string };
  error?: string;
};

function money(cents: number) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

export default function RepSalesLedgerPage() {
  const [data, setData] = useState<RepLedger | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch('/api/reps/sales-ledger', { cache: 'no-store' });
        const j = (await r.json()) as RepLedger;
        if (!alive) return;
        if (!r.ok) {
          setError(j.error || `HTTP ${r.status}`);
          return;
        }
        setData(j);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'load_failed');
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div style={wrap}>
      <h1 style={{ margin: 0, fontSize: 24 }}>Rep sales ledger</h1>
      <p style={{ color: '#475569', marginTop: 8 }}>
        Rep-safe operational metrics only. No customer payment details are shown.
      </p>
      {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
      {data?.summary ? (
        <div style={grid}>
          <Card label="Direct sales" value={String(data.summary.directSales)} />
          <Card label="Downline sales" value={String(data.summary.downlineSales)} />
          <Card label="$2 direct commissions" value={money(data.summary.directCommissionsCents)} />
          <Card label="$3 override splits" value={money(data.summary.overrideEarningsCents)} />
          <Card label="Total earned" value={money(data.summary.totalEarnedCents)} />
          <Card label="Total points generated" value={String(data.summary.totalPointsGenerated)} />
          <Card label="Conversion count" value={String(data.summary.conversionCount)} />
          <Card
            label="Referral code performance"
            value={
              data.summary.referralCodePerformance.topPerformingLink ||
              data.summary.referralCodePerformance.code ||
              '—'
            }
          />
        </div>
      ) : null}
      {data?.range ? (
        <p style={{ color: '#64748b', fontSize: 12 }}>
          Range: {data.range.start.slice(0, 10)} → {data.range.end.slice(0, 10)}
        </p>
      ) : null}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div style={card}>
      <div style={{ color: '#64748b', fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

const wrap: CSSProperties = {
  maxWidth: 900,
  margin: '0 auto',
  padding: '24px 16px 48px',
  fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
};

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
};

const card: CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: 12,
  background: '#fff',
};

