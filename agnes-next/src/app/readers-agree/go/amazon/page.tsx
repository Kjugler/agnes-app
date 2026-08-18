import { Suspense } from 'react';
import AmazonGoClient from './AmazonGoClient';

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
      <AmazonGoClient />
    </Suspense>
  );
}
