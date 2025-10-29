'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export default function ContestThankYou() {
  const qp = useSearchParams();
  const router = useRouter();
  const sessionId = qp.get('session_id') || '';

  // 1) Fire-and-forget purchase event + remember session locally
  useEffect(() => {
    if (!sessionId) return;

    try {
      // used by /contest to show "View your points"
      localStorage.setItem('contest:has-points', '1');
      // optional: keep the Stripe session id for reference
      localStorage.setItem('last_session_id', sessionId);
    } catch {}

    const payload = {
      type: 'PURCHASE_COMPLETED',
      source: 'contest',
      meta: {
        path: '/contest',
        session_id: sessionId,
        amount_total: 2600,
        currency: 'usd',
      },
    };

    try {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      if ('sendBeacon' in navigator) {
        navigator.sendBeacon('/api/track', blob);
      } else {
        fetch('/api/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }, [sessionId]);

  // 2) Gentle auto-redirect back to contest
  useEffect(() => {
    const t = setTimeout(() => {
      router.replace('/contest?new=1');
    }, 3000); // ~3s dwell
    return () => clearTimeout(t);
  }, [router]);

  return (
    <main style={{ maxWidth: 720, margin: '48px auto', padding: '0 16px' }}>
      <h1>Thank you for your purchase! 🎉</h1>
      <p>Your order is being processed. You’ll get an email receipt shortly.</p>
      {sessionId ? (
        <p style={{ opacity: 0.7, fontSize: 12 }}>Ref: {sessionId}</p>
      ) : (
        <p style={{ opacity: 0.7, fontSize: 12 }}>Ref: not available</p>
      )}
      <p style={{ marginTop: 24 }}>
        <a href="/contest">Back to contest</a>{' '}
        <span style={{ opacity: 0.6 }}>(auto-redirecting…)</span>
      </p>
    </main>
  );
}
