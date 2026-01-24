import { Suspense } from 'react';
import ShareLandingClient from './ShareLandingClient';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ShareLandingClient />
    </Suspense>
  );
}
