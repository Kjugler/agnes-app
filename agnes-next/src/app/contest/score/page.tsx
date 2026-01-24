import { Suspense } from 'react';
import ScoreClient from './ScoreClient';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ScoreClient />
    </Suspense>
  );
}
