'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  READER_SOURCES,
  SMS_CONSENT_SOURCES,
  formatReaderEmailDisplay,
  formatReaderPhoneDisplay,
  formatSmsConsentSummary,
  type ReaderDetail,
} from '@/config/readerSources';
import { hasMeaningfulReaderIdentifier, validateReaderEmail } from '@/lib/readerValidation';

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  fontSize: 14,
  background: '#fff',
  width: '100%',
  boxSizing: 'border-box',
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

const btnDanger: React.CSSProperties = {
  ...btnPrimary,
  background: '#fff',
  color: '#b91c1c',
  border: '1px solid #fecaca',
};

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

type EditForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  source: string;
  notes: string;
  smsConsentGranted: boolean;
  smsConsentSource: string;
  smsConsentNotes: string;
  mailingStreet: string;
  mailingCity: string;
  mailingState: string;
  mailingZip: string;
  mailingCountry: string;
};

function readerToForm(reader: ReaderDetail): EditForm {
  const mail = reader.mailingAddress;
  return {
    firstName: reader.firstName || '',
    lastName: reader.lastName || '',
    email: reader.hasRealEmail ? reader.displayEmail || reader.email || '' : '',
    phone: reader.phone || '',
    source: reader.source || '',
    notes: reader.notes || '',
    smsConsentGranted: reader.smsConsentGranted,
    smsConsentSource: reader.smsConsentSource || '',
    smsConsentNotes: reader.smsConsentNotes || '',
    mailingStreet: mail?.street || '',
    mailingCity: mail?.city || '',
    mailingState: mail?.state || '',
    mailingZip: mail?.zip || '',
    mailingCountry: mail?.country || '',
  };
}

async function copyText(text: string, setFeedback: (msg: string) => void) {
  try {
    await navigator.clipboard.writeText(text);
    setFeedback('Copied');
    window.setTimeout(() => setFeedback(''), 2000);
  } catch {
    setFeedback('Copy failed');
  }
}

function CopyRow({ label, value }: { label: string; value: string }) {
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
        <button type="button" onClick={() => copyText(value, setFeedback)} style={btnSecondary}>
          Copy
        </button>
        {feedback && <span style={{ fontSize: 12, color: '#059669' }}>{feedback}</span>}
      </div>
    </div>
  );
}

