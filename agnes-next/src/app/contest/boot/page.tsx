'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function Boot() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const code = params.get('code') || '';
    const email = params.get('email') || '';

    try {
      if (code) {
        localStorage.setItem('discount_code', code);
        localStorage.setItem('ap_code', code); // Also set as associate publisher code
      }
      if (email) {
        localStorage.setItem('user_email', email);
      }
    } catch (err) {
      console.warn('[boot] localStorage error:', err);
    }

    // Optional: bind session on server
    if (code || email) {
      fetch('/api/session/bind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, email, source: 'vite-boot' }),
      }).catch(() => {
        // Silently fail if endpoint doesn't exist
      });
    }

    // Redirect to lightening page (with optional next override)
    const next = params.get('next') || '/lightening';
    router.replace(next);
  }, [router, params]);

  // Show minimal loading state
  return (
    <div className="min-h-screen bg-black flex items-center justify-center text-green-500 font-mono">
      <div className="text-center">
        <div className="animate-pulse">Booting...</div>
      </div>
    </div>
  );
}

