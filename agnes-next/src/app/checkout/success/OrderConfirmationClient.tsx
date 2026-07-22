'use client';

import { useEffect, useState, useRef, useCallback, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { trackTikTok } from '@/lib/tiktokPixel';
import { trackMeta } from '@/lib/metaPixel';
import { trackGoogleAdsPurchase } from '@/lib/googleAds';
import { FUNNEL_EVENT_TYPES, trackFunnelEvent } from '@/lib/funnelTracking';
import { HUB_THEME } from '@/lib/hubTheme';

const HUB_REDIRECT_SECONDS = 7;
const HUB_PATH = '/contest';

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
  const router = useRouter();
  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [webhookProcessed, setWebhookProcessed] = useState(false);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [emailDelivery, setEmailDelivery] = useState<EmailDeliveryStatus | null>(null);
  const [emailDeliveryLoading, setEmailDeliveryLoading] = useState(false);
  const [emailFetchSettled, setEmailFetchSettled] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const hasVerifiedRef = useRef(false);
  const pollCountRef = useRef(0);
  const maxPolls = 10;
  const purchaseTrackedRef = useRef(false);
  const redirectScheduledRef = useRef(false);

  const confirmationStatusShown =
    verified &&
    !verifying &&
    emailFetchSettled &&
    (emailDelivery !== null || !emailDeliveryLoading);

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

  const pollForWebhookProcessing = useCallback(async (sessionIdParam: string) => {
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
  }, []);

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
          } catch {
            /* ignore */
          }

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

          trackFunnelEvent(FUNNEL_EVENT_TYPES.PURCHASE_COMPLETED, {
            session_id: currentSessionId,
            productType: data.productType || 'unknown',
            amount_total: data.amountTotal || 0,
            currency: data.currency || 'usd',
          }, { source: 'checkout-success' });

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
            trackGoogleAdsPurchase({
              transactionId: currentSessionId,
              value: (data.amountTotal || 0) / 100,
              currency: (data.currency || 'usd').toUpperCase(),
            });
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
  }, [sessionId, pollForWebhookProcessing]);

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
          setEmailFetchSettled(true);
        } else if (data.ok && !data.delivery && !retry) {
          retryTimeoutId = setTimeout(() => {
            if (isMounted) fetchEmailDeliveryStatus(true);
          }, 1750);
        } else {
          setEmailDeliveryLoading(false);
          setEmailFetchSettled(true);
        }
      } catch {
        if (!isMounted) return;
        setEmailDeliveryLoading(false);
        setEmailFetchSettled(true);
      }
    };

    fetchEmailDeliveryStatus();

    return () => {
      isMounted = false;
      if (retryTimeoutId) clearTimeout(retryTimeoutId);
    };
  }, [sessionId, verified]);

  useEffect(() => {
    if (!confirmationStatusShown || redirectScheduledRef.current) return;
    redirectScheduledRef.current = true;
    setCountdown(HUB_REDIRECT_SECONDS);
  }, [confirmationStatusShown]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      router.replace(HUB_PATH);
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(timer);
  }, [countdown, router]);

  return (
    <div>
      {sessionData?.productType && (
        <InfoCard
          tint="green"
          label="Product Purchased"
          value={formatProductType(sessionData.productType)}
        />
      )}

      {sessionData?.email && (
        <InfoCard tint="neutral" label="Confirmation sent to" value={maskEmail(sessionData.email)} />
      )}

      {emailDelivery && !emailDeliveryLoading && (
        <EmailDeliveryBanner
          delivery={emailDelivery}
          sessionId={sessionId}
          productType={sessionData?.productType}
        />
      )}

      {verifying && (
        <p style={{ marginTop: '8px', fontSize: '14px', color: HUB_THEME.textMuted, textAlign: 'center' }}>
          Confirming your order…
        </p>
      )}

      {verified && !verifying && !emailDelivery && emailDeliveryLoading && (
        <p style={{ marginTop: '8px', fontSize: '14px', color: HUB_THEME.textMuted, textAlign: 'center' }}>
          Checking email delivery status…
        </p>
      )}

      {verified && !verifying && emailFetchSettled && (
        <div
          style={{
            marginTop: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            alignItems: 'center',
          }}
        >
          <p style={{ fontSize: '14px', color: '#15803d', margin: 0, display: 'flex', gap: '6px' }}>
            <span aria-hidden>✓</span>
            <span>Order confirmed</span>
          </p>
          <p style={{ fontSize: '14px', color: HUB_THEME.textMuted, margin: 0, display: 'flex', gap: '6px' }}>
            <span aria-hidden>✓</span>
            <span>Your confirmation email is on its way</span>
          </p>
        </div>
      )}

      {(pollTimedOut && !webhookProcessed) || (error && !verified) ? (
        <p style={{ marginTop: '16px', fontSize: '14px', color: HUB_THEME.textMuted, textAlign: 'center' }}>
          Questions? Contact{' '}
          <a href="mailto:hello@theagnesprotocol.com" style={{ color: '#2563eb' }}>
            hello@theagnesprotocol.com
          </a>
          .
        </p>
      ) : null}

      {confirmationStatusShown && countdown !== null && countdown > 0 && (
        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <p style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 600, color: HUB_THEME.text }}>
            Returning you to the Hub in {countdown} second{countdown === 1 ? '' : 's'}…
          </p>
          <p style={{ margin: 0, fontSize: '13px', color: HUB_THEME.textMuted }}>Or choose an option below.</p>
        </div>
      )}

      <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <a href={HUB_PATH} style={primaryHubButtonStyle}>
          Back to Hub (Contest Page)
        </a>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <a href="/sample-chapters" style={{ ...secondaryButtonStyle, flex: '1 1 140px' }}>
            Read Sample Chapters
          </a>
          <a href="/catalog" style={{ ...secondaryButtonStyle, flex: '1 1 140px' }}>
            Back to Catalog
          </a>
        </div>
      </div>

      <p
        style={{
          marginTop: '28px',
          fontSize: '13px',
          color: HUB_THEME.textMuted,
          textAlign: 'center',
        }}
      >
        We appreciate you! Enjoy the read.
      </p>
    </div>
  );
}

