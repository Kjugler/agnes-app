'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { isMetaPixelEnabled, pageMeta } from '@/lib/metaPixel';

/** Fires fbq PageView on client-side route changes (initial pageview handled by MetaPixel init). */
export default function MetaPageView() {
  const pathname = usePathname();
  const isFirstRef = useRef(true);

  useEffect(() => {
    if (!isMetaPixelEnabled()) return;

    if (isFirstRef.current) {
      isFirstRef.current = false;
      return;
    }

    pageMeta();
  }, [pathname]);

  return null;
}
