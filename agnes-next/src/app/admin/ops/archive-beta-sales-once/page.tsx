'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function ArchiveBetaSalesOncePage() {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    if (!window.confirm('Run one-time beta archive on production data? This should only run once.')) {
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/ops/archive-beta-sales-once', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: '{}',
      });
      const json = await res.json().catch(() => ({}));
      setResult(JSON.stringify(json, null, 2));
    } catch (e) {
      setResult(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

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
        <Link href="/admin" style={{ color: '#2563eb', fontSize: 14 }}>
          ← Admin home
        </Link>
      </p>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px 0' }}>
        Beta archive <span style={{ color: '#b45309', fontSize: 14, fontWeight: 600 }}>(TEMPORARY)</span>
      </h1>
      <p style={{ margin: '0 0 12px 0', fontSize: 14, color: '#64748b' }}>
        POST <code style={{ fontSize: 12 }}>/api/admin/ops/archive-beta-sales-once</code> — DeepQuill one-time
        archive (fixed cutoff). Remove this page after production run.
      </p>
      <button
        type="button"
        onClick={run}
        disabled={loading}
        style={{
          padding: '10px 16px',
          fontSize: 14,
          cursor: loading ? 'wait' : 'pointer',
          borderRadius: 6,
          border: '1px solid #ccc',
          background: loading ? '#e2e8f0' : '#fff',
        }}
      >
        {loading ? 'Running…' : 'Run archive now'}
      </button>
      {result && (
        <pre
          style={{
            marginTop: 20,
            fontSize: 12,
            lineHeight: 1.5,
            padding: 16,
            background: '#f1f5f9',
            borderRadius: 8,
            overflow: 'auto',
          }}
        >
          {result}
        </pre>
      )}
    </div>
  );
}
