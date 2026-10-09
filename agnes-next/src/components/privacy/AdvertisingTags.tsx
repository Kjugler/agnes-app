'use client';

import { Suspense } from 'react';
import GoogleTagManager from '@/components/analytics/GoogleTagManager';
import TikTokPixel from '@/components/analytics/TikTokPixel';
import MetaPixel from '@/components/analytics/MetaPixel';
import MicrosoftUET from '@/components/analytics/MicrosoftUET';
import GoogleAds from '@/components/analytics/GoogleAds';
import TikTokPageView from '@/components/analytics/TikTokPageView';
import MetaPageView from '@/components/analytics/MetaPageView';
import MicrosoftUETPageView from '@/components/analytics/MicrosoftUETPageView';
import GoogleAdsPageView from '@/components/analytics/GoogleAdsPageView';
import { useAdvertisingConsent } from '@/components/privacy/PrivacyConsentRoot';

export default function AdvertisingTags() {
  const snapshot = useAdvertisingConsent();
  if (!snapshot.allowed) return null;

  const uetConsentMode = snapshot.region === 'EU' ? 'granted' : 'us-default';

  return (
    <>
      <GoogleTagManager />
      <TikTokPixel />
      <MetaPixel />
      <MicrosoftUET consentMode={uetConsentMode} />
      <GoogleAds />
      <Suspense fallback={null}>
        <TikTokPageView />
        <MetaPageView />
        <MicrosoftUETPageView />
        <GoogleAdsPageView />
      </Suspense>
    </>
  );
}
