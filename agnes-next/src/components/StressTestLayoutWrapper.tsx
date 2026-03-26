'use client';

/**
 * Wraps layout content with correct padding when stress test banner is shown.
 * Banner is hidden on /lightening, /contest, /contest/signup, /sample-chapters, /contest/score (have their own messaging).
 */
import { usePathname } from 'next/navigation';

export default function StressTestLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const stressTest = process.env.NEXT_PUBLIC_STRESS_TEST_MODE === '1' || process.env.STRESS_TEST_MODE === '1';
  const hideBanner =
    pathname === '/lightening' ||
    pathname === '/contest' ||
    pathname?.startsWith('/contest/signup') ||
    pathname?.startsWith('/sample-chapters') ||
    pathname === '/contest/score';
  const showBanner = stressTest && !hideBanner;
  return (
    <div style={{ paddingTop: showBanner ? 110 : 0 }}>
      {children}
    </div>
  );
}
