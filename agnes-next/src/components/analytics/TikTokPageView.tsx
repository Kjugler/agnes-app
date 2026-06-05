'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { isTikTokEnabled, pageTikTok } from '@/lib/tiktokPixel';

/** Fires ttq.page() on client-side route changes (initial pageview handled by TikTokPixel load). */
export default function TikTokPageView() {
  const pathname = usePathname();
  const isFirstRef = useRef(true);

  useEffect(() => {
    if (!isTikTokEnabled()) return;

    if (isFirstRef.current) {
      isFirstRef.current = false;
      return;
    }

    pageTikTok();
  }, [pathname]);

  return null;
}
