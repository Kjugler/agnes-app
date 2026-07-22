'use client';

import Script from 'next/script';
import { getGoogleAdsId } from '@/lib/googleAds';

export default function GoogleAds() {
  const adsId = getGoogleAdsId();
  if (!adsId) return null;

  return (
    <>
      <Script
        id="google-ads-gtag-loader"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${adsId}`}
      />
      <Script
        id="google-ads-gtag-config"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${adsId}');
          `.trim(),
        }}
      />
    </>
  );
}
