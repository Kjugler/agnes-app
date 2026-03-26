'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import '@/styles/button-glow.css';

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

interface ThankYouClientProps {
  sessionId: string | null;
}

export default function ThankYouClient({ sessionId }: ThankYouClientProps) {
  const router = useRouter();
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
  const maxPolls = 10; // Poll up to 10 times (20 seconds total)
  const hasRedirectedRef = useRef(false);

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
          // Note: Email delivery status fetch happens in useEffect hook (non-blocking)

          // Part A: Redirect to Contest page with deterministic handoff params
          // Delay redirect slightly to allow thank-you content to be visible
          setTimeout(() => {
            if (!hasRedirectedRef.current && currentSessionId) {
              hasRedirectedRef.current = true;
              const redirectUrl = `/contest?justPurchased=1&session_id=${encodeURIComponent(currentSessionId)}`;
              console.log('[THANK_YOU] Redirecting to Contest with purchase flag', { redirectUrl });
              router.replace(redirectUrl);
            }
          }, 3000); // 3 second delay to show thank-you message
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

  // Fetch email delivery status (non-blocking, with retry and cleanup)
  useEffect(() => {
    if (!sessionId || !verified) return;
    
    let retryTimeoutId: NodeJS.Timeout | null = null;
    let isMounted = true;
    
    const fetchEmailDeliveryStatus = async (retry = false) => {
      if (!sessionId) return;
      
      setEmailDeliveryLoading(true);
      try {
        const statusUrl = `/api/email/purchase-confirmation/status?session_id=${encodeURIComponent(sessionId)}`;
        const res = await fetch(statusUrl);
        const data = await res.json();
        
        if (!isMounted) return; // Component unmounted, ignore result
        
        if (data.ok && data.delivery) {
          setEmailDelivery(data.delivery);
          setEmailDeliveryLoading(false);
        } else if (data.ok && !data.delivery && !retry) {
          // Not found yet - retry once after 1500-2000ms (race condition handling)
          retryTimeoutId = setTimeout(() => {
            if (isMounted) {
              fetchEmailDeliveryStatus(true);
            }
          }, 1750); // 1.75s (middle of 1500-2000ms range)
        } else {
          setEmailDeliveryLoading(false);
        }
      } catch (err) {
        if (!isMounted) return; // Component unmounted, ignore error
        console.warn('[THANK_YOU] Failed to fetch email delivery status (non-critical):', err);
        setEmailDeliveryLoading(false);
        // Don't show error - email status is nice-to-have, purchase flow continues
      }
    };
    
    fetchEmailDeliveryStatus();
    
    // Cleanup: cancel retry on unmount
    return () => {
      isMounted = false;
      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
      }
    };
  }, [sessionId, verified]);

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
      {process.env.NEXT_PUBLIC_STRESS_TEST_MODE === '1' && (
        <div style={{
          marginBottom: '20px',
          padding: '12px 16px',
          background: 'rgba(0, 255, 127, 0.1)',
          border: '1px solid rgba(0, 255, 127, 0.3)',
          borderRadius: '8px',
          fontSize: '14px',
          color: 'rgba(245, 245, 245, 0.9)',
        }}>
          <strong style={{ color: '#00ff7f' }}>PUBLIC STRESS TEST ACTIVE</strong> — Everything you see is a simulation. No real charges. No real deliveries. <a href="mailto:hello@theagnesprotocol.com" style={{ color: '#00ff7f', textDecoration: 'underline' }}>Found a bug? Email hello@theagnesprotocol.com</a>
        </div>
      )}
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

      {/* Email delivery status banner */}
      {emailDelivery && !emailDeliveryLoading && (
        <EmailDeliveryBanner 
          delivery={emailDelivery} 
          sessionId={sessionId}
          productType={sessionData?.productType}
        />
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

// Email delivery status banner component
function EmailDeliveryBanner({ 
  delivery, 
  sessionId,
  productType 
}: { 
  delivery: EmailDeliveryStatus; 
  sessionId: string | null;
  productType?: string;
}) {
  const { deliveryStatus, rejectReason } = delivery;
  
  // Map rejectReason codes to friendly text (privacy: don't show raw codes like "global-block")
  const getFriendlyRejectReason = (reason: string | null | undefined): string | null => {
    if (!reason) return null;
    const reasonLower = reason.toLowerCase();
    if (reasonLower.includes('global') || reasonLower.includes('block')) {
      return 'blocked';
    }
    if (reasonLower.includes('invalid') || reasonLower.includes('bounce')) {
      return 'invalid address';
    }
    if (reasonLower.includes('spam') || reasonLower.includes('filter')) {
      return 'filtered';
    }
    // Default: return generic "blocked" instead of raw code
    return 'blocked';
  };
  
  // Show banner for all statuses (sent/queued show positive feedback, rejected/error show fallback)
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
  
  // Queued status
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
  
  // Rejected status - show helpful fallback
  if (deliveryStatus === 'rejected') {
    const downloadUrl = sessionId 
      ? `/ebook/download?session_id=${encodeURIComponent(sessionId)}`
      : null;
    
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
          Email not delivered
        </p>
        <p style={{ margin: 0, marginBottom: '12px', fontSize: '14px', color: 'rgba(245, 245, 245, 0.9)', lineHeight: '1.5' }}>
          Your email provider blocked the confirmation email. Don't worry — your purchase is successful and your download is still available here.
        </p>
        {rejectReason && (
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
            Use the Download button below.
          </p>
        )}
      </div>
    );
  }
  
  // Error status - similar fallback
  if (deliveryStatus === 'error') {
    const downloadUrl = sessionId 
      ? `/ebook/download?session_id=${encodeURIComponent(sessionId)}`
      : null;
    
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
          Email unavailable
        </p>
        <p style={{ margin: 0, marginBottom: '12px', fontSize: '14px', color: 'rgba(245, 245, 245, 0.9)', lineHeight: '1.5' }}>
          We couldn't send the confirmation email. Don't worry — your purchase is successful and your download is still available here.
        </p>
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
            Use the Download button below.
          </p>
        )}
      </div>
    );
  }
  
  // Unknown status - don't show anything
  return null;
}
