import { Suspense } from 'react';
import ReviewRedirectClient from '../ReviewRedirectClient';
import { getReadersAgreeAmazonAttributionUrl } from '@/lib/readerRecommendationLanding';

/** Date-gated Amazon Attribution URL must be chosen at request time, not build time. */
export const dynamic = 'force-dynamic';

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
      <ReviewRedirectClient
        heading="Opening Amazon Reviews…"
        destinationUrl={getReadersAgreeAmazonAttributionUrl()}
        retailerLabel="Amazon"
      />
    </Suspense>
  );
}
