import { Suspense } from 'react';
import SuccessClient from './SuccessClient';

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<div />}>
      <SuccessClient />
    </Suspense>
  );
}
