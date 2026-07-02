import { Suspense } from 'react';
import OrderConfirmationClient from './OrderConfirmationClient';
import OrderConfirmationButtons from './OrderConfirmationButtons';

type SearchParams = Promise<{ session_id?: string }>;

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const sp = (await searchParams) ?? {};
  const sessionId = sp.session_id || null;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#f5f5f5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        position: 'relative',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          userSelect: 'none',
          zIndex: 0,
          maskImage: 'radial-gradient(circle, rgba(0,0,0,1) 0%, rgba(0,0,0,0.35) 60%, rgba(0,0,0,0) 80%)',
          WebkitMaskImage: 'radial-gradient(circle, rgba(0,0,0,1) 0%, rgba(0,0,0,0.35) 60%, rgba(0,0,0,0) 80%)',
        }}
      >
        <div
          style={{
            fontSize: 'clamp(96px, 20vw, 140px)',
            fontWeight: '600',
            letterSpacing: '0.2em',
            color: 'rgba(255, 255, 255, 0.08)',
            filter: 'blur(0.3px)',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: '0.1em',
          }}
        >
          <span>Vector</span>
          <span style={{ fontSize: '0.9em' }}>🛰️</span>
        </div>
      </div>

      <div
        style={{
          width: 'min(600px, 92vw)',
          background: '#111111',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          padding: '48px 32px',
          position: 'relative',
          zIndex: 10,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(0, 255, 127, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#00ff7f"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>

        <h1
          style={{
            fontSize: '32px',
            fontWeight: '700',
            margin: '0 0 12px 0',
            textAlign: 'center',
            color: '#f5f5f5',
          }}
        >
          Your purchase is complete.
        </h1>

        <p
          style={{
            fontSize: '18px',
            fontWeight: '500',
            margin: '0 0 8px 0',
            textAlign: 'center',
            color: 'rgba(245, 245, 245, 0.92)',
          }}
        >
          Check your email for your download link.
        </p>

        <p
          style={{
            fontSize: '14px',
            margin: '0 0 24px 0',
            textAlign: 'center',
            color: 'rgba(245, 245, 245, 0.5)',
            lineHeight: 1.45,
          }}
        >
          Didn&apos;t receive an email? Check spam or contact{' '}
          <a href="mailto:hello@theagnesprotocol.com" style={{ color: '#00ff7f' }}>
            hello@theagnesprotocol.com
          </a>
          .
        </p>

        <Suspense
          fallback={
            <div style={{ textAlign: 'center', padding: '24px', color: 'rgba(245, 245, 245, 0.5)' }}>
              Confirming your order…
            </div>
          }
        >
          <OrderConfirmationClient sessionId={sessionId} />
        </Suspense>

        <OrderConfirmationButtons />
      </div>
    </div>
  );
}
