import { Suspense } from 'react';
import ContestClient from './ContestClient';

export default function ContestPage() {
  return (
    <Suspense fallback={<div />}>
      <ContestClient />
    </Suspense>
  );
}
