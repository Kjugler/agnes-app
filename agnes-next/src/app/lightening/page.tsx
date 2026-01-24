import { Suspense } from 'react';
import LighteningClient from './LighteningClient';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LighteningClient />
    </Suspense>
  );
}
