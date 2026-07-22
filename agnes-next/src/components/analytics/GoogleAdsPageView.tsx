'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { isGoogleAdsEnabled, pageGoogleAds } from '@/lib/googleAds';

/** Fires gtag config page_path on client-side route changes (initial load handled by GoogleAds). */
export default function GoogleAdsPageView() {
  const pathname = usePathname();
  const isFirstRef = useRef(true);

  useEffect(() => {
    if (!isGoogleAdsEnabled()) return;

    if (isFirstRef.current) {
      isFirstRef.current = false;
      return;
    }

    pageGoogleAds(pathname);
  }, [pathname]);

  return null;
}
