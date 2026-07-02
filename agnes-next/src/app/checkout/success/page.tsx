import { Suspense } from 'react';
import OrderConfirmationClient from './OrderConfirmationClient';
import { HUB_THEME } from '@/lib/hubTheme';

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
        background: HUB_THEME.bg,
        color: HUB_THEME.text,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px 48px',
        fontFamily: HUB_THEME.fontFamily,
      }}
    >
      <div
        style={{
          width: 'min(520px, 100%)',
          background: HUB_THEME.surface,
          border: `1px solid ${HUB_THEME.border}`,
          borderRadius: '16px',
          padding: '40px 32px 32px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)',
        }}
      >
        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: 'rgba(0, 255, 127, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            boxShadow: '0 0 0 8px rgba(0, 255, 127, 0.06)',
          }}
        >
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#00c853"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h1
          style={{
            fontSize: 'clamp(1.5rem, 4vw, 1.75rem)',
            fontWeight: 700,
            margin: '0 0 10px 0',
            textAlign: 'center',
            color: HUB_THEME.text,
          }}
        >
          Your purchase is complete!
        </h1>

        <p
          style={{
            fontSize: '15px',
            margin: '0 0 28px 0',
            textAlign: 'center',
            color: HUB_THEME.textMuted,
            lineHeight: 1.55,
          }}
        >
          Thank you for supporting <em>The Agnes Protocol</em>. We&apos;re excited for you to begin
          the journey.
        </p>

        <Suspense
          fallback={
            <div style={{ textAlign: 'center', padding: '16px', color: HUB_THEME.textMuted }}>
              Confirming your order…
            </div>
          }
        >
          <OrderConfirmationClient sessionId={sessionId} />
        </Suspense>
      </div>
    </div>
  );
}
