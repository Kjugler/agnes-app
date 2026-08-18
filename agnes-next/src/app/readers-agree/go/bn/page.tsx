import { Suspense } from 'react';
import ReviewRedirectClient from '../ReviewRedirectClient';
import { BARNES_NOBLE_REVIEWS_URL } from '@/lib/readerRecommendationLanding';

function LoadingFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#050505',
        color: '#888',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      Loading…
    </div>
  );
}

export default function BarnesNobleReviewRedirectPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ReviewRedirectClient
        heading="Opening Barnes & Noble Reviews…"
        destinationUrl={BARNES_NOBLE_REVIEWS_URL}
        retailerLabel="Barnes & Noble"
        retailerOrigin="bn"
      />
    </Suspense>
  );
}
