'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useMemo, useEffect } from 'react';
import { PRODUCTS } from '@/lib/products';

export default function CatalogPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Dev-only log: log prices once per load
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[catalog] prices', PRODUCTS.map(p => ({ id: p.id, price: p.displayPrice })));
    }
  }, []);

  // Preserve all tracking params
  const trackingParams = useMemo(() => {
    const params = new URLSearchParams();
    const keysToPreserve = ['ref', 'src', 'v', 'origin', 'code', 'utm_source', 'utm_medium', 'utm_campaign'];
    
    keysToPreserve.forEach(key => {
      const value = searchParams.get(key);
      if (value) {
        params.set(key, value);
      }
    });
    
    return params;
  }, [searchParams]);

  const handleBuyClick = (product: 'paperback' | 'ebook' | 'audio_preorder') => {
    const params = new URLSearchParams(trackingParams);
    params.set('product', product);
    router.push(`/checkout?${params.toString()}`);
  };

  return (
    <main style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      color: '#f5f5f5',
      padding: '48px 24px',
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        {/* Trust block */}
        <div style={{
          background: '#111111',
          border: '1px solid #222222',
          borderRadius: '8px',
          padding: '16px 24px',
          marginBottom: '32px',
          fontSize: '14px',
          lineHeight: '1.6',
          color: '#d0d0d0',
        }}>
          <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', color: '#f5f5f5' }}>
            Stripe Test Mode — No real charges.
          </p>
          <p style={{ margin: '0 0 8px 0' }}>
            Use test card: <code style={{ background: '#222', padding: '2px 6px', borderRadius: '4px' }}>4242 4242 4242 4242</code>
          </p>
          <p style={{ margin: 0 }}>
            If you experience any issues while testing the site, forward details to{' '}
            <a href="mailto:hello@theagnesprotocol.com" style={{ color: '#00ff7f', textDecoration: 'underline' }}>
              hello@theagnesprotocol.com
            </a>
          </p>
        </div>

        {/* Product cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '24px',
        }}>
          {PRODUCTS.map((product) => (
            <div
              key={product.id}
              style={{
                background: '#111111',
                border: '1px solid #222222',
                borderRadius: '8px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <h2 style={{
                margin: '0 0 8px 0',
                fontSize: '24px',
                fontWeight: 'bold',
                color: '#f5f5f5',
              }}>
                {product.title}
              </h2>
              
              <p style={{
                margin: '0 0 16px 0',
                fontSize: '15px',
                color: '#d0d0d0',
                flex: 1,
              }}>
                {product.description}
              </p>

              <div style={{
                marginBottom: '24px',
                fontSize: '20px',
                fontWeight: 'bold',
                color: '#00ff7f',
              }}>
                {product.displayPrice}
              </div>

              <button
                onClick={() => handleBuyClick(product.id)}
                style={{
                  padding: '12px 24px',
                  background: '#00ff7f',
                  color: '#000',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = '#00e070';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = '#00ff7f';
                }}
              >
                Buy
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

