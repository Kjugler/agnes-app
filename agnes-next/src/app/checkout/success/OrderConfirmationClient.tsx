'use client';

import { useEffect, useState, useRef } from 'react';
import { trackTikTok } from '@/lib/tiktokPixel';
import { trackMeta } from '@/lib/metaPixel';

interface SessionData {
  paid?: boolean;
  email?: string;
  orderId?: string;
  productType?: 'paperback' | 'ebook' | 'audio_preorder';
  amountTotal?: number;
  currency?: string;
}

interface EmailDeliveryStatus {
  deliveryStatus: 'sent' | 'queued' | 'rejected' | 'error' | 'unknown';
  rejectReason?: string | null;
  queuedReason?: string | null;
  attemptedAt?: string | null;
  email?: string | null;
  providerMessageId?: string | null;
}

interface OrderConfirmationClientProps {
  sessionId: string | null;
}

export default function OrderConfirmationClient({ sessionId }: OrderConfirmationClientProps) {
  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [webhookProcessed, setWebhookProcessed] = useState(false);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [emailDelivery, setEmailDelivery] = useState<EmailDeliveryStatus | null>(null);
  const [emailDeliveryLoading, setEmailDeliveryLoading] = useState(false);
  const hasVerifiedRef = useRef(false);
  const pollCountRef = useRef(0);
  const maxPolls = 10;
  const purchaseTrackedRef = useRef(false);

  function maskEmail(email: string): string {
    if (!email || !email.includes('@')) return email;
    const [local, domain] = email.split('@');
    if (local.length <= 2) return `${local[0]}***@${domain}`;
    return `${local.substring(0, 2)}***@${domain}`;
  }

  function formatProductType(productType?: string): string {
    if (!productType) return 'Product';
    const map: Record<string, string> = {
      paperback: 'Paperback Book',
      ebook: 'eBook',
      audio_preorder: 'Audio Pre-order',
    };
    return map[productType] || productType;
  }

  useEffect(() => {
    if (!sessionId || hasVerifiedRef.current) {
      if (!sessionId) {
        setError('Missing session id — please use the link from your confirmation email.');
        setVerifying(false);
      }
      return;
    }
    hasVerifiedRef.current = true;

    const currentSessionId: string = sessionId;

    const verifySession = async () => {
      try {
        setVerifying(true);
        const verifyUrl = `/api/checkout/verify-session?session_id=${encodeURIComponent(currentSessionId)}`;
        const res = await fetch(verifyUrl);
        const data = await res.json();

        if (data.ok && data.paid) {
          setVerified(true);
          setSessionData(data);

          try {
            localStorage.setItem('last_session_id', currentSessionId);
          } catch {}

          const payload = {
            type: 'PURCHASE_COMPLETED',
            source: 'checkout',
            meta: {
              path: '/checkout/success',
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

          if (!purchaseTrackedRef.current) {
            purchaseTrackedRef.current = true;
            trackTikTok('CompletePayment', {
              event_id: currentSessionId,
              content_id: data.productType || 'unknown',
              value: (data.amountTotal || 0) / 100,
              currency: (data.currency || 'usd').toUpperCase(),
            });
            trackMeta(
              'Purchase',
              {
                content_ids: [data.productType || 'unknown'],
                content_type: 'product',
                value: (data.amountTotal || 0) / 100,
                currency: (data.currency || 'usd').toUpperCase(),
              },
              { eventID: currentSessionId },
            );
          }

          pollForWebhookProcessing(currentSessionId);
        } else {
          setError(data.error || 'Session verification failed');
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to verify session';
        setError(message);
      } finally {
        setVerifying(false);
      }
    };

    verifySession();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !verified) return;

    let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    const fetchEmailDeliveryStatus = async (retry = false) => {
      if (!sessionId) return;

      setEmailDeliveryLoading(true);
      try {
        const statusUrl = `/api/email/purchase-confirmation/status?session_id=${encodeURIComponent(sessionId)}`;
        const res = await fetch(statusUrl);
        const data = await res.json();

        if (!isMounted) return;

        if (data.ok && data.delivery) {
          setEmailDelivery(data.delivery);
          setEmailDeliveryLoading(false);
        } else if (data.ok && !data.delivery && !retry) {
          retryTimeoutId = setTimeout(() => {
            if (isMounted) fetchEmailDeliveryStatus(true);
          }, 1750);
        } else {
          setEmailDeliveryLoading(false);
        }
      } catch {
        if (!isMounted) return;
        setEmailDeliveryLoading(false);
      }
    };

    fetchEmailDeliveryStatus();

    return () => {
      isMounted = false;
      if (retryTimeoutId) clearTimeout(retryTimeoutId);
    };
  }, [sessionId, verified]);

  const pollForWebhookProcessing = async (sessionIdParam: string) => {
    if (pollCountRef.current >= maxPolls) {
      setPollTimedOut(true);
      return;
    }

    pollCountRef.current++;

    try {
      const checkUrl = `/api/checkout/verify-session?session_id=${encodeURIComponent(sessionIdParam)}`;
      const res = await fetch(checkUrl);
      const data = await res.json();

      if (data.ok && data.orderId) {
        setWebhookProcessed(true);
        return;
      }

      if (pollCountRef.current < maxPolls) {
        setTimeout(() => pollForWebhookProcessing(sessionIdParam), 2000);
      } else {
        setPollTimedOut(true);
      }
    } catch {
      if (pollCountRef.current >= maxPolls) {
        setPollTimedOut(true);
      } else {
        setTimeout(() => pollForWebhookProcessing(sessionIdParam), 2000);
      }
    }
  };

  return (
    <div style={{ textAlign: 'center' }}>
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
          <p style={{ margin: 0, fontSize: '14px', color: 'rgba(245, 245, 245, 0.7)' }}>Product</p>
          <p style={{ margin: '4px 0 0 0', fontSize: '18px', fontWeight: '600', color: '#00ff7f' }}>
            {formatProductType(sessionData.productType)}
          </p>
        </div>
      )}

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

      {emailDelivery && !emailDeliveryLoading && (
        <EmailDeliveryBanner
          delivery={emailDelivery}
          sessionId={sessionId}
          productType={sessionData?.productType}
        />
      )}

      {verifying && (
        <p style={{ marginTop: '16px', fontSize: '14px', color: 'rgba(245, 245, 245, 0.5)' }}>
          Confirming your order…
        </p>
      )}

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
            <span>Order confirmed</span>
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
            <span>Your confirmation email is on its way</span>
          </p>
        </div>
      )}

      {(pollTimedOut && !webhookProcessed) || (error && !verified) ? (
        <p style={{ marginTop: '16px', fontSize: '14px', color: 'rgba(245, 245, 245, 0.6)' }}>
          Questions? Contact{' '}
          <a href="mailto:hello@theagnesprotocol.com" style={{ color: '#00ff7f' }}>
            hello@theagnesprotocol.com
          </a>
          .
        </p>
      ) : null}
    </div>
  );
}

