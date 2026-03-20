'use client';

import { Suspense } from 'react';
import TruthShareClient from './TruthShareClient';

export default function TruthSharePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>}>
      <TruthShareClient />
    </Suspense>
  );
}
