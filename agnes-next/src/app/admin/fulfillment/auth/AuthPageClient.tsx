'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function AuthPageClient() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/admin/fulfillment/labels';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setError('Token is required');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/fulfillment/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), redirect: redirectTo }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to authenticate');
      }

      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to authenticate');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '48px 24px', maxWidth: '400px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '24px', fontSize: '24px' }}>
        Fulfillment Access
      </h1>
      <p style={{ marginBottom: '24px', color: '#555' }}>
        Enter the fulfillment access token to continue.
      </p>

      <form onSubmit={handleSubmit}>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Fulfillment token"
          autoComplete="off"
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px 16px',
            fontSize: '16px',
            border: '1px solid #ccc',
            borderRadius: '8px',
            marginBottom: '16px',
          }}
        />

        {error && (
          <div
            style={{
              padding: '12px',
              background: '#fee',
              border: '1px solid #fcc',
              borderRadius: '8px',
              marginBottom: '16px',
              color: '#c00',
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px 24px',
            background: '#0070f3',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