function EmailDeliveryBanner({
  delivery,
  sessionId,
  productType,
}: {
  delivery: EmailDeliveryStatus;
  sessionId: string | null;
  productType?: string;
}) {
  const { deliveryStatus, rejectReason } = delivery;

  const getFriendlyRejectReason = (reason: string | null | undefined): string | null => {
    if (!reason) return null;
    const reasonLower = reason.toLowerCase();
    if (reasonLower.includes('global') || reasonLower.includes('block')) return 'blocked';
    if (reasonLower.includes('invalid') || reasonLower.includes('bounce')) return 'invalid address';
    if (reasonLower.includes('spam') || reasonLower.includes('filter')) return 'filtered';
    return 'blocked';
  };

  if (deliveryStatus === 'sent') {
    return (
      <div
        style={{
          marginBottom: '16px',
          padding: '12px 16px',
          background: 'rgba(0, 255, 127, 0.1)',
          borderRadius: '8px',
          border: '1px solid rgba(0, 255, 127, 0.2)',
        }}
      >
        <p style={{ margin: 0, fontSize: '14px', color: 'rgba(0, 255, 127, 0.9)' }}>
          Confirmation email accepted for delivery.
        </p>
      </div>
    );
  }

  if (deliveryStatus === 'queued') {
    return (
      <div
        style={{
          marginBottom: '16px',
          padding: '12px 16px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <p style={{ margin: 0, fontSize: '14px', color: 'rgba(245, 245, 245, 0.8)' }}>
          Your confirmation email is queued. It should arrive shortly.
        </p>
      </div>
    );
  }

  if (deliveryStatus === 'rejected' || deliveryStatus === 'error') {
    const downloadUrl = sessionId
      ? `/ebook/download?session_id=${encodeURIComponent(sessionId)}`
      : null;
    const isRejected = deliveryStatus === 'rejected';

    return (
      <div
        style={{
          marginBottom: '16px',
          padding: '16px',
          background: 'rgba(255, 193, 7, 0.1)',
          borderRadius: '8px',
          border: '1px solid rgba(255, 193, 7, 0.3)',
        }}
      >
        <p style={{ margin: 0, marginBottom: '8px', fontSize: '15px', fontWeight: '600', color: '#ffc107' }}>
          {isRejected ? 'Email not delivered' : 'Email unavailable'}
        </p>
        <p style={{ margin: 0, marginBottom: '12px', fontSize: '14px', color: 'rgba(245, 245, 245, 0.9)', lineHeight: '1.5' }}>
          {isRejected
            ? "Your email provider blocked the confirmation email. Don't worry — your purchase is successful and your download is still available here."
            : "We couldn't send the confirmation email. Don't worry — your purchase is successful and your download is still available here."}
        </p>
        {isRejected && rejectReason && (
          <p style={{ margin: 0, marginBottom: '12px', fontSize: '12px', color: 'rgba(245, 245, 245, 0.5)' }}>
            Provider reason: {getFriendlyRejectReason(rejectReason) || 'blocked'}
          </p>
        )}
        {downloadUrl && (productType === 'ebook' || productType === 'audio_preorder') && (
          <a
            href={downloadUrl}
            className="button-glow button-glow--green"
            style={{
              display: 'inline-block',
              marginTop: '8px',
              padding: '10px 20px',
              background: '#00ff7f',
              color: '#000',
              textDecoration: 'none',
              borderRadius: '6px',
              fontWeight: '600',
              fontSize: '14px',
            }}
          >
            Download Now
          </a>
        )}
        {(!downloadUrl || productType === 'paperback') && (
          <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: 'rgba(245, 245, 245, 0.7)' }}>
            Check your order details above or contact support if you need help.
          </p>
        )}
      </div>
    );
  }

  return null;
}
