'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type VerifyOk = {
  ok: true;
  email: string;
  purchaseId: string;
  sessionId: string;
  userId: string;
  expiresAt: string;
};

function ClaimInner() {
  const qp = useSearchParams();
  const token = useMemo(() => qp.get('token')?.trim() || '', [qp]);

  const [verify, setVerify] = useState<VerifyOk | { ok: false; error?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailInput, setEmailInput] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setVerify({ ok: false, error: 'missing_token' });
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/contest/claim-verify?token=${encodeURIComponent(token)}`, {
          cache: 'no-store',
        });
        const data = (await res.json()) as VerifyOk | { ok: false; error?: string };
        if (!cancelled) {
          setVerify(data);
          if (data.ok) setEmailInput(data.email);
        }
      } catch {
        if (!cancelled) setVerify({ ok: false, error: 'network' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const goContest = useCallback(() => {
    if (!verify || !verify.ok) return;
    const want = emailInput.trim().toLowerCase();
    if (want !== verify.email) {
      setErr('Email must match the address on this purchase link.');
      return;
    }
    setErr(null);
    const url = `/contest?email=${encodeURIComponent(want)}`;
    window.location.href = url;
  }, [emailInput, verify]);

  if (!token) {
    return (
      <p style={{ color: '#b91c1c', fontSize: 15 }}>
        This page needs a valid link from your purchase email. Open the link from your inbox, or contact
        hello@theagnesprotocol.com.
      </p>
    );
  }

  if (loading) {
    return <p style={{ fontSize: 15, color: '#64748b' }}>Checking your link…</p>;
  }

  if (!verify || !verify.ok) {
    const code = verify && 'error' in verify ? verify.error : 'unknown';
    return (
      <div>
        <p style={{ color: '#b91c1c', fontSize: 15, marginBottom: 12 }}>
          This link is invalid or has expired ({code}). Request a new confirmation email from support if you need help.
        </p>
        <Link href="/contest" style={{ color: '#2563eb', fontSize: 14 }}>
          Go to contest home
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <p style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 16 }}>
        We found your purchase and your reader profile. Confirm the email you used at checkout, then continue to sign
        in to the contest with that same address so your purchase stays attached.
      </p>
      <label style={{ display: 'block', fontSize: 13, marginBottom: 6, color: '#334155' }}>Email on this purchase</label>
      <input
        type="email"
        value={emailInput}
        onChange={(e) => setEmailInput(e.target.value)}
        autoComplete="email"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '10px 12px',
          fontSize: 15,
          borderRadius: 8,
          border: '1px solid #cbd5e1',
          marginBottom: 12,
        }}
      />
      <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>Link expires {new Date(verify.expiresAt).toUTCString()}.</p>
      {err && (
        <p style={{ color: '#b91c1c', fontSize: 14, marginBottom: 12 }} role="alert">
          {err}
        </p>
      )}
      <button
        type="button"
        onClick={goContest}
        style={{
          padding: '12px 20px',
          fontSize: 15,
          fontWeight: 600,
          cursor: 'pointer',
          background: '#00ff7f',
          color: '#0a0a0a',
          border: 'none',
          borderRadius: 8,
        }}
      >
        Continue to contest sign-in
      </button>
    </div>
  );
}

export default function ContestClaimPage() {
  return (
    <div
      style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '32px 16px 48px',
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        color: '#0f172a',
      }}
    >
      <p style={{ margin: '0 0 12px 0' }}>
        <Link href="/contest" style={{ color: '#2563eb', fontSize: 14 }}>
          ← Contest home
        </Link>
      </p>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 16px 0' }}>Claim your reader account</h1>
      <Suspense fallback={<p style={{ fontSize: 14, color: '#64748b' }}>Loading…</p>}>
        <ClaimInner />
      </Suspense>
    </div>
  );
}