export default function ReaderDetailClient({ readerId }: { readerId: string }) {
  const searchParams = useSearchParams();
  const startInEdit = searchParams.get('edit') === '1';

  const [reader, setReader] = useState<ReaderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);

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

  useEffect(() => {
    if (startInEdit && reader && !editing) {
      setForm(readerToForm(reader));
      setEditing(true);
    }
  }, [startInEdit, reader, editing]);

  const beginEdit = useCallback(() => {
    if (!reader) return;
    setForm(readerToForm(reader));
    setSaveMessage(null);
    setEditing(true);
  }, [reader]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setForm(null);
    setSaveMessage(null);
  }, []);

  const hasMailingAddress = Boolean(reader?.mailingAddress);

  const validateForm = useCallback((): string | null => {
    if (!form || !reader) return 'Nothing to save.';

    if (!hasMeaningfulReaderIdentifier(form)) {
      return 'Provide email, phone number, or name plus notes (at least 3 characters).';
    }

    const emailCheck = validateReaderEmail(form.email, {
      hadRealEmail: reader.hasRealEmail,
      hasPhone: form.phone.replace(/\D/g, '').length >= 10,
      hasNameAndNotes:
        Boolean(form.firstName.trim() || form.lastName.trim()) && form.notes.trim().length >= 3,
    });
    if (!emailCheck.ok) return emailCheck.error;

    if (form.smsConsentGranted && form.phone.replace(/\D/g, '').length < 10) {
      return 'SMS consent requires a valid phone number.';
    }
    if (form.smsConsentGranted && !form.smsConsentSource.trim()) {
      return 'Select how SMS consent was obtained.';
    }

    return null;
  }, [form, reader]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !reader) return;

    const validationError = validateForm();
    if (validationError) {
      setSaveMessage(validationError);
      return;
    }

    setSaving(true);
    setSaveMessage(null);

    const payload: Record<string, unknown> = {
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      source: form.source,
      notes: form.notes,
      smsConsentGranted: form.smsConsentGranted,
      smsConsentSource: form.smsConsentGranted ? form.smsConsentSource : '',
      smsConsentNotes: form.smsConsentGranted ? form.smsConsentNotes : '',
    };

    if (hasMailingAddress) {
      payload.mailingAddress = {
        street: form.mailingStreet,
        city: form.mailingCity,
        state: form.mailingState,
        zip: form.mailingZip,
        country: form.mailingCountry,
      };
    }

    try {
      const res = await fetch(`/api/admin/readers/${encodeURIComponent(readerId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setSaveMessage(json.error || 'Save failed');
        return;
      }
      setReader(json.reader);
      setSaveMessage(json.message || 'Reader updated.');
      setEditing(false);
      setForm(null);
    } catch {
      setSaveMessage('Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    setArchiving(true);
    setSaveMessage(null);
    try {
      const res = await fetch(`/api/admin/readers/${encodeURIComponent(readerId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archive: true }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setSaveMessage(json.error || 'Archive failed');
        return;
      }
      setReader(json.reader);
      setShowArchiveConfirm(false);
      setEditing(false);
      setForm(null);
      setSaveMessage(json.message || 'Reader archived.');
    } catch {
      setSaveMessage('Archive failed. Please try again.');
    } finally {
      setArchiving(false);
    }
  };

  const handleRestore = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch(`/api/admin/readers/${encodeURIComponent(readerId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restore: true }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setSaveMessage(json.error || 'Restore failed');
        return;
      }
      setReader(json.reader);
      setSaveMessage(json.message || 'Reader restored.');
    } catch {
      setSaveMessage('Restore failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const isArchived = reader?.status === 'archived';

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
      {isArchived && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            borderRadius: 8,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            fontSize: 14,
          }}
        >
          This reader is archived and hidden from the main list. Referral codes and purchase history
          are preserved.
        </div>
      )}

      {reader && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {editing ? (
            <>
              <button type="submit" form="reader-edit-form" style={btnPrimary} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" style={btnSecondary} disabled={saving} onClick={cancelEdit}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" style={btnPrimary} onClick={beginEdit}>
                Edit
              </button>
              {isArchived ? (
                <button type="button" style={btnSecondary} disabled={saving} onClick={handleRestore}>
                  Restore Reader
                </button>
              ) : (
                <button type="button" style={btnDanger} onClick={() => setShowArchiveConfirm(true)}>
                  Archive Reader
                </button>
              )}
            </>
          )}
        </div>
      )}

      {saveMessage && !editing && (
        <p
          style={{
            margin: '0 0 16px',
            fontSize: 14,
            color: saveMessage.toLowerCase().includes('fail') ? '#b91c1c' : '#059669',
          }}
        >
          {saveMessage}
        </p>
      )}

      {editing && form ? (
        <form id="reader-edit-form" onSubmit={handleSave}>
          <section style={sectionStyle}>
            <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Edit reader</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 13 }}>
                First Name
                <input
                  type="text"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  style={{ ...inputStyle, marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 13 }}>
                Last Name
                <input
                  type="text"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  style={{ ...inputStyle, marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 13 }}>
                Email Address
                {!reader.hasRealEmail && (
                  <span style={{ fontWeight: 400, color: '#64748b' }}> (optional if phone on file)</span>
                )}
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder={reader.hasRealEmail ? '' : 'Add a real email address…'}
                  style={{ ...inputStyle, marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 13 }}>
                Phone Number
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="(555) 123-4567"
                  style={{ ...inputStyle, marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 13 }}>
                Reader Source
                <select
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  style={{ ...inputStyle, marginTop: 4 }}
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
                Notes
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={6}
                  style={{ ...inputStyle, marginTop: 4, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </label>

              {hasMailingAddress && (
                <fieldset
                  style={{
                    margin: 0,
                    padding: 12,
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <legend style={{ fontSize: 13, fontWeight: 600, padding: '0 4px' }}>
                    Mailing Address
                  </legend>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input
                      type="text"
                      value={form.mailingStreet}
                      onChange={(e) => setForm({ ...form, mailingStreet: e.target.value })}
                      placeholder="Street"
                      style={inputStyle}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <input
                        type="text"
                        value={form.mailingCity}
                        onChange={(e) => setForm({ ...form, mailingCity: e.target.value })}
                        placeholder="City"
                        style={inputStyle}
                      />
                      <input
                        type="text"
                        value={form.mailingState}
                        onChange={(e) => setForm({ ...form, mailingState: e.target.value })}
                        placeholder="State"
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <input
                        type="text"
                        value={form.mailingZip}
                        onChange={(e) => setForm({ ...form, mailingZip: e.target.value })}
                        placeholder="ZIP"
                        style={inputStyle}
                      />
                      <input
                        type="text"
                        value={form.mailingCountry}
                        onChange={(e) => setForm({ ...form, mailingCountry: e.target.value })}
                        placeholder="Country"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </fieldset>
              )}

              <div
                style={{
                  padding: 12,
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                }}
              >
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={form.smsConsentGranted}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        smsConsentGranted: e.target.checked,
                        smsConsentSource: e.target.checked ? form.smsConsentSource : '',
                        smsConsentNotes: e.target.checked ? form.smsConsentNotes : '',
                      })
                    }
                    style={{ marginTop: 3 }}
                  />
                  <span>Gave permission to receive a text about The Agnes Protocol</span>
                </label>
                {form.smsConsentGranted && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <label style={{ fontSize: 13 }}>
                      Consent source *
                      <select
                        value={form.smsConsentSource}
                        onChange={(e) => setForm({ ...form, smsConsentSource: e.target.value })}
                        style={{ ...inputStyle, marginTop: 4 }}
                      >
                        <option value="">Select source…</option>
                        {SMS_CONSENT_SOURCES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ fontSize: 13 }}>
                      Consent notes
                      <input
                        type="text"
                        value={form.smsConsentNotes}
                        onChange={(e) => setForm({ ...form, smsConsentNotes: e.target.value })}
                        style={{ ...inputStyle, marginTop: 4 }}
                      />
                    </label>
                  </div>
                )}
              </div>

              {saveMessage && (
                <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{saveMessage}</p>
              )}
            </div>
          </section>
        </form>
      ) : (
        <>
          <section style={sectionStyle}>
            <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Reader information</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 16,
              }}
            >
              <div>
                <div style={labelStyle}>Name</div>
                <div>{reader.name || '—'}</div>
              </div>
              <div>
                <div style={labelStyle}>Email</div>
                <div style={{ wordBreak: 'break-all' }}>{formatReaderEmailDisplay(reader)}</div>
              </div>
              <div>
                <div style={labelStyle}>Phone</div>
                <div>{formatReaderPhoneDisplay(reader.phone)}</div>
              </div>
              <div>
                <div style={labelStyle}>SMS Consent</div>
                <div>{formatSmsConsentSummary(reader)}</div>
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
                <div style={labelStyle}>Last Updated</div>
                <div>{formatDateTime(reader.lastUpdated)}</div>
              </div>
              <div>
                <div style={labelStyle}>Last Activity</div>
                <div>{formatDateTime(reader.lastActivity)}</div>
              </div>
            </div>
            {reader.mailingAddress && (
              <div style={{ marginTop: 16 }}>
                <div style={labelStyle}>Mailing Address</div>
                <div style={{ fontSize: 14, lineHeight: 1.5 }}>{reader.mailingAddress.formatted}</div>
              </div>
            )}
          </section>

          <section style={sectionStyle}>
            <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Sharing links</h2>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>
              Referral code is read-only — it stays tied to this reader&apos;s purchase and referral
              history.
            </p>
            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>Referral Code</div>
              <div style={{ fontFamily: 'monospace', fontSize: 15 }}>{reader.referralCode}</div>
            </div>
            <CopyRow label="Text-a-Friend Link" value={reader.textAFriendUrl} />
            <CopyRow label="Sample Chapters URL" value={reader.sampleChaptersUrl} />
          </section>

          {reader.smsConsentGranted && (
            <section style={sectionStyle}>
              <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>SMS consent</h2>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 16,
                }}
              >
                <div>
                  <div style={labelStyle}>Source</div>
                  <div>{reader.smsConsentSource || '—'}</div>
                </div>
                <div>
                  <div style={labelStyle}>Recorded</div>
                  <div>{formatDateTime(reader.smsConsentAt)}</div>
                </div>
              </div>
              {reader.smsConsentNotes ? (
                <p style={{ margin: '12px 0 0', fontSize: 14, color: '#334155', lineHeight: 1.5 }}>
                  {reader.smsConsentNotes}
                </p>
              ) : null}
            </section>
          )}

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
        </>
      )}

      {!editing && (
        <>
          <section style={placeholderSection}>
            <h2 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600, color: '#64748b' }}>
              Purchases
            </h2>
            <p style={{ margin: 0 }}>
              Purchase history stays attached to this reader and is not changed when you edit contact
              info.
            </p>
          </section>
          <section style={placeholderSection}>
            <h2 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600, color: '#64748b' }}>
              Reviews
            </h2>
            <p style={{ margin: 0 }}>Coming in a future phase.</p>
          </section>
          <section style={placeholderSection}>
            <h2 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600, color: '#64748b' }}>
              Referrals
            </h2>
            <p style={{ margin: 0 }}>Coming in a future phase.</p>
          </section>
          <section style={placeholderSection}>
            <h2 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600, color: '#64748b' }}>
              Campaign History
            </h2>
            <p style={{ margin: 0 }}>Coming in a future phase.</p>
          </section>
        </>
      )}

      {showArchiveConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => !archiving && setShowArchiveConfirm(false)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 8,
              padding: 24,
              maxWidth: 440,
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700 }}>Archive this reader?</h2>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: '#475569', lineHeight: 1.5 }}>
              This hides the reader from your main list. Their referral code, purchases, and email
              history are <strong>not</strong> deleted — you can restore them anytime.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                style={btnSecondary}
                disabled={archiving}
                onClick={() => setShowArchiveConfirm(false)}
              >
                Cancel
              </button>
              <button type="button" style={btnDanger} disabled={archiving} onClick={handleArchive}>
                {archiving ? 'Archiving…' : 'Archive Reader'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
