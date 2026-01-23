'use client';

import { useEffect, useState, useRef } from 'react';

interface SessionData {
  paid?: boolean;
  email?: string;
  orderId?: string;
  productType?: 'paperback' | 'ebook' | 'audio_preorder';
  amountTotal?: number;
  currency?: string;
}

interface ThankYouClientProps {
  sessionId: string | null;
}

export default function ThankYouClient({ sessionId }: ThankYouClientProps) {
  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [webhookProcessed, setWebhookProcessed] = useState(false);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const hasVerifiedRef = useRef(false);
  const pollCountRef = useRef(0);
  const maxPolls = 10; // Poll up to 10 times (20 seconds total)

  // Helper to mask email
  function maskEmail(email: string): string {
    if (!email || !email.includes('@')) return email;
    const [local, domain] = email.split('@');
    if (local.length <= 2) return `${local[0]}***@${domain}`;
    return `${local.substring(0, 2)}***@${domain}`;
  }

  // Helper to format product type
  function formatProductType(productType?: string): string {
    if (!productType) return 'Product';
    const map: Record<string, string> = {
      paperback: 'Paperback Book',
      ebook: 'eBook',
      audio_preorder: 'Audio Pre-order',
    };
    return map[productType] || productType;
  }

  // Verify session and poll for webhook processing
  useEffect(() => {
    if (!sessionId || hasVerifiedRef.current) {
      if (!sessionId) {
        console.warn("[ThankYou] Missing session_id in URL");
        setError("Missing session id — please use the link from your confirmation email.");
        setVerifying(false);
      }
      return;
    }
    hasVerifiedRef.current = true;

    // Store in const so TypeScript knows it's non-null (guaranteed by guard above)
    const currentSessionId: string = sessionId;

    const verifySession = async () => {
      try {
        setVerifying(true);
        if (!currentSessionId) {
          throw new Error("Missing session_id");
        }
        const verifyUrl = `/api/checkout/verify-session?session_id=${encodeURIComponent(currentSessionId)}`;
        const res = await fetch(verifyUrl);
        const data = await res.json();

        if (data.ok && data.paid) {
          setVerified(true);
          setSessionData(data);

          // Fire-and-forget purchase event
          try {
            localStorage.setItem('contest:has-points', '1');
            localStorage.setItem('last_session_id', currentSessionId);
          } catch {}

          const payload = {
            type: 'PURCHASE_COMPLETED',
            source: 'contest',
            meta: {
              path: '/contest',
              session_id: currentSessionId,
              amount_total: data.amountTotal || 2600,
              currency: data.currency || 'usd',
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

          // Start polling for webhook processing (nice-to-have)
          pollForWebhookProcessing(currentSessionId);
        } else {
          setError(data.error || 'Session verification failed');
        }
      } catch (err: any) {
        console.error('[THANK_YOU] verify failed', err);
        setError(err?.message || 'Failed to verify session');
      } finally {
        setVerifying(false);
      }
    };

    verifySession();
  }, [sessionId]);

  // Poll for webhook processing (nice-to-have)
  const pollForWebhookProcessing = async (sessionIdParam: string) => {
    if (!sessionIdParam) {
      throw new Error("Missing session_id");
    }
    
    if (pollCountRef.current >= maxPolls) {
      setPollTimedOut(true);
      return;
    }

    pollCountRef.current++;
    
    try {
      // Check if purchase exists in DB (indicates webhook processed)
      const checkUrl = `/api/checkout/verify-session?session_id=${encodeURIComponent(sessionIdParam)}`;
      const res = await fetch(checkUrl);
      const data = await res.json();

      // If we have orderId or other webhook-processed indicators, mark as processed
      if (data.ok && data.orderId) {
        setWebhookProcessed(true);
        return;
      }

      // Continue polling if not processed yet
      if (pollCountRef.current < maxPolls) {
        setTimeout(() => pollForWebhookProcessing(sessionIdParam), 2000); // Poll every 2 seconds
      } else {
        setPollTimedOut(true);
      }
    } catch (err) {
      console.warn('[THANK_YOU] Poll error (non-critical):', err);
      // Don't stop polling on error, but mark timeout if max reached
      if (pollCountRef.current >= maxPolls) {
        setPollTimedOut(true);
      } else {
        setTimeout(() => pollForWebhookProcessing(sessionIdParam), 2000);
      }
    }
  };

  // Render product details and verification status
  return (
    <div style={{ textAlign: 'center' }}>
      {/* Product type */}
      {sessionData?.productType && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px 16px',
            background: 'rgba(0, 255, 127, 0.1)',
            borderRadius: '8px',
            border: '1px solid rgba(0, 255, 127, 0.2)',
          }}
        >
          <p style={{ margin: 0, fontSize: '14px', color: 'rgba(245, 245, 245, 0.7)' }}>
            Product
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: '18px', fontWeight: '600', color: '#00ff7f' }}>
            {formatProductType(sessionData.productType)}
          </p>
        </div>
      )}

      {/* Masked email */}
      {sessionData?.email && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px 16px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '8px',
          }}
        >
          <p style={{ margin: 0, fontSize: '14px', color: 'rgba(245, 245, 245, 0.7)' }}>
            Confirmation sent to
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: '16px', fontWeight: '500', color: '#f5f5f5' }}>
            {maskEmail(sessionData.email)}
          </p>
        </div>
      )}

      {/* Verification status - calm UX */}
      {verifying && (
        <p style={{ marginTop: '16px', fontSize: '14px', color: 'rgba(245, 245, 245, 0.5)' }}>
          Finalizing your entry…
        </p>
      )}

      {/* Micro-status lines when confirmed */}
      {verified && !pollTimedOut && (
        <div
          style={{
            marginTop: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            alignItems: 'center',
          }}
        >
          <p
            style={{
              fontSize: '14px',
              color: '#00ff7f',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              margin: 0,
            }}
          >
            <span>✓</span>
            <span>Contest entry recorded</span>
          </p>
          <p
            style={{
              fontSize: '14px',
              color: 'rgba(245, 245, 245, 0.6)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              margin: 0,
            }}
          >
            <span>✓</span>
            <span>Points may take a moment to appear</span>
          </p>
        </div>
      )}

      {/* Poll timeout - calm message, no error wall */}
      {pollTimedOut && !webhookProcessed && (
        <p style={{ marginTop: '16px', fontSize: '14px', color: 'rgba(245, 245, 245, 0.6)' }}>
          If you don't see points within a few minutes, contact support.
        </p>
      )}

      {/* Error state - calm fallback */}
      {error && !verified && (
        <p style={{ marginTop: '16px', fontSize: '14px', color: 'rgba(245, 245, 245, 0.6)' }}>
          If you don't see points within a few minutes, contact support.
        </p>
      )}
    </div>
  );
}
