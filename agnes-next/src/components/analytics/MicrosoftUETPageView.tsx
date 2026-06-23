'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { isMicrosoftUetEnabled, pageMicrosoftUet } from '@/lib/microsoftUet';

/** Fires UET page_view on client-side route changes (initial pageLoad handled by MicrosoftUET). */
export default function MicrosoftUETPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const isFirstRef = useRef(true);

  useEffect(() => {
    if (!isMicrosoftUetEnabled()) return;

    if (isFirstRef.current) {
      isFirstRef.current = false;
      return;
    }

    const pagePath = search ? `${pathname}?${search}` : pathname;
    pageMicrosoftUet(pagePath);
  }, [pathname, search]);

  return null;
}
