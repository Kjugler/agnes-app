'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { startCheckout } from '@/lib/checkout';
import { readContestEmail } from '@/lib/identity';

// Helper to check if referral traffic (has ap_ref_code cookie)
function isReferralTraffic(): boolean {
  if (typeof document === 'undefined') return false;
  const cookies = document.cookie.split(';');
  return cookies.some(c => c.trim().startsWith('ap_ref_code='));
}

// Helper to get checkout email from cookie or sessionStorage
function getCheckoutEmail(): string | null {
  if (typeof document === 'undefined') return null;
  
  // Try cookie first
  const cookies = document.cookie.split(';');
  const checkoutEmailCookie = cookies.find(c => c.trim().startsWith('ap_checkout_email='));
  if (checkoutEmailCookie) {
    try {
      return decodeURIComponent(checkoutEmailCookie.split('=')[1]?.trim() || '');
    } catch {
      // Invalid cookie, continue to sessionStorage
    }
  }
  
  // Fallback to sessionStorage
  try {
    return sessionStorage.getItem('ap_checkout_email');
  } catch {
    return null;
  }
}

// Helper to set checkout email cookie and sessionStorage
function setCheckoutEmail(email: string): void {
  if (typeof document === 'undefined') return;
  
  const maxAge = 24 * 60 * 60; // 1 day
  const cookieOptions = `path=/; max-age=${maxAge}; SameSite=Lax`;
  document.cookie = `ap_checkout_email=${encodeURIComponent(email)}; ${cookieOptions}`;
  
  try {
    sessionStorage.setItem('ap_checkout_email', email);
  } catch {
    // sessionStorage not available, continue
  }
}

export default function CheckoutPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [checkoutEmail, setCheckoutEmailState] = useState('');
  const checkoutInFlightRef = useRef(false); // Guard against double checkout calls

  const proceedWithCheckout = (product: 'paperback' | 'ebook' | 'audio_preorder') => {
    // Guard against double checkout calls
    if (checkoutInFlightRef.current) {
      console.warn('[checkout] Checkout already in flight, ignoring duplicate call');
      return;
    }
    
    checkoutInFlightRef.current = true;
    setLoading(true);
    
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

    // Get checkout email if referral traffic (from cookie or state)
    const checkoutEmailForRequest = getCheckoutEmail();

    // Initiate checkout
    startCheckout({
      product,
      qty: 1,
      source: 'catalog',
      successPath: '/contest/thank-you',
      cancelPath: '/catalog',
      checkoutEmail: checkoutEmailForRequest || undefined, // Pass checkoutEmail for referral traffic
      metadata,
    })
      .catch((err: any) => {
        checkoutInFlightRef.current = false; // Reset on error
        setError(err?.message || 'Failed to start checkout. Please try again.');
        setLoading(false);
      });
    // Note: checkoutInFlightRef stays true on success (redirect happens)
  };

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

    // Check if user has contest email (logged-in contest user)
    const contestEmail = readContestEmail();
    
    // Check if referral traffic
    const isReferral = isReferralTraffic();
    
    // For referral traffic without contest email: show email form
    if (isReferral && !contestEmail) {
      // Check if checkout email already exists
      const existingCheckoutEmail = getCheckoutEmail();
      if (existingCheckoutEmail) {
        // Already have email, proceed with checkout
        proceedWithCheckout(product);
      } else {
        // Show email form
        setShowEmailForm(true);
        return;
      }
    } else if (!contestEmail && !isReferral) {
      // Not referral traffic and no email: redirect to contest
      router.replace('/contest?redirect=checkout');
      return;
    } else {
      // Has contest email OR is referral traffic: proceed normally
      // The API route will handle getting contestUserId from the email
      proceedWithCheckout(product);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router]);

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Guard against double submission
    if (checkoutInFlightRef.current || loading) {
      console.warn('[checkout] Checkout already in flight, ignoring duplicate submit');
      return;
    }
    
    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(checkoutEmail.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    
    // Set email cookie and sessionStorage
    setCheckoutEmail(checkoutEmail.trim());
    
    // Proceed with checkout
    const product = searchParams.get('product') as 'paperback' | 'ebook' | 'audio_preorder' | null;
    if (!product) {
      setError('No product specified.');
      return;
    }
    
    checkoutInFlightRef.current = true;
    setShowEmailForm(false);
    setLoading(true);
    
    // Extract tracking params
    const ref = searchParams.get('ref');
    const src = searchParams.get('src');
    const v = searchParams.get('v');
    const origin = searchParams.get('origin');
    const code = searchParams.get('code');

    // Build metadata with tracking params
    const metadata: Record<string, string> = {
      source: 'catalog',
    };
    
    if (ref) metadata.ref = ref;
    if (src) metadata.src = src;
    if (v) metadata.v = v;
    if (origin) metadata.origin = origin;
    if (code) metadata.code = code;

    startCheckout({
      product,
      qty: 1,
      source: 'catalog',
      successPath: '/contest/thank-you',
      cancelPath: '/catalog',
      checkoutEmail: checkoutEmail.trim(), // Pass checkoutEmail from form
      metadata,
    })
      .catch((err: any) => {
        checkoutInFlightRef.current = false; // Reset on error
        setError(err?.message || 'Failed to start checkout. Please try again.');
        setLoading(false);
      });
    // Note: checkoutInFlightRef stays true on success (redirect happens)
  };

  // Show email form for referral traffic
  if (showEmailForm) {
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
          border: '1px solid #222222',
          borderRadius: '8px',
          padding: '32px',
          maxWidth: '500px',
          width: '100%',
        }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '24px', fontWeight: 'bold' }}>
            Almost there!
          </h2>
          <p style={{ margin: '0 0 24px 0', color: '#d0d0d0', lineHeight: '1.6' }}>
            Where should we send your receipt + download link?
          </p>
          
          <form onSubmit={handleEmailSubmit}>
            <input
              type="email"
              value={checkoutEmail}
              onChange={(e) => setCheckoutEmailState(e.target.value)}
              placeholder="your@email.com"
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                background: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#f5f5f5',
                fontSize: '16px',
                marginBottom: '16px',
                boxSizing: 'border-box',
              }}
            />
            
            {error && (
              <p style={{ margin: '0 0 16px 0', color: '#ff4444', fontSize: '14px' }}>
                {error}
              </p>
            )}
            
            <button
              type="submit"
              disabled={loading || checkoutInFlightRef.current}
              style={{
                width: '100%',
                padding: '12px 24px',
                background: (loading || checkoutInFlightRef.current) ? '#333' : '#00ff7f',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: (loading || checkoutInFlightRef.current) ? 'not-allowed' : 'pointer',
                opacity: (loading || checkoutInFlightRef.current) ? 0.6 : 1,
              }}
            >
              {(loading || checkoutInFlightRef.current) ? 'Starting checkout...' : 'Continue to secure checkout'}
            </button>
          </form>
        </div>
      </main>
    );
  }

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

