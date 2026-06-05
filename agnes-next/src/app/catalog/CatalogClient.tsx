'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useMemo, useEffect, useState, useRef } from 'react';
import { PRODUCTS, type ProductId } from '@/lib/products';
import { trackTikTok } from '@/lib/tiktokPixel';
import { trackMeta } from '@/lib/metaPixel';

function isDigitalDownloadProduct(id: ProductId) {
  return id === 'ebook' || id === 'audio_preorder';
}

export default function CatalogClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Dev-only log: log prices once per load
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[catalog] prices', PRODUCTS.map(p => ({ id: p.id, price: p.displayPrice })));
    }
  }, []);

  const browseFiredRef = useRef(false);
  useEffect(() => {
    if (browseFiredRef.current) return;
    browseFiredRef.current = true;
    trackTikTok('Browse', {
      content_type: 'product_group',
      content_name: 'The Agnes Protocol Catalog',
    });
    trackMeta('ViewContent', {
      content_type: 'product_group',
      content_name: 'The Agnes Protocol Catalog',
      content_ids: PRODUCTS.map((p) => p.id),
    });
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

  const [walletHintEligible, setWalletHintEligible] = useState(false);

  useEffect(() => {
    try {
      const ApplePaySession = (
        window as Window & { ApplePaySession?: { canMakePayments?: () => boolean } }
      ).ApplePaySession;
      setWalletHintEligible(
        typeof ApplePaySession?.canMakePayments === 'function' && ApplePaySession.canMakePayments()
      );
    } catch {
      setWalletHintEligible(false);
    }
  }, []);

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

              {isDigitalDownloadProduct(product.id) && (
                <div style={{ marginBottom: '16px', textAlign: 'left' }}>
                  <p
                    style={{
                      margin: '0 0 8px 0',
                      fontSize: '14px',
                      lineHeight: 1.45,
                      color: 'rgba(245, 245, 245, 0.58)',
                      fontWeight: 400,
                    }}
                  >
                    You&apos;ll receive your download instantly after checkout is completed.
                  </p>
                  {walletHintEligible ? (
                    <p
                      style={{
                        margin: 0,
                        fontSize: '12px',
                        lineHeight: 1.45,
                        color: 'rgba(245, 245, 245, 0.48)',
                      }}
                    >
                      Tap Apple Pay and complete confirmation to receive your download.
                    </p>
                  ) : (
                    <p
                      style={{
                        margin: 0,
                        fontSize: '12px',
                        lineHeight: 1.45,
                        color: 'rgba(245, 245, 245, 0.48)',
                      }}
                    >
                      On Stripe checkout, finish Link or wallet prompts completely—your download
                      arrives only after payment succeeds.
                    </p>
                  )}
                </div>
              )}

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

        <p
          style={{
            marginTop: '40px',
            maxWidth: '520px',
            marginLeft: 'auto',
            marginRight: 'auto',
            textAlign: 'center',
            fontSize: '13px',
            lineHeight: 1.5,
            color: 'rgba(245, 245, 245, 0.45)',
          }}
        >
          If you didn&apos;t receive an email, your purchase likely didn&apos;t complete. You can
          safely try again.
        </p>
      </div>
    </main>
  );
}
