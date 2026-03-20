'use client';

import { Suspense } from 'react';
import CheckoutClient from './CheckoutClient';

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <main
          style={{
            minHeight: '100vh',
            background: '#0a0a0a',
            color: '#f5f5f5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <p style={{ fontSize: '18px' }}>Loading…</p>
        </main>
      }
    >
      <CheckoutClient />
    </Suspense>
  );
}
