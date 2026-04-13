'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type UserRow = {
  userId: string;
  email: string;
  name: string;
  contestJoinedAt: string | null;
  userCreatedAt: string;
  totalLedgerPoints: number;
  activeDaysUtc: number;
  ledgerRowCount: number;
  purchaseCount: number;
  isContestParticipant: boolean;
  isPlayerDisplay: boolean;
};

type Report = {
  ok: boolean;
  error?: string;
  generatedAt?: string;
  summary?: {
    totalUsers: number;
    contestParticipants: number;
    totalPurchases: number;
    usersWithAnyLedgerActivity: number;
    usersWithMoreThanOneLedgerDayUtc: number;
    playerDisplayCount: number;
  };
  notes?: {
    activeDayBasis: string;
    searchMatches: number;
    contestOnlyFilter: boolean;
  };
  topFinalists?: UserRow[];
  topByTotalLedgerPoints?: UserRow[];
  topByActiveDaysUtc?: UserRow[];
  topByLedgerRowCount?: UserRow[];
  playerUsers?: UserRow[];
  users?: UserRow[];
};

function UserTable({ title, rows, showContestCols }: { title: string; rows: UserRow[]; showContestCols?: boolean }) {
  return (
    <section style={{ marginBottom: '2rem' }}>
      <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>{title}</h2>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.875rem',
            background: '#111',
            color: '#eee',
          }}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid #333', textAlign: 'left' }}>
              <th style={{ padding: '8px 6px' }}>Name</th>
              <th style={{ padding: '8px 6px' }}>Email</th>
              <th style={{ padding: '8px 6px' }}>Points</th>
              <th style={{ padding: '8px 6px' }}>Days</th>
              <th style={{ padding: '8px 6px' }}>Ledger</th>
              <th style={{ padding: '8px 6px' }}>Purchases</th>
              {showContestCols ? (
                <>
                  <th style={{ padding: '8px 6px' }}>Contest</th>
                  <th style={{ padding: '8px 6px' }}>Player</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={showContestCols ? 8 : 6} style={{ padding: '12px 6px', color: '#888' }}>
                  No rows.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.userId} style={{ borderBottom: '1px solid #222' }}>
                  <td style={{ padding: '8px 6px' }}>{r.name}</td>
                  <td style={{ padding: '8px 6px', wordBreak: 'break-all' }}>{r.email}</td>
                  <td style={{ padding: '8px 6px' }}>{r.totalLedgerPoints.toLocaleString()}</td>
                  <td style={{ padding: '8px 6px' }}>{r.activeDaysUtc}</td>
                  <td style={{ padding: '8px 6px' }}>{r.ledgerRowCount}</td>
                  <td style={{ padding: '8px 6px' }}>{r.purchaseCount}</td>
                  {showContestCols ? (
                    <>
                      <td style={{ padding: '8px 6px' }}>{r.isContestParticipant ? 'Yes' : '—'}</td>
                      <td style={{ padding: '8px 6px' }}>{r.isPlayerDisplay ? 'Yes' : '—'}</td>
                    </>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ContestUsersAdminClient() {
  const [q, setQ] = useState('');
  const [contestOnly, setContestOnly] = useState(true);
  const [topN, setTopN] = useState(20);
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (contestOnly) params.set('contestOnly', '1');
    params.set('top', String(topN));
    const url = `/api/admin/contest/analytics?${params.toString()}`;
    fetch(url)
      .then((r) => r.json())
      .then((d: Report) => {
        if (!d.ok) {
          setErr(d.error || 'Request failed');
          setData(null);
          return;
        }
        setData(d);
      })
      .catch(() => {
        setErr('Network error');
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [q, contestOnly, topN]);

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem', color: '#e0e0e0' }}>
      <p style={{ marginBottom: '1rem' }}>
        <Link href="/admin/contest/daily-summary" style={{ color: '#6cf' }}>
          ← Daily contest summary
        </Link>
      </p>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Contest & users</h1>
      <p style={{ color: '#999', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
        Admin only. Uses fulfillment session + server proxy. Ledger points match score rollup; days are UTC.
      </p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
          marginBottom: '1.25rem',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Search</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="name or email"
            style={{ padding: '6px 10px', minWidth: 220, background: '#1a1a1a', border: '1px solid #444', color: '#fff' }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={contestOnly} onChange={(e) => setContestOnly(e.target.checked)} />
          Contest participants only
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Top lists</span>
          <select
            value={topN}
            onChange={(e) => setTopN(Number(e.target.value))}
            style={{ padding: '6px', background: '#1a1a1a', border: '1px solid #444', color: '#fff' }}
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </label>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          style={{
            padding: '8px 16px',
            background: '#0a7',
            border: 'none',
            color: '#fff',
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {err ? (
        <p style={{ color: '#f66', marginBottom: '1rem' }}>{err}</p>
      ) : null}

      {data?.summary ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: '10px',
            marginBottom: '1.5rem',
          }}
        >
          {[
            ['Total users', data.summary.totalUsers],
            ['Contest participants', data.summary.contestParticipants],
            ['Books claimed (purchases)', data.summary.totalPurchases],
            ['Users w/ ledger', data.summary.usersWithAnyLedgerActivity],
            ['Repeat days (UTC)', data.summary.usersWithMoreThanOneLedgerDayUtc],
            ['“Player” display (contest)', data.summary.playerDisplayCount],
          ].map(([label, n]) => (
            <div
              key={String(label)}
              style={{
                background: '#1a1a1a',
                border: '1px solid #333',
                padding: '12px',
                borderRadius: 4,
              }}
            >
              <div style={{ fontSize: '0.75rem', color: '#888' }}>{label}</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 600 }}>{n}</div>
            </div>
          ))}
        </div>
      ) : null}

      {data?.generatedAt ? (
        <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '1rem' }}>
          Generated {new Date(data.generatedAt).toLocaleString()} · {data.notes?.activeDayBasis}
          {data.notes?.contestOnlyFilter ? ' · list filtered to contest' : ''} · {data.notes?.searchMatches}{' '}
          rows in table below
        </p>
      ) : null}

      {data?.topFinalists ? (
        <UserTable title="Top 5 by points (finalists quick view)" rows={data.topFinalists} />
      ) : null}
      {data?.playerUsers ? (
        <UserTable title={`“Player” (contest joined, no name) — ${data.playerUsers.length}`} rows={data.playerUsers} />
      ) : null}
      {data?.topByTotalLedgerPoints ? (
        <UserTable title={`Top ${topN} by ledger points`} rows={data.topByTotalLedgerPoints} />
      ) : null}
      {data?.topByActiveDaysUtc ? (
        <UserTable title={`Top ${topN} by active days (UTC)`} rows={data.topByActiveDaysUtc} />
      ) : null}
      {data?.topByLedgerRowCount ? (
        <UserTable title={`Top ${topN} by ledger rows`} rows={data.topByLedgerRowCount} />
      ) : null}
      {data?.users ? (
        <UserTable title="Filtered user list" rows={data.users} showContestCols />
      ) : null}
    </div>
  );
}
