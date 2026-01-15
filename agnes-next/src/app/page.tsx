'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { clearIdentityStorage } from '@/lib/identity/clearIdentity';

function chooseVariant(): 'terminal' | 'protocol' {
  if (typeof window === 'undefined') return 'protocol';
  
  // Check query param first (if deepquill passed it)
  const params = new URLSearchParams(window.location.search);
  const queryVariant = params.get('entry');
  if (queryVariant === 'terminal' || queryVariant === 'protocol') {
    localStorage.setItem('dq_entry_variant', queryVariant);
    return queryVariant;
  }
  
  // Check localStorage first (deepquill sets this as 'dq_entry_variant')
  const stored = localStorage.getItem('dq_entry_variant');
  if (stored === 'terminal' || stored === 'protocol') {
    return stored;
  }
  
  // Fallback: check old 'entry_variant' key for backwards compatibility
  const oldStored = localStorage.getItem('entry_variant');
  if (oldStored === 'terminal' || oldStored === 'protocol') {
    localStorage.setItem('dq_entry_variant', oldStored);
    return oldStored;
  }
  
  // Check cookie as fallback (set by deepquill or middleware)
  const cookieVariant = document.cookie
    .split(';')
    .find(c => c.trim().startsWith('dq_entry_variant='))
    ?.split('=')[1];
  
  if (cookieVariant === 'terminal' || cookieVariant === 'protocol') {
    localStorage.setItem('dq_entry_variant', cookieVariant);
    return cookieVariant;
  }
  
  // No variant exists - assign randomly 50/50 (fallback for direct navigation to /)
  const v = Math.random() < 0.5 ? 'terminal' : 'protocol';
  localStorage.setItem('dq_entry_variant', v);
  
  // Also set cookie for consistency
  const isNgrok = window.location.hostname.includes('ngrok-free.dev') || 
                  window.location.hostname.includes('ngrok.io');
  const needsSecureCookies = isNgrok || process.env.NODE_ENV === 'production';
  const sameSite = needsSecureCookies ? 'None' : 'Lax';
  const secure = needsSecureCookies ? '; Secure' : '';
  
  document.cookie = `dq_entry_variant=${v}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=${sameSite}${secure}`;
  
  return v;
}

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Handle fresh=1 param: clear identity storage before redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get('fresh') === '1') {
      console.log('[entry] fresh=1 detected, clearing identity storage');
      clearIdentityStorage();
      
      // Remove fresh=1 from URL so redirect doesn't include it
      params.delete('fresh');
      const newQs = params.toString();
      const newUrl = `${window.location.pathname}${newQs ? `?${newQs}` : ''}`;
      window.history.replaceState({}, '', newUrl);
    }
    
    // Preserve all query params (fresh=1 already removed if present)
    const qs = window.location.search || '';
    const variant = chooseVariant();

    if (variant === 'protocol') {
      router.replace(`/the-protocol-challenge${qs}`);
      return;
    }

    // Terminal variant: redirect to lightening page (IBM terminal emulator entry)
    router.replace(`/lightening${qs}`);
  }, [router, searchParams]);

  // Show minimal loading state during redirect
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#000',
        color: '#00ffe0',
        fontFamily: '"Courier New", monospace',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Loading...</div>
        <div style={{ fontSize: '0.875rem', opacity: 0.7 }}>Preparing your entry experience</div>
      </div>
    </div>
  );
}

