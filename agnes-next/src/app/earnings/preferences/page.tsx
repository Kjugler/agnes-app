'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { readAssociate } from '@/lib/identity';

export default function EarningsPreferencesPage() {
  const router = useRouter();
  const [associate, setAssociate] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = readAssociate();
    setAssociate(stored);
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
        <p>Loading...</p>
      </main>
    );
  }

  if (!associate) {
    return (
      <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Earnings Preferences</h1>
        <p>Please sign in to update your payout preferences.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Update Payout Method</h1>
      <p style={{ marginBottom: '2rem', color: '#666' }}>
        Choose how you'd like to receive your referral earnings.
      </p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Venmo</h2>
          <p style={{ color: '#666', fontSize: '0.9rem' }}>
            Send your earnings directly to your Venmo account.
          </p>
          <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#999' }}>
            Coming soon. For now, please reply to your commission email with your Venmo handle.
          </p>
        </div>

        <div style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Direct Deposit</h2>
          <p style={{ color: '#666', fontSize: '0.9rem' }}>
            Have your earnings deposited directly into your bank account.
          </p>
          <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#999' }}>
            Coming soon. For now, please reply to your commission email with your bank details.
          </p>
        </div>

        <div style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Physical Check</h2>
          <p style={{ color: '#666', fontSize: '0.9rem' }}>
            Receive a physical check mailed to your address.
          </p>
          <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#999' }}>
            Coming soon. For now, please reply to your commission email with your mailing address.
          </p>
        </div>
      </div>

      <p style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#f0f0f0', borderRadius: '8px', fontSize: '0.9rem' }}>
        <strong>Note:</strong> To set up your payout method now, simply reply to your commission email with your preferred method and the necessary details (Venmo handle, bank account info, or mailing address).
      </p>
    </main>
  );
}

