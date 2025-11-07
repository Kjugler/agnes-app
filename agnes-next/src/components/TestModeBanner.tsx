'use client';

import { useEffect, useState } from 'react';

/**
 * Dev banner that shows "TEST MODE" when Stripe test keys are detected
 * Only renders in development mode
 */
export default function TestModeBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Only show in development
    if (process.env.NODE_ENV === 'production') {
      return;
    }

    // Check if publishable key is a test key
    const publishableKey =
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
    
    if (publishableKey.startsWith('pk_test_')) {
      setShowBanner(true);
    }
  }, []);

  if (!showBanner) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: '#ff6b6b',
        color: 'white',
        textAlign: 'center',
        padding: '8px',
        fontSize: '12px',
        fontWeight: 'bold',
        zIndex: 9999,
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
      }}
    >
      🧪 TEST MODE — Using Stripe test keys
    </div>
  );
}

