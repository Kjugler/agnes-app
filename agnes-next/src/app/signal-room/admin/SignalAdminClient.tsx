'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';

const SIGNAL_TYPES = ['ARCHIVE', 'LOCATION', 'VISUAL', 'NARRATIVE', 'PLAYER_QUESTION', 'PODCASTER_PROMPT', 'SPECULATIVE'] as const;
const MEDIA_TYPES = ['image', 'video', 'map', 'document', 'audio', 'none'] as const;

const HELD_REASON_LABEL: Record<string, string> = {
  LINK: 'Link in text',
  PROFANITY: 'Language flagged',
  MEDIA_UPLOAD: 'Uploaded video (moderation queue)',
  HARASSMENT: 'Harassment',
  HATE: 'Hate content',
  CLAIM: 'Claim / promo',
  OTHER: 'Other',
};

type SignalRow = {
  id: string;
  text: string;
  title: string | null;
  type: string | null;
  content: string | null;
  mediaType: string | null;
  mediaUrl: string | null;
  locationTag: string | null;
  locationName: string | null;
  tags?: string[] | null;
  discussionEnabled: boolean;
  publishStatus: string | null;
  publishAt: string | null;
  author: string | null;
  createdAt: string;
  status?: string;
  heldReason?: string | null;
  heldAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  isSystem?: boolean;
  user?: { email: string | null; firstName: string | null } | null;
  _count?: { comments: number; replies: number };
};

function isPublishedInFeed(s: SignalRow): boolean {
  const pub = s.publishStatus;
  return pub === 'PUBLISHED' || pub == null;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

async function postModeration(
  path: string,
  id: string,
  headers: Record<string, string>
): Promise<void> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ id }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
}

const adminMutedBtn: React.CSSProperties = {
  padding: '0.25rem 0.55rem',
  fontSize: '0.85em',
  backgroundColor: '#1a1f3a',
  color: '#e0e0e0',
  border: '1px solid #2a3a4a',
  borderRadius: 4,
  cursor: 'pointer',
};

const adminPrimaryBtn: React.CSSProperties = {
  padding: '0.25rem 0.55rem',
  fontSize: '0.85em',
  backgroundColor: '#00ffe0',
  color: '#000',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 600,
};

const adminWarnBtn: React.CSSProperties = {
  padding: '0.25rem 0.55rem',
  fontSize: '0.85em',
  backgroundColor: '#422006',
  color: '#fcd34d',
  border: '1px solid #78350f',
  borderRadius: 4,
  cursor: 'pointer',
};

const adminDangerBtn: React.CSSProperties = {
  padding: '0.25rem 0.55rem',
  fontSize: '0.85em',
  backgroundColor: '#4a1a1a',
  color: '#ff6b6b',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
};

function getAdminHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const key = sessionStorage.getItem('admin_key');
  if (key) return { 'x-admin-key': key };
  return {};
}

type AdminTab = 'all' | 'queue' | 'live' | 'hidden' | 'rejected';

