import { Suspense } from 'react';
import TikTokShareClient from './TikTokShareClient';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TikTokShareClient />
    </Suspense>
  );
}
