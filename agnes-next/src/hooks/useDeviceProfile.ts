'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export interface DeviceProfile {
  isMobile: boolean;
  isIOS: boolean;
  /** True when mobile and not iOS (Android, etc.) */
  isAndroid: boolean;
  canNativeShare: boolean;
  /** True when likely Gmail/Facebook/Instagram in-app webview (blocks downloads) */
  isInAppBrowser: boolean;
}

const MOBILE_BREAKPOINT = 768;

export function useDeviceProfile(): DeviceProfile {
  const searchParams = useSearchParams();

  const [profile, setProfile] = useState<DeviceProfile>({
    isMobile: false,
    isIOS: false,
    isAndroid: false,
    canNativeShare: false,
    isInAppBrowser: false,
  });

  useEffect(() => {
    const compute = () => {
      const mobileOverride = searchParams.get('mobile');
      const desktopOverride = searchParams.get('desktop');

      let isMobile = false;
      let isIOS = false;
      let isAndroid = false;
      let canNativeShare = false;
      let isInAppBrowser = false;

      if (desktopOverride === '1') {
        isMobile = false;
      } else if (mobileOverride === '1') {
        isMobile = true;
      } else if (typeof window !== 'undefined') {
        const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
        const narrowWidth = window.innerWidth < MOBILE_BREAKPOINT;
        isMobile = coarsePointer || narrowWidth;

        const ua = navigator.userAgent || '';
        const platform = navigator.platform || '';
        isIOS =
          /iPad|iPhone|iPod/.test(ua) ||
          (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        isAndroid = isMobile && !isIOS;

        canNativeShare = typeof navigator.share === 'function';

        // In-app webviews (Gmail, FB, IG) block downloads; detect for "Open in Safari" prompt
        isInAppBrowser = isIOS && /Gmail|FBAN|FBAV|Instagram/i.test(ua);
      }

      setProfile({ isMobile, isIOS, isAndroid, canNativeShare, isInAppBrowser });
    };

    compute();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', compute);
      return () => window.removeEventListener('resize', compute);
    }
  }, [searchParams]);

  return profile;
}
