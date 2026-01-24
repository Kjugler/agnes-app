import { Suspense } from 'react';
import SampleChaptersClient from './SampleChaptersClient';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SampleChaptersClient />
    </Suspense>
  );
}
