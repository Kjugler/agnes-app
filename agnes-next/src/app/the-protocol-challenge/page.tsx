import { Suspense } from 'react';
import ProtocolChallengeClient from './ProtocolChallengeClient';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ProtocolChallengeClient />
    </Suspense>
  );
}
