'use client';

import { Suspense } from 'react';
import ContestClient from './ContestClient';

export default function ContestPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            backgroundColor: 'black',
            color: 'white',
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <p>Loading…</p>
        </div>
      }
    >
      <ContestClient />
    </Suspense>
  );
}
