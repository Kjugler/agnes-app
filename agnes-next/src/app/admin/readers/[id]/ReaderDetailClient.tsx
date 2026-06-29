'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { ReaderDetail } from '@/config/readerSources';

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

const sectionStyle: React.CSSProperties = {
  marginBottom: 24,
  padding: 16,
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  background: '#fff',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#64748b',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
};

const placeholderSection: React.CSSProperties = {
  ...sectionStyle,
  background: '#f8fafc',
  color: '#94a3b8',
  fontSize: 14,
};

async function copyText(text: string, setFeedback: (msg: string) => void) {
  try {
    await navigator.clipboard.writeText(text);
    setFeedback('Copied');
    window.setTimeout(() => setFeedback(''), 2000);
  } catch {
    setFeedback('Copy failed');
  }
}

function CopyRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const [feedback, setFeedback] = useState('');
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <code
          style={{
            flex: 1,
            minWidth: 0,
            wordBreak: 'break-all',
            fontSize: 13,
            background: '#f1f5f9',
            padding: '8px 10px',
            borderRadius: 6,
          }}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={() => copyText(value, setFeedback)}
          style={{
            padding: '6px 12px',
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 6,
            border: '1px solid #cbd5e1',
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          Copy
        </button>
        {feedback && <span style={{ fontSize: 12, color: '#059669' }}>{feedback}</span>}
      </div>
    </div>
  );
}

export default function ReaderDetailClient({ readerId }: { readerId: string }) {
  const [reader, setReader] = useState<ReaderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/readers/${encodeURIComponent(readerId)}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErr(json.error || 'Not found');
        setReader(null);
        return;
      }
      setReader(json.reader);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [readerId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <p style={{ color: '#64748b', fontSize: 14 }}>Loading reader…</p>;
  }

  if (err || !reader) {
    return (
      <p style={{ color: '#b91c1c', fontSize: 14 }}>
        {err || 'Reader not found'}.{' '}
        <Link href="/admin/readers" style={{ color: '#2563eb' }}>
          Back to list
        </Link>
      </p>
    );
  }

  return (
    <div>
      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Reader information</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div>
            <div style={labelStyle}>Name</div>
            <div>{reader.name || '—'}</div>
          </div>
          <div>
            <div style={labelStyle}>Email</div>
            <div style={{ wordBreak: 'break-all' }}>{reader.email}</div>
          </div>
          <div>
            <div style={labelStyle}>Source</div>
            <div>{reader.source || '—'}</div>
          </div>
          <div>
            <div style={labelStyle}>Reader Type</div>
            <div>{reader.readerTypeLabel || '—'}</div>
          </div>
          <div>
            <div style={labelStyle}>Status</div>
            <div>{reader.statusLabel}</div>
          </div>
          <div>
            <div style={labelStyle}>Date Added</div>
            <div>{formatDateTime(reader.dateAdded)}</div>
          </div>
          <div>
            <div style={labelStyle}>Last Activity</div>
            <div>{formatDateTime(reader.lastActivity)}</div>
          </div>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Sharing links</h2>
        <div style={{ marginBottom: 12 }}>
          <div style={labelStyle}>Referral Code</div>
          <div style={{ fontFamily: 'monospace', fontSize: 15 }}>{reader.referralCode}</div>
        </div>
        <CopyRow label="Text-a-Friend URL" value={reader.textAFriendUrl} />
        <CopyRow label="Sample Chapters URL" value={reader.sampleChaptersUrl} />
      </section>

      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>Notes</h2>
        {reader.notes ? (
          <pre
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              fontSize: 14,
              lineHeight: 1.5,
              color: '#334155',
            }}
          >
            {reader.notes}
          </pre>
        ) : (
          <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>No notes yet.</p>
        )}
      </section>

      <section style={placeholderSection}>
        <h2 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600, color: '#64748b' }}>Purchases</h2>
        <p style={{ margin: 0 }}>Coming in a future phase.</p>
      </section>
      <section style={placeholderSection}>
        <h2 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600, color: '#64748b' }}>Reviews</h2>
        <p style={{ margin: 0 }}>Coming in a future phase.</p>
      </section>
      <section style={placeholderSection}>
        <h2 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600, color: '#64748b' }}>Referrals</h2>
        <p style={{ margin: 0 }}>Coming in a future phase.</p>
      </section>
      <section style={placeholderSection}>
        <h2 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600, color: '#64748b' }}>Campaign History</h2>
        <p style={{ margin: 0 }}>Coming in a future phase.</p>
      </section>
    </div>
  );
}
