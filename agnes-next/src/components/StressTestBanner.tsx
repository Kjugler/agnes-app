'use client';

/**
 * SPEC 4 — Public Stress Test Mode banner.
 * Shown when STRESS_TEST_MODE=1 in env.
 * Hidden on /lightening, /contest, /contest/signup, /sample-chapters, /contest/score (have their own messaging).
 */
import { usePathname } from 'next/navigation';
import { STRESS_TEST_HEADLINE, STRESS_TEST_BUG_LINE } from '@/lib/stressTestMessage';

export default function StressTestBanner() {
  const pathname = usePathname();
  const enabled = process.env.NEXT_PUBLIC_STRESS_TEST_MODE === '1' || process.env.STRESS_TEST_MODE === '1';
  if (!enabled) return null;
  const hideBanner =
    pathname === '/lightening' ||
    pathname === '/contest' ||
    pathname?.startsWith('/contest/signup') ||
    pathname?.startsWith('/sample-chapters') ||
    pathname === '/contest/score';
  if (hideBanner) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        backgroundColor: '#1a1a1a',
        borderBottom: '2px solid #00ff7f',
        padding: '12px 20px',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '13px',
        lineHeight: 1.5,
        color: '#e0e0e0',
        textAlign: 'center',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ fontWeight: 700, color: '#00ff7f', marginBottom: '6px', fontSize: '14px' }}>
        {STRESS_TEST_HEADLINE}
      </div>
      <div style={{ marginBottom: '4px' }}>
        Everything you see is a simulation. No real charges. No real deliveries.
      </div>
      <div style={{ marginBottom: '6px' }}>
        Your mission: try to break the system. Invite friends. Buy books. Earn points. Report anything strange.
      </div>
      <div style={{ fontSize: '12px', color: '#00ff7f' }}>
        <a href="mailto:hello@theagnesprotocol.com" style={{ color: '#00ff7f', textDecoration: 'underline' }}>
          {STRESS_TEST_BUG_LINE}
        </a>
      </div>
    </div>
  );
}
