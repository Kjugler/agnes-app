'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function ContestLiveAdminPage() {
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/contest/live-stats', { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((json as { error?: string })?.error || `HTTP ${res.status}`);
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '32px 20px 48px',
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
      }}
    >
      <p style={{ margin: '0 0 16px 0' }}>
        <Link href="/admin/contest" style={{ color: '#2563eb', fontSize: 14 }}>
          ← Contest admin
        </Link>
      </p>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px 0' }}>Live contest stats</h1>
      <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#64748b' }}>
        Same payload as <code style={{ fontSize: 12 }}>/api/contest/live-stats</code>.
      </p>
      {loading && <p style={{ fontSize: 14 }}>Loading…</p>}
      {error && (
        <p style={{ fontSize: 14, color: '#b91c1c' }} role="alert">
          {error}
        </p>
      )}
      {!loading && !error && (
        <pre
          style={{
            fontSize: 12,
            lineHeight: 1.5,
            padding: 16,
            background: '#f1f5f9',
            borderRadius: 8,
            overflow: 'auto',
            margin: 0,
          }}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
