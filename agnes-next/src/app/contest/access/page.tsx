'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import RequestAccessModal from '@/components/auth/RequestAccessModal';
import CinematicVideo from '@/components/CinematicVideo';

function ContestAccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isChecking, setIsChecking] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // A: Check auth status on load
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/associate/status', {
          credentials: 'include',
        });

        if (res.ok) {
          const data = await res.json();
          
          // A: If already authenticated (has associate / user identity) → redirect to /contest
          // Anonymous response (hasAssociate: false, no id/email) → show login modal
          const isAuthenticated =
            data?.hasAssociate === true || (data?.id || data?.email);
          if (data?.ok && isAuthenticated) {
            console.log('[contest/access] Already authenticated, redirecting to /contest', {
              userId: data.id,
              email: data.email,
              contestJoined: data.contestJoined,
            });
            // Preserve query params (from, v, etc.)
            const params = new URLSearchParams(searchParams.toString());
            const redirectUrl = `/contest${params.toString() ? `?${params.toString()}` : ''}`;
            router.replace(redirectUrl);
            return;
          }
        }
        
        // A: Not authenticated → show modal
        console.log('[contest/access] Not authenticated, showing modal');
        setShowModal(true);
        setIsChecking(false);
      } catch (err) {
        console.error('[contest/access] Error checking auth status:', err);
        // On error, show modal anyway (better UX than blank page)
        setShowModal(true);
        setIsChecking(false);
      }
    };

    checkAuth();
  }, [router, searchParams]);

  // Compute redirect URL preserving query params
  const getRedirectUrl = () => {
    const params = new URLSearchParams(searchParams.toString());
    // Remove 'from' if it's 'protocol-challenge' (already captured)
    return `/contest${params.toString() ? `?${params.toString()}` : ''}`;
  };

  if (isChecking) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#000',
        color: '#00ffe0',
        fontFamily: "'Courier New', monospace",
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div>Checking access...</div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#000',
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* Background video (optional - same as Protocol Challenge) */}
      <div style={{
        position: 'absolute',
        inset: 0,
        opacity: 0.25,
        zIndex: 0,
        pointerEvents: 'none',
      }}>
        <CinematicVideo
          src="/videos/Helen-Agnes.mp4"
          autoUnmute={false}
          mode="fullscreen"
        />
      </div>

      {/* Dark overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        zIndex: 1,
      }} />

      {/* Centered modal content */}
      <div style={{
        position: 'relative',
        zIndex: 2,
        width: '100%',
        maxWidth: '600px',
        padding: '2rem',
      }}>
        {showModal && (
          <RequestAccessModal
            isOpen={showModal}
            onSuccess={() => {
              // After successful login, redirect to /contest with preserved params
              const redirectUrl = getRedirectUrl();
              router.replace(redirectUrl);
            }}
            redirectTo={getRedirectUrl()}
          />
        )}
      </div>
    </div>
  );
}

export default function ContestAccessPage() {
  return (
    <Suspense
      fallback={
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#000',
          color: '#00ffe0',
          fontFamily: "'Courier New', monospace",
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div>Loading...</div>
        </div>
      }
    >
      <ContestAccessContent />
    </Suspense>
  );
}
