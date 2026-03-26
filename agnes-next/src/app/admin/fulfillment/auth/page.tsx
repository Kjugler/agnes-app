import { Suspense } from 'react';
import AuthPageClient from './AuthPageClient';

export default function FulfillmentAuthPage() {
  return (
    <Suspense fallback={<div />}>
      <AuthPageClient />
    </Suspense>
  );
}
