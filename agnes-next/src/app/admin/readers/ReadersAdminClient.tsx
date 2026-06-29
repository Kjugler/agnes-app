'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  READER_SOURCES,
  READER_STATUSES,
  READER_TYPES,
  type ReaderRow,
} from '@/config/readerSources';

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  fontSize: 14,
  background: '#fff',
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 6,
  border: 'none',
  background: '#2563eb',
  color: '#fff',
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  ...btnPrimary,
  background: '#f1f5f9',
  color: '#0f172a',
  border: '1px solid #cbd5e1',
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

type AddReaderForm = {
  firstName: string;
  lastName: string;
  email: string;
  source: string;
  readerType: string;
  notes: string;
};

const emptyForm: AddReaderForm = {
  firstName: '',
  lastName: '',
  email: '',
  source: '',
  readerType: 'interested',
  notes: '',
};

export default function ReadersAdminClient() {
  const [q, setQ] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [readers, setReaders] = useState<ReaderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<AddReaderForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (sourceFilter !== 'all') params.set('source', sourceFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/admin/readers?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErr(json.error || `HTTP ${res.status}`);
        setReaders([]);
        return;
      }
      setReaders(json.readers || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
      setReaders([]);
    } finally {
      setLoading(false);
    }
  }, [q, sourceFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email.trim()) {
      setSaveMessage('Email is required.');
      return;
    }
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/admin/readers', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setSaveMessage(json.error || 'Save failed');
        return;
      }
      setSaveMessage(json.message || 'Reader saved.');
      setForm(emptyForm);
      await load();
      window.setTimeout(() => {
        setShowAdd(false);
        setSaveMessage(null);
      }, 1200);
    } catch {
      setSaveMessage('Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          Search
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, email, source, notes…"
            style={{ ...inputStyle, minWidth: 220 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          Source
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            style={inputStyle}
          >
            <option value="all">All sources</option>
            {READER_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={inputStyle}
          >
            <option value="all">All statuses</option>
            {READER_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={load} style={{ ...btnSecondary, marginTop: 18 }}>
          Refresh
        </button>
        <button type="button" onClick={() => setShowAdd(true)} style={{ ...btnPrimary, marginTop: 18 }}>
          Add Reader
        </button>
      </div>

      {err && (
        <p style={{ color: '#b91c1c', fontSize: 14, marginBottom: 12 }}>
          {err === 'unauthorized' ? (
            <>
              Not signed in.{' '}
              <Link href="/admin/fulfillment/auth?redirect=/admin/readers" style={{ color: '#2563eb' }}>
                Fulfillment auth
              </Link>
            </>
          ) : (
            err
          )}
        </p>
      )}

      {loading ? (
        <p style={{ color: '#64748b', fontSize: 14 }}>Loading readers…</p>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 14,
              background: '#fff',
            }}
          >
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px', fontWeight: 600 }}>Name</th>
                <th style={{ padding: '10px 12px', fontWeight: 600 }}>Email</th>
                <th style={{ padding: '10px 12px', fontWeight: 600 }}>Source</th>
                <th style={{ padding: '10px 12px', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '10px 12px', fontWeight: 600 }}>Referral Code</th>
                <th style={{ padding: '10px 12px', fontWeight: 600 }}>Date Added</th>
                <th style={{ padding: '10px 12px', fontWeight: 600 }}>Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {readers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 16, color: '#64748b' }}>
                    No readers yet. Add your first reader to start building the CRM.
                  </td>
                </tr>
              ) : (
                readers.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <Link href={`/admin/readers/${r.id}`} style={{ color: '#2563eb', fontWeight: 500 }}>
                        {r.name || '—'}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 12px', wordBreak: 'break-all' }}>{r.email}</td>
                    <td style={{ padding: '10px 12px' }}>{r.source || '—'}</td>
                    <td style={{ padding: '10px 12px' }}>{r.statusLabel}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 13 }}>
                      {r.referralCode}
                    </td>
                    <td style={{ padding: '10px 12px' }}>{formatDate(r.dateAdded)}</td>
                    <td style={{ padding: '10px 12px' }}>{formatDate(r.lastActivity)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '48px 16px',
            overflowY: 'auto',
          }}
          onClick={() => !saving && setShowAdd(false)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 8,
              padding: 24,
              width: '100%',
              maxWidth: 480,
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700 }}>Add Reader</h2>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 13 }}>
                First Name
                <input
                  type="text"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  style={{ ...inputStyle, width: '100%', marginTop: 4, boxSizing: 'border-box' }}
                />
              </label>
              <label style={{ fontSize: 13 }}>
                Last Name
                <input
                  type="text"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  style={{ ...inputStyle, width: '100%', marginTop: 4, boxSizing: 'border-box' }}
                />
              </label>
              <label style={{ fontSize: 13 }}>
                Email Address *
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  style={{ ...inputStyle, width: '100%', marginTop: 4, boxSizing: 'border-box' }}
                />
              </label>
              <label style={{ fontSize: 13 }}>
                Reader Source
                <select
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  style={{ ...inputStyle, width: '100%', marginTop: 4, boxSizing: 'border-box' }}
                >
                  <option value="">Select source…</option>
                  {READER_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 13 }}>
                Reader Type
                <select
                  value={form.readerType}
                  onChange={(e) => setForm({ ...form, readerType: e.target.value })}
                  style={{ ...inputStyle, width: '100%', marginTop: 4, boxSizing: 'border-box' }}
                >
                  {READER_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 13 }}>
                Notes
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={4}
                  placeholder="Jordan Landing, Christian Cole, met at Barnes & Noble…"
                  style={{
                    ...inputStyle,
                    width: '100%',
                    marginTop: 4,
                    boxSizing: 'border-box',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                />
              </label>
              {saveMessage && (
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: saveMessage.includes('success') ? '#059669' : '#b91c1c',
                  }}
                >
                  {saveMessage}
                </p>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" style={btnSecondary} disabled={saving} onClick={() => setShowAdd(false)}>
                  Cancel
                </button>
                <button type="submit" style={btnPrimary} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
