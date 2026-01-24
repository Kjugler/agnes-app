import { Suspense } from 'react';
import TruthShareClient from './TruthShareClient';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TruthShareClient />
    </Suspense>
  );
}
