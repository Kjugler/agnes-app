// Server component - Purchase Confirmed page
// Dark theme, brand watermark, no terminal/IBM emulator
import { Suspense } from 'react';
import ThankYouClient from './ThankYouClient';
import ThankYouButtons from './ThankYouButtons';

type SearchParams = Promise<{ session_id?: string }>;

export default async function ContestThankYou({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  // Next.js 15: searchParams is always a Promise
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
        overflow: 'auto', // Allow scrolling while keeping watermark visible
      }}
    >
      {/* Subtle Vector watermark - BEHIND the card, fixed position for scroll */}
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

      {/* Main content container - z-10 to ensure it's above watermark */}
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
        {/* Success icon */}
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

        {/* Title */}
        <h1
          style={{
            fontSize: '32px',
            fontWeight: '700',
            margin: '0 0 4px 0',
            textAlign: 'center',
            color: '#f5f5f5',
          }}
        >
          Purchase Confirmed
        </h1>

        {/* Sub-title - distinct line */}
        <p
          style={{
            fontSize: '18px',
            fontWeight: '500',
            margin: '0 0 4px 0',
            textAlign: 'center',
            color: 'rgba(245, 245, 245, 0.9)',
          }}
        >
          Your entry is live.
        </p>

        {/* Flavor line - cinematic accent */}
        <p
          className="text-sm md:text-base text-neutral-400 tracking-wide mt-1"
          style={{
            margin: '0 0 16px 0',
            textAlign: 'center',
          }}
        >
          Welcome deeper into The Agnes Protocol.
        </p>

        {/* Body */}
        <p
          style={{
            fontSize: '16px',
            margin: '0 0 32px 0',
            textAlign: 'center',
            color: 'rgba(245, 245, 245, 0.7)',
          }}
        >
          Your order is being processed. A confirmation email is on the way.
        </p>

        {/* Client component for verification and product details */}
        <Suspense fallback={
          <div style={{ textAlign: 'center', padding: '24px', color: 'rgba(245, 245, 245, 0.5)' }}>
            Finalizing your entry…
          </div>
        }>
          <ThankYouClient sessionId={sessionId} />
        </Suspense>

        {/* Action buttons - Client component for hover effects */}
        <ThankYouButtons />
      </div>
    </div>
  );
}
