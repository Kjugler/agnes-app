import { Suspense } from 'react';
import ReviewRedirectClient from '../ReviewRedirectClient';
import { AMAZON_REVIEWS_URL } from '@/lib/readerRecommendationLanding';

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

export default function AmazonReviewRedirectPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ReviewRedirectClient heading="Opening Amazon Reviews…" destinationUrl={AMAZON_REVIEWS_URL} />
    </Suspense>
  );
}
