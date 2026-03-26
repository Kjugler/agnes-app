'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import GlitchIntro from './GlitchIntro';
import { LoadingScreen } from './LoadingScreen';
import TerminalEmulator from './TerminalEmulator';

/**
 * TerminalClient: Embed-mode terminal flow.
 * - If user already completed terminal (terminal_discovery_complete), redirect to Contest Hub
 * - GlitchIntro plays once (dq_seen_terminal_intro)
 * - LoadingScreen if !skipLoad
 * - TerminalEmulator when ready
 */
export default function TerminalClient() {
  const router = useRouter();
  const [isLoaded, setIsLoaded] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [shouldRedirect, setShouldRedirect] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // User already completed terminal → never show again
    const hasCompleted = document.cookie
      .split(';')
      .some((c) => c.trim().startsWith('terminal_discovery_complete=1'));
    if (hasCompleted) {
      setShouldRedirect(true);
      router.replace('/contest');
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const skipLoad = params.get('skipLoad') === '1';
    const isEmbedMode = params.get('embed') === '1' || window !== window.top;
    const fromLightning = params.get('fromLightning') === '1';

    if (isEmbedMode) {
      // Post-lightning bridge already played THE AGNES PROTOCOL glitch — don't repeat here.
      if (fromLightning) {
        setShowIntro(false);
      } else {
        const seenIntro = localStorage.getItem('dq_seen_terminal_intro');
        setShowIntro(seenIntro !== 'true');
      }

      if (skipLoad) {
        setIsLoaded(true);
      }
    } else {
      setShowIntro(false);
      if (skipLoad) setIsLoaded(true);
    }
  }, [router]);

  const handleGlitchComplete = () => {
    setShowIntro(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('dq_seen_terminal_intro', 'true');
    }
  };

  const handleLoadingComplete = () => {
    setIsLoaded(true);
  };

  const showContent = isLoaded && !showIntro && !shouldRedirect;

  if (shouldRedirect) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#00ff66',
          fontFamily: 'monospace',
        }}
      >
        Redirecting...
      </div>
    );
  }

  return (
    <>
      {showIntro && (
        <GlitchIntro
          onComplete={handleGlitchComplete}
          skipIfSeen={true}
          localStorageKey="dq_seen_terminal_intro"
        />
      )}

      {!isLoaded && (
        <LoadingScreen onComplete={handleLoadingComplete} />
      )}

      <div
        className="min-h-screen transition-opacity duration-700 bg-black text-gray-100"
        style={{
          opacity: showContent ? 1 : 0,
          display: showContent ? 'block' : 'none',
        }}
      >
        {showContent && <TerminalEmulator />}
      </div>
    </>
  );
}