function InfoCard({
  tint,
  label,
  value,
}: {
  tint: 'green' | 'neutral';
  label: string;
  value: string;
}) {
  const isGreen = tint === 'green';
  return (
    <div
      style={{
        marginBottom: '12px',
        padding: '14px 16px',
        borderRadius: '10px',
        background: isGreen ? 'rgba(0, 255, 127, 0.08)' : '#f8fafc',
        border: `1px solid ${isGreen ? 'rgba(0, 255, 127, 0.25)' : HUB_THEME.border}`,
        textAlign: 'left',
      }}
    >
      <p style={{ margin: 0, fontSize: '12px', color: HUB_THEME.textMuted, fontWeight: 500 }}>{label}</p>
      <p
        style={{
          margin: '4px 0 0 0',
          fontSize: '17px',
          fontWeight: 700,
          color: isGreen ? '#15803d' : HUB_THEME.text,
        }}
      >
        {value}
      </p>
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
          marginBottom: '12px',
          padding: '14px 16px',
          background: 'rgba(0, 255, 127, 0.08)',
          borderRadius: '10px',
          border: '1px solid rgba(0, 255, 127, 0.25)',
          textAlign: 'left',
        }}
      >
        <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#15803d' }}>
          Confirmation email accepted for delivery.
        </p>
        <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: HUB_THEME.textMuted, lineHeight: 1.45 }}>
          Check your inbox (and spam folder) for your download link.
        </p>
      </div>
    );
  }

  if (deliveryStatus === 'queued') {
    return (
      <div
        style={{
          marginBottom: '12px',
          padding: '14px 16px',
          background: '#f8fafc',
          borderRadius: '10px',
          border: `1px solid ${HUB_THEME.border}`,
          textAlign: 'left',
        }}
      >
        <p style={{ margin: 0, fontSize: '14px', color: HUB_THEME.text }}>
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
          marginBottom: '12px',
          padding: '16px',
          background: '#fffbeb',
          borderRadius: '10px',
          border: '1px solid #fcd34d',
          textAlign: 'left',
        }}
      >
        <p style={{ margin: 0, marginBottom: '8px', fontSize: '15px', fontWeight: 600, color: '#b45309' }}>
          {isRejected ? 'Email not delivered' : 'Email unavailable'}
        </p>
        <p style={{ margin: 0, marginBottom: '12px', fontSize: '14px', color: HUB_THEME.text, lineHeight: 1.5 }}>
          {isRejected
            ? "Your email provider blocked the confirmation email. Don't worry — your purchase is successful and your download is still available here."
            : "We couldn't send the confirmation email. Don't worry — your purchase is successful and your download is still available here."}
        </p>
        {isRejected && rejectReason && (
          <p style={{ margin: 0, marginBottom: '12px', fontSize: '12px', color: HUB_THEME.textMuted }}>
            Provider reason: {getFriendlyRejectReason(rejectReason) || 'blocked'}
          </p>
        )}
        {downloadUrl && (productType === 'ebook' || productType === 'audio_preorder') && (
          <a
            href={downloadUrl}
            style={{
              display: 'inline-block',
              marginTop: '4px',
              padding: '10px 18px',
              background: HUB_THEME.primaryGreen,
              color: '#0a0a0a',
              textDecoration: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '14px',
            }}
          >
            Download Now
          </a>
        )}
      </div>
    );
  }

  return null;
}

const primaryHubButtonStyle: CSSProperties = {
  display: 'block',
  padding: '14px 20px',
  minHeight: 48,
  background: '#2563eb',
  color: '#ffffff',
  textDecoration: 'none',
  borderRadius: '10px',
  fontWeight: 700,
  fontSize: '15px',
  textAlign: 'center',
  boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
};

const secondaryButtonStyle: CSSProperties = {
  display: 'block',
  padding: '12px 16px',
  minHeight: 48,
  background: HUB_THEME.surface,
  color: '#2563eb',
  textDecoration: 'none',
  borderRadius: '10px',
  fontWeight: 600,
  fontSize: '14px',
  textAlign: 'center',
  border: '2px solid #2563eb',
  boxSizing: 'border-box',
};
