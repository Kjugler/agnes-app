import React, { Suspense } from 'react';
import JodyVerifyClient from './JodyVerifyClient';

export default function JodyVerifyPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100svh',
            backgroundColor: '#000',
            color: '#00ffe5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          Verifying…
        </div>
      }
    >
      <JodyVerifyClient />
    </Suspense>
  );
}
