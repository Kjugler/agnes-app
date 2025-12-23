'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { startCheckout } from '@/lib/checkout';
import { readContestEmail } from '@/lib/identity';

export default function CheckoutPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const product = searchParams.get('product') as 'paperback' | 'ebook' | 'audio_preorder' | null;
    
    if (!product) {
      setError('No product specified. Please select a product from the catalog.');
      return;
    }

    const validProducts = ['paperback', 'ebook', 'audio_preorder'];
    if (!validProducts.includes(product)) {
      setError(`Invalid product: ${product}. Please select a valid product.`);
      return;
    }

    // Check if user has contest email (required for checkout)
    const email = readContestEmail();
    if (!email) {
      // Redirect to contest entry if no email
      router.replace('/contest?redirect=checkout');
      return;
    }

    // Extract tracking params
    const ref = searchParams.get('ref');
    const src = searchParams.get('src');
    const v = searchParams.get('v');
    const origin = searchParams.get('origin');
    const code = searchParams.get('code'); // Also preserve 'code' param

    // Build metadata with tracking params
    const metadata: Record<string, string> = {
      source: 'catalog',
    };
    
    if (ref) metadata.ref = ref;
    if (src) metadata.src = src;
    if (v) metadata.v = v;
    if (origin) metadata.origin = origin;
    if (code) metadata.code = code;

    // Initiate checkout
    setLoading(true);
    startCheckout({
      product,
      qty: 1,
      source: 'catalog',
      successPath: '/contest/thank-you',
      cancelPath: '/catalog',
      metadata,
    })
      .catch((err: any) => {
        setError(err?.message || 'Failed to start checkout. Please try again.');
        setLoading(false);
      });
  }, [searchParams, router]);

  if (error) {
    return (
      <main style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#f5f5f5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}>
        <div style={{
          background: '#111111',
          border: '1px solid #ff4444',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '500px',
        }}>
          <h2 style={{ margin: '0 0 16px 0', color: '#ff4444' }}>Checkout Error</h2>
          <p style={{ margin: '0 0 24px 0', color: '#d0d0d0' }}>{error}</p>
          <button
            onClick={() => router.push('/catalog')}
            style={{
              padding: '10px 20px',
              background: '#00ff7f',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            Return to Catalog
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      color: '#f5f5f5',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        textAlign: 'center',
      }}>
        <p style={{ fontSize: '18px', margin: '0 0 16px 0' }}>
          {loading ? 'Starting checkout...' : 'Redirecting to checkout...'}
        </p>
        {loading && (
          <div style={{
            display: 'inline-block',
            width: '20px',
            height: '20px',
            border: '2px solid #333',
            borderTopColor: '#00ff7f',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
        )}
        <style jsx>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </main>
  );
}