export default function SignalAdminClient() {
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminKey, setAdminKey] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('queue');
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/signals', { headers: getAdminHeaders() });
      if (res.status === 403) {
        setError('Admin access required. Enter ADMIN_KEY in production.');
        setSignals([]);
        return;
      }
      const data = await res.json();
      if (data.ok) setSignals(data.signals);
      else setError(data.error || 'Failed to load');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAdminKey(sessionStorage.getItem('admin_key') || '');
    }
    fetchSignals();
  }, [fetchSignals]);

  const sortedSignals = useMemo(() => {
    const list = [...signals];
    list.sort((a, b) => {
      const rank = (s: SignalRow) => {
        if (s.status === 'HELD') return 0;
        if (s.status === 'REJECTED') return 2;
        return 1;
      };
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return list;
  }, [signals]);

  const filteredSignals = useMemo(() => {
    return sortedSignals.filter((s) => {
      if (activeTab === 'all') return true;
      if (activeTab === 'queue') return s.status === 'HELD';
      if (activeTab === 'rejected') return s.status === 'REJECTED';
      if (activeTab === 'hidden') return s.status === 'APPROVED' && s.publishStatus === 'DRAFT';
      if (activeTab === 'live') {
        return s.status === 'APPROVED' && isPublishedInFeed(s);
      }
      return true;
    });
  }, [sortedSignals, activeTab]);

  const queueCount = useMemo(() => signals.filter((s) => s.status === 'HELD').length, [signals]);

  const saveAdminKey = () => {
    sessionStorage.setItem('admin_key', adminKey);
    fetchSignals();
  };

  if (loading && signals.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        Loading signals…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <Link href="/signal-room" style={{ color: '#00ffe0', fontSize: '0.9em', marginRight: '1rem' }}>
            ← Signal Room
          </Link>
          <h1 style={{ fontSize: '1.5rem', color: '#00ffe0', display: 'inline' }}>Admin: Signals</h1>
        </div>
        <button
          type="button"
          onClick={() => { setShowCreate(true); setEditingId(null); }}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#00ffe0',
            color: '#000',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Create Signal
        </button>
      </div>

      {process.env.NODE_ENV !== 'development' && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#1a1f3a', borderRadius: 6 }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9em' }}>
            Admin Key (set ADMIN_KEY in env):
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="Enter admin key"
              style={{
                flex: 1,
                padding: '0.5rem',
                backgroundColor: '#0a0e27',
                border: '1px solid #2a3a4a',
                borderRadius: 4,
                color: '#e0e0e0',
              }}
            />
            <button
              type="button"
              onClick={saveAdminKey}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#00ffe0',
                color: '#000',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: '0.75rem', backgroundColor: '#4a1a1a', color: '#ff6b6b', borderRadius: 6, marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <p style={{ fontSize: '0.88rem', color: '#9ca3af', marginBottom: '0.75rem', maxWidth: 720 }}>
        <strong style={{ color: '#e5e7eb' }}>Moderation</strong> — Approve publishes held posts to the feed. Reject blocks them from appearing.
        Unpublish hides a live post without deleting it. Delete removes the row permanently.
      </p>

      <div
        style={{
          marginBottom: '1.25rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          alignItems: 'center',
        }}
      >
        {(
          [
            ['queue', `Queue (${queueCount})`],
            ['all', 'All'],
            ['live', 'Live in feed'],
            ['hidden', 'Unpublished'],
            ['rejected', 'Rejected'],
          ] as const
        ).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.35rem 0.75rem',
              fontSize: '0.85em',
              borderRadius: 6,
              border: activeTab === tab ? '1px solid #00ffe0' : '1px solid #2a3a4a',
              backgroundColor: activeTab === tab ? '#0d3d38' : '#14192e',
              color: activeTab === tab ? '#00ffe0' : '#ccc',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {showCreate && (
        <SignalForm
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); fetchSignals(); }}
          headers={getAdminHeaders()}
        />
      )}

      {editingId && (
        <SignalForm
          signalId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => { setEditingId(null); fetchSignals(); }}
          headers={getAdminHeaders()}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {filteredSignals.length === 0 && (
          <div style={{ padding: '1.5rem', color: '#888', textAlign: 'center', border: '1px dashed #2a3a4a', borderRadius: 8 }}>
            No signals in this filter.
          </div>
        )}
        {filteredSignals.map((s) => {
          const status = s.status || 'APPROVED';
          const heldLabel = s.heldReason ? HELD_REASON_LABEL[s.heldReason] || s.heldReason : null;
          const hdrs = getAdminHeaders();
          const busy = (k: string) => actionBusy === `${s.id}:${k}`;
          const run = async (key: string, fn: () => Promise<void>) => {
            setActionBusy(`${s.id}:${key}`);
            setError(null);
            try {
              await fn();
              await fetchSignals();
            } catch (e) {
              setError(String(e));
            } finally {
              setActionBusy(null);
            }
          };
          const publicLive = status === 'APPROVED' && isPublishedInFeed(s);
          const isHiddenApproved = status === 'APPROVED' && s.publishStatus === 'DRAFT';

          return (
            <div
              key={s.id}
              style={{
                padding: '1rem',
                backgroundColor: status === 'HELD' ? '#1a1520' : '#14192e',
                border:
                  status === 'HELD'
                    ? '1px solid #5c4a1a'
                    : status === 'REJECTED'
                      ? '1px solid #4a2a2a'
                      : '1px solid #1a1f3a',
                borderRadius: 6,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontWeight: 600, color: '#fff', marginBottom: '0.35rem', lineHeight: 1.35 }}>
                    {s.title || (s.text.length > 120 ? `${s.text.slice(0, 120)}…` : s.text)}
                  </div>
                  <div
                    style={{
                      fontFamily: 'ui-monospace, monospace',
                      fontSize: '0.78rem',
                      color: '#a78bfa',
                      marginBottom: '0.35rem',
                      wordBreak: 'break-all',
                    }}
                  >
                    id: {s.id}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#9ca3af', lineHeight: 1.5 }}>
                    <div>
                      <span style={{ color: '#d1d5db' }}>Submitted:</span> {formatWhen(s.createdAt)}
                    </div>
                    <div>
                      <span style={{ color: '#d1d5db' }}>Status:</span>{' '}
                      <span style={{ color: status === 'HELD' ? '#fbbf24' : status === 'REJECTED' ? '#f87171' : '#34d399' }}>
                        {status}
                      </span>
                      {s.isSystem ? ' • system' : ''}
                      {s.user?.email ? ` • ${s.user.firstName || ''} ${s.user.email}`.trim() : ''}
                    </div>
                    {heldLabel && (
                      <div>
                        <span style={{ color: '#d1d5db' }}>Hold reason:</span> {heldLabel}
                        {s.heldAt && <span> (queued {formatWhen(s.heldAt)})</span>}
                      </div>
                    )}
                    {status === 'APPROVED' && s.approvedAt && (
                      <div>
                        <span style={{ color: '#d1d5db' }}>Approved:</span> {formatWhen(s.approvedAt)}
                      </div>
                    )}
                    {status === 'REJECTED' && s.rejectedAt && (
                      <div>
                        <span style={{ color: '#d1d5db' }}>Rejected:</span> {formatWhen(s.rejectedAt)}
                      </div>
                    )}
                    <div>
                      <span style={{ color: '#d1d5db' }}>Feed:</span>{' '}
                      {publicLive ? 'visible' : isHiddenApproved ? 'unpublished (draft)' : 'not public'}
                      {' · '}
                      <span style={{ color: '#d1d5db' }}>Publish:</span> {s.publishStatus || 'PUBLISHED'}
                    </div>
                    <div style={{ color: '#6b7280' }}>
                      {s.type || 'NARRATIVE'}
                      {s.discussionEnabled ? ' · discussion on' : ' · discussion off'}
                      {s._count != null ? ` · ${s._count.comments} comments · ${s._count.replies} replies` : ''}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {publicLive && (
                  <Link
                    href={`/signal-room/${s.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#00ffe0', fontSize: '0.85em', padding: '0.25rem 0.5rem' }}
                  >
                    Open public page
                  </Link>
                )}
                {!publicLive && status === 'APPROVED' && (
                  <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>No public URL (not in feed)</span>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setEditingId(s.id);
                    setShowCreate(false);
                  }}
                  style={adminMutedBtn}
                >
                  Edit
                </button>

                {status === 'HELD' && (
                  <>
                    <button
                      type="button"
                      disabled={busy('ap')}
                      onClick={() =>
                        run('ap', () => postModeration('/api/admin/moderation/approve-signal', s.id, hdrs))
                      }
                      style={adminPrimaryBtn}
                    >
                      {busy('ap') ? '…' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      disabled={busy('rj')}
                      onClick={() => {
                        if (!confirm('Reject this signal? It will not appear publicly.')) return;
                        run('rj', () => postModeration('/api/admin/moderation/reject-signal', s.id, hdrs));
                      }}
                      style={adminWarnBtn}
                    >
                      {busy('rj') ? '…' : 'Reject / remove'}
                    </button>
                  </>
                )}

                {publicLive && (
                  <button
                    type="button"
                    disabled={busy('un')}
                    onClick={() => {
                      if (!confirm('Unpublish? Post will disappear from the feed (not deleted).')) return;
                      run('un', () => postModeration('/api/admin/moderation/unpublish-signal', s.id, hdrs));
                    }}
                    style={adminWarnBtn}
                  >
                    {busy('un') ? '…' : 'Unpublish / hide'}
                  </button>
                )}

                {isHiddenApproved && (
                  <button
                    type="button"
                    disabled={busy('rp')}
                    onClick={() => run('rp', () => postModeration('/api/admin/moderation/republish-signal', s.id, hdrs))}
                    style={adminPrimaryBtn}
                  >
                    {busy('rp') ? '…' : 'Republish'}
                  </button>
                )}

                {status === 'REJECTED' && (
                  <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Rejected — use Delete to purge</span>
                )}

                <button
                  type="button"
                  disabled={busy('del')}
                  onClick={async () => {
                    if (!confirm('Permanently delete this signal? This cannot be undone.')) return;
                    setActionBusy(`${s.id}:del`);
                    setError(null);
                    try {
                      const res = await fetch(`/api/admin/signals/${s.id}`, { method: 'DELETE', headers: hdrs });
                      if (!res.ok) {
                        const d = await res.json().catch(() => ({}));
                        throw new Error((d as { error?: string }).error || res.statusText);
                      }
                      await fetchSignals();
                    } catch (e) {
                      setError(String(e));
                    } finally {
                      setActionBusy(null);
                    }
                  }}
                  style={adminDangerBtn}
                >
                  {busy('del') ? '…' : 'Delete permanently'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type SignalFormProps = {
  signalId?: string;
  onClose: () => void;
  onSaved: () => void;
  headers: Record<string, string>;
};

function SignalForm({ signalId, onClose, onSaved, headers }: SignalFormProps) {
  const [loading, setLoading] = useState(!!signalId);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    text: '',
    title: '',
    type: 'NARRATIVE' as string,
    content: '',
    mediaType: 'image' as string,
    mediaUrl: '',
    locationTag: '',
    locationName: '',
    tags: '' as string,
    discussionEnabled: true,
    publishStatus: 'PUBLISHED' as string,
    publishAt: '',
    author: '',
  });

  useEffect(() => {
    if (!signalId) return;
    fetch(`/api/admin/signals/${signalId}`, { headers })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.signal) {
          const s = d.signal as SignalRow;
          setForm({
            text: s.text || '',
            title: s.title || '',
            type: s.type || 'NARRATIVE',
            content: s.content || '',
            mediaType: s.mediaType || 'image',
            mediaUrl: s.mediaUrl || '',
            locationTag: s.locationTag || '',
            locationName: s.locationName || '',
            tags: Array.isArray(s.tags) ? s.tags.join(', ') : '',
            discussionEnabled: s.discussionEnabled ?? true,
            publishStatus: s.publishStatus || 'PUBLISHED',
            publishAt: s.publishAt ? new Date(s.publishAt).toISOString().slice(0, 16) : '',
            author: s.author || '',
          });
        }
      })
      .finally(() => setLoading(false));
  }, [signalId, headers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const tags = form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
      const body = {
        ...form,
        tags,
        publishAt: form.publishAt ? new Date(form.publishAt).toISOString() : null,
      };
      const url = signalId ? `/api/admin/signals/${signalId}` : '/api/admin/signals';
      const method = signalId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        onSaved();
      } else {
        alert(data.error || 'Failed');
      }
    } catch (e) {
      alert(String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', backgroundColor: '#14192e', borderRadius: 8, marginBottom: '1rem' }}>
        Loading…
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: '1.5rem',
        backgroundColor: '#14192e',
        border: '1px solid #00ffe0',
        borderRadius: 8,
        marginBottom: '1.5rem',
      }}
    >
      <h2 style={{ color: '#00ffe0', marginBottom: '1rem' }}>{signalId ? 'Edit Signal' : 'Create Signal'}</h2>

      <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.85em', color: '#888', marginBottom: '0.25rem' }}>Text *</label>
          <input
            required
            value={form.text}
            onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
            style={inputStyle}
            placeholder="Required, min 3 chars"
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.85em', color: '#888', marginBottom: '0.25rem' }}>Title</label>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.85em', color: '#888', marginBottom: '0.25rem' }}>Type</label>
          <select
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            style={inputStyle}
          >
            {SIGNAL_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.85em', color: '#888', marginBottom: '0.25rem' }}>Content (narrative)</label>
          <textarea
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            style={{ ...inputStyle, minHeight: 80 }}
          />
        </div>
        <div
          style={{
            padding: '1rem',
            backgroundColor: '#0a0e27',
            border: '1px solid #2a3a4a',
            borderRadius: 6,
            marginTop: '0.5rem',
          }}
        >
          <div style={{ color: '#00ffe0', fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.95em' }}>
            Media (image, video, audio, map, document)
          </div>
          <div style={{ fontSize: '0.8em', color: '#888', marginBottom: '0.75rem' }}>
            Choose type, then paste a URL. For video: use a direct .mp4/.webm URL or a hosted link. Put files in{' '}
            <code style={{ color: '#00ffe0' }}>public/</code> and use paths like <code style={{ color: '#00ffe0' }}>/videos/clip.mp4</code>.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem', alignItems: 'start' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85em', color: '#888', marginBottom: '0.25rem' }}>
                Media Type
              </label>
              <select
                value={form.mediaType}
                onChange={(e) => setForm((f) => ({ ...f, mediaType: e.target.value }))}
                style={inputStyle}
              >
                {MEDIA_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85em', color: '#888', marginBottom: '0.25rem' }}>
                Media URL
              </label>
              <input
                value={form.mediaUrl}
                onChange={(e) => setForm((f) => ({ ...f, mediaUrl: e.target.value }))}
                style={inputStyle}
                placeholder={
                  form.mediaType === 'video'
                    ? '/videos/clip.mp4 or https://example.com/video.mp4'
                    : form.mediaType === 'image'
                      ? '/images/photo.jpg'
                      : form.mediaType === 'audio'
                        ? '/audio/clip.mp3'
                        : 'Path or full URL to media file'
                }
              />
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85em', color: '#888', marginBottom: '0.25rem' }}>Location Tag</label>
            <input
              value={form.locationTag}
              onChange={(e) => setForm((f) => ({ ...f, locationTag: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85em', color: '#888', marginBottom: '0.25rem' }}>Location Name</label>
            <input
              value={form.locationName}
              onChange={(e) => setForm((f) => ({ ...f, locationName: e.target.value }))}
              style={inputStyle}
            />
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.85em', color: '#888', marginBottom: '0.25rem' }}>Tags (comma-separated)</label>
          <input
            value={form.tags}
            onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
            style={inputStyle}
            placeholder="bangkok, explosion, warehouse"
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.85em', color: '#888', marginBottom: '0.25rem' }}>Author</label>
          <input
            value={form.author}
            onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
            style={inputStyle}
            placeholder="System"
          />
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.discussionEnabled}
              onChange={(e) => setForm((f) => ({ ...f, discussionEnabled: e.target.checked }))}
            />
            Discussion enabled
          </label>
          <div>
            <label style={{ display: 'block', fontSize: '0.85em', color: '#888', marginBottom: '0.25rem' }}>Publish Status</label>
            <select
              value={form.publishStatus}
              onChange={(e) => setForm((f) => ({ ...f, publishStatus: e.target.value }))}
              style={inputStyle}
            >
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85em', color: '#888', marginBottom: '0.25rem' }}>Schedule (publishAt)</label>
            <input
              type="datetime-local"
              value={form.publishAt}
              onChange={(e) => setForm((f) => ({ ...f, publishAt: e.target.value }))}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: '0.5rem 1.5rem',
            backgroundColor: '#00ffe0',
            color: '#000',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : signalId ? 'Update' : 'Create'}
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#1a1f3a',
            color: '#e0e0e0',
            border: '1px solid #2a3a4a',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem',
  backgroundColor: '#0a0e27',
  border: '1px solid #2a3a4a',
  borderRadius: 4,
  color: '#e0e0e0',
  fontSize: '0.95em',
};
