'use client';

import { FormEvent, useEffect, useMemo, useState, type CSSProperties, type ChangeEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const initialState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  x: '',
  instagram: '',
  tiktok: '',
  truth: '',
};

type FormState = typeof initialState;

type AssociatePayload = {
  associateId: string;
  name: string;
  code: string;
};

export default function ContestSignupPage() {
  const router = useRouter();
  const qp = useSearchParams();
  const from = qp.get('from') || '/contest';
  const [form, setForm] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem('associate');
      if (stored) {
        const parsed = JSON.parse(stored) as {
          name?: string;
          email?: string;
          code?: string;
          firstName?: string;
          lastName?: string;
          phone?: string;
          handles?: Record<string, string>;
        };
        if (parsed) {
          setForm((prev) => ({
            ...prev,
            firstName: parsed.firstName || parsed.name?.split(' ')[0] || prev.firstName,
            lastName:
              parsed.lastName || parsed.name?.split(' ').slice(1).join(' ') || prev.lastName,
            email: parsed.email || prev.email,
            phone: parsed.phone || prev.phone,
            x: parsed.handles?.x || prev.x,
            instagram: parsed.handles?.instagram || prev.instagram,
            tiktok: parsed.handles?.tiktok || prev.tiktok,
            truth: parsed.handles?.truth || prev.truth,
          }));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const canSubmit = useMemo(() => {
    return (
      form.firstName.trim().length > 0 &&
      form.lastName.trim().length > 0 &&
      /.+@.+/.test(form.email.trim())
    );
  }, [form]);

  const onChange = (key: keyof FormState) => (e: ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/associate/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          handles: {
            x: form.x,
            instagram: form.instagram,
            tiktok: form.tiktok,
            truth: form.truth,
          },
          source: 'contest-signup',
        }),
      });

      if (!res.ok) {
        throw new Error('Could not save. Please try again.');
      }

      const data = (await res.json()) as { ok: boolean } & AssociatePayload;
      if (!data.ok) {
        throw new Error('Save failed. Please try again.');
      }

      try {
        const associate = {
          id: data.associateId,
          name: data.name,
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          code: data.code,
          handles: {
            x: form.x,
            instagram: form.instagram,
            tiktok: form.tiktok,
            truth: form.truth,
          },
        };
        window.localStorage.setItem('associate', JSON.stringify(associate));
        window.localStorage.setItem('ap_code', data.code);
        window.localStorage.setItem('discount_code', data.code);
        window.localStorage.setItem('ref', data.code);
        window.localStorage.setItem('user_email', form.email);
      } catch (storageErr) {
        console.warn('associate storage failed', storageErr);
      }

      try {
        await fetch('/api/points/award', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'signup' }),
        });
      } catch (awardErr) {
        console.warn('signup award failed', awardErr);
      }

      setSuccessMessage('You are in! Redirecting to the Ascension deck…');
      setTimeout(() => {
        router.replace('/contest/ascension?joined=1');
      }, 600);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at top, #1e293b, #020617)',
        color: 'white',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '3rem 1.5rem',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: 520,
          background: 'rgba(15, 23, 42, 0.8)',
          borderRadius: 18,
          padding: '2.5rem',
          boxShadow: '0 25px 60px rgba(0,0,0,0.45)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(148, 163, 184, 0.2)',
        }}
      >
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>Enter the Contest</h1>
        <p style={{ marginBottom: '1.5rem', color: '#cbd5f5' }}>
          Join the crew, earn points, and unlock insider rewards.
        </p>

        <div style={{ display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>First Name</span>
              <input
                type="text"
                value={form.firstName}
                onChange={onChange('firstName')}
                required
                placeholder="Simona"
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Last Name</span>
              <input
                type="text"
                value={form.lastName}
                onChange={onChange('lastName')}
                required
                placeholder="Vernon"
                style={inputStyle}
              />
            </label>
          </div>

          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={onChange('email')}
              required
              placeholder="you@example.com"
              style={inputStyle}
            />
          </label>

          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Mobile Number</span>
            <input
              type="tel"
              value={form.phone}
              onChange={onChange('phone')}
              placeholder="(555) 867-5309"
              style={inputStyle}
            />
          </label>

          <div style={{
            marginTop: '0.5rem',
            padding: '1rem',
            borderRadius: 12,
            background: 'rgba(30, 41, 59, 0.6)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            display: 'grid',
            gap: '0.75rem',
          }}>
            <span style={{ fontWeight: 600, color: '#a5b4fc', letterSpacing: '0.02em' }}>
              Social Handles (optional)
            </span>
            <label style={{ display: 'grid', gap: '0.2rem' }}>
              <span>X / Twitter</span>
              <input
                type="text"
                value={form.x}
                onChange={onChange('x')}
                placeholder="@yourhandle"
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: '0.2rem' }}>
              <span>Instagram</span>
              <input
                type="text"
                value={form.instagram}
                onChange={onChange('instagram')}
                placeholder="@yourhandle"
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: '0.2rem' }}>
              <span>TikTok</span>
              <input
                type="text"
                value={form.tiktok}
                onChange={onChange('tiktok')}
                placeholder="@yourhandle"
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: '0.2rem' }}>
              <span>Truth Social</span>
              <input
                type="text"
                value={form.truth}
                onChange={onChange('truth')}
                placeholder="@yourhandle"
                style={inputStyle}
              />
            </label>
          </div>
        </div>

        {error && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              borderRadius: 12,
              background: 'rgba(220, 38, 38, 0.15)',
              border: '1px solid rgba(248, 113, 113, 0.35)',
              color: '#fecaca',
            }}
          >
            {error}
          </div>
        )}

        {successMessage && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              borderRadius: 12,
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(74, 222, 128, 0.35)',
              color: '#bbf7d0',
            }}
          >
            {successMessage}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit || submitting}
          style={{
            marginTop: '2rem',
            width: '100%',
            padding: '0.95rem 1.25rem',
            borderRadius: 999,
            fontWeight: 700,
            fontSize: '1rem',
            letterSpacing: '0.04em',
            border: 'none',
            color: 'black',
            background: canSubmit && !submitting ? '#38ef7d' : '#94a3b8',
            cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            boxShadow: canSubmit && !submitting ? '0 15px 35px rgba(56, 239, 125, 0.35)' : 'none',
          }}
        >
          {submitting ? 'Saving…' : 'Enter the Contest'}
        </button>

        <button
          type="button"
          onClick={() => router.push(from)}
          style={{
            marginTop: '1rem',
            width: '100%',
            padding: '0.85rem 1.25rem',
            borderRadius: 999,
            fontWeight: 600,
            fontSize: '0.95rem',
            letterSpacing: '0.02em',
            border: '1px solid rgba(148, 163, 184, 0.45)',
            color: '#cbd5f5',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          Go Back
        </button>
      </form>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '0.85rem 1rem',
  borderRadius: 12,
  border: '1px solid rgba(148, 163, 184, 0.35)',
  background: 'rgba(15, 23, 42, 0.75)',
  color: 'white',
  fontSize: '0.95rem',
};
