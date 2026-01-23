import { Suspense } from 'react';
import AscensionClient from './AscensionClient';

export default function AscensionPage() {
  return (
    <Suspense fallback={<div />}>
      <AscensionClient />
    </Suspense>
  );
}
