import { Suspense } from 'react';
import ContestSignupClient from './ContestSignupClient';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ContestSignupClient />
    </Suspense>
  );
}
