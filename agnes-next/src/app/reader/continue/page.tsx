import { Suspense } from 'react';
import ContinueReadingClient from './ContinueReadingClient';

export default function ContinueReadingPage() {
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
            fontFamily: '"Courier New", Courier, monospace',
          }}
        >
          Loading…
        </div>
      }
    >
      <ContinueReadingClient />
    </Suspense>
  );
}
