'use client';

/**
 * Fixed stress-test banner + content offset measured to match banner height.
 * Replaces a fixed padding guess (previously 110px) that was too small on mobile when copy wrapped.
 */
import { usePathname } from 'next/navigation';
import { useLayoutEffect, useRef, useState } from 'react';
import { STRESS_TEST_HEADLINE, STRESS_TEST_BUG_LINE } from '@/lib/stressTestMessage';

export default function StressTestChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const stressTest =
    process.env.NEXT_PUBLIC_STRESS_TEST_MODE === '1' || process.env.STRESS_TEST_MODE === '1';
  const hideBanner =
    pathname === '/lightening' ||
    pathname === '/contest' ||
    pathname?.startsWith('/contest/signup') ||
    pathname?.startsWith('/sample-chapters') ||
    pathname === '/contest/score';
  const showBanner = stressTest && !hideBanner;

  const bannerRef = useRef<HTMLDivElement>(null);
  const [contentPad, setContentPad] = useState(0);

  useLayoutEffect(() => {
    if (!showBanner) {
      setContentPad(0);
      return;
    }
    const el = bannerRef.current;
    if (!el) return;

    const update = () => {
      setContentPad(Math.ceil(el.getBoundingClientRect().height));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [showBanner, pathname]);

  return (
    <>
      {showBanner && (
        <div
          ref={bannerRef}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 99999,
            backgroundColor: '#1a1a1a',
            borderBottom: '2px solid #00ff7f',
            paddingLeft: 20,
            paddingRight: 20,
            paddingBottom: 12,
            paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))',
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
      )}
      <div style={{ paddingTop: contentPad }}>{children}</div>
    </>
  );
}
