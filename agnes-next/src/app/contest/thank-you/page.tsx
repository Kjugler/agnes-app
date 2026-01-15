'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export default function ContestThankYou() {
  const qp = useSearchParams();
  const router = useRouter();
  const sessionId = qp.get('session_id') || '';
  const [finalizing, setFinalizing] = useState(false);

  // 1) Finalize checkout: retrieve session, log user in, determine redirect
  useEffect(() => {
    if (!sessionId || finalizing) return;

    setFinalizing(true);

    // Call finalize API to log user in and get redirect path
    fetch(`/api/checkout/finalize?session_id=${encodeURIComponent(sessionId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        
        if (res.ok && data.ok) {
          console.log('[thank-you] Finalized checkout', {
            email: data.email,
            redirectPath: data.redirectPath,
            wasNewUser: data.wasNewUser,
          });

          // Fire-and-forget purchase event
          try {
            localStorage.setItem('contest:has-points', '1');
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

          // Redirect to appropriate page using hard navigation to ensure cookies are refreshed
          // This prevents cookie identity mismatch where old cookies persist after finalize sets new ones
          const redirectPath = data.redirectPath || '/contest/score';
          console.log('[thank-you] Hard redirecting to ensure cookie refresh', { redirectPath });
          // Use window.location.assign for hard navigation (forces cookie refresh)
          window.location.assign(redirectPath);
        } else {
          console.error('[thank-you] Finalize failed', data);
          // Fallback: redirect to contest after delay
          setTimeout(() => {
            router.replace('/contest?new=1');
          }, 3000);
        }
      })
      .catch((err) => {
        console.error('[thank-you] Finalize error', err);
        // Fallback: redirect to contest after delay
        setTimeout(() => {
          router.replace('/contest?new=1');
        }, 3000);
      });
  }, [sessionId, router, finalizing]);

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
