import { Suspense } from 'react';
import BadgeClient from './BadgeClient';

export default function BadgePage() {
  return (
    <Suspense fallback={<div />}>
      <BadgeClient />
    </Suspense>
  );
}


