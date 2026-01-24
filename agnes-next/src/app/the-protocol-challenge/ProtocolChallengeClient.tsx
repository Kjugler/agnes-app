'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { clearIdentityStorage } from '@/lib/identity';
import { readContestEmail } from '@/lib/identity';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export default function ProtocolChallengeClient() {
  const playerRef = useRef<any>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [entryVariant, setEntryVariant] = useState<string | null>(null);
  const [showYouTubeOverlay, setShowYouTubeOverlay] = useState(true);
  const [showUnmuteOverlay, setShowUnmuteOverlay] = useState(true); // Default to true - show immediately
  const [userRequestedPlay, setUserRequestedPlay] = useState(false); // Flag for user click before player ready
  const [playerLoadingSlow, setPlayerLoadingSlow] = useState(false); // Flag for slow API loading
  const [isButtonHovered, setIsButtonHovered] = useState(false);

  // E4: Get variant for dev display
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Check cookie
    const cookieMatch = document.cookie.match(/entry_variant=([^;]+)/);
    if (cookieMatch) {
      setEntryVariant(cookieMatch[1]);
      return;
    }
    
    // Check localStorage
    const stored = localStorage.getItem('entry_variant');
    if (stored) {
      setEntryVariant(stored);
    } else {
      // Check URL override
      const params = new URLSearchParams(window.location.search);
      const entryOverride = params.get('entry');
      if (entryOverride === 'terminal' || entryOverride === 'protocol') {
        setEntryVariant(entryOverride);
      } else {
        setEntryVariant('protocol'); // Default for this page
      }
    }
  }, []);

  // Handle fresh=1 param: clear identity storage before rendering
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const params = new URLSearchParams(window.location.search);
    if (params.get('fresh') === '1') {
      console.log('[protocol-challenge] fresh=1 detected, clearing identity storage');
      clearIdentityStorage();
      
      // Remove fresh=1 from URL so refresh doesn't keep nuking state
      params.delete('fresh');
      const newQs = params.toString();
      const newUrl = `${window.location.pathname}${newQs ? `?${newQs}` : ''}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  // Inject ticker animation CSS directly to ensure it works
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if style already exists
    if (!document.getElementById('protocol-ticker-style')) {
      const style = document.createElement('style');
      style.id = 'protocol-ticker-style';
      style.textContent = `
        @keyframes ticker {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-100%);
          }
        }
        .ticker-text {
          animation: ticker 20s linear infinite !important;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Overlay is shown immediately (default state is true)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    console.log('[protocol] overlay shown (mount)');
  }, []);

  // Watchdog: if player doesn't exist after 1500ms, show loading state
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const watchdogTimer = setTimeout(() => {
      if (!playerRef.current) {
        console.log('[protocol] Player loading slow, showing loading state');
        setPlayerLoadingSlow(true);
      }
    }, 1500);
    
    return () => clearTimeout(watchdogTimer);
  }, []);

  // YouTube IFrame API setup for video autoplay with audio
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let scriptLoaded = false;
    let initAttempts = 0;
    const maxAttempts = 20;

    const initializePlayer = () => {
      initAttempts++;
      if (initAttempts > maxAttempts) {
        console.error('[Protocol Video] Max initialization attempts reached');
        return;
      }

      if (!window.YT || !window.YT.Player) {
        console.log('[Protocol Video] YouTube API not ready yet, attempt', initAttempts);
        setTimeout(initializePlayer, 500);
        return;
      }

      const containerId = 'protocol-video-player';
      const container = document.getElementById(containerId);

      if (!container) {
        console.log('[Protocol Video] Container not found, retrying...');
        setTimeout(initializePlayer, 500);
        return;
      }

      // Initialize video player
      if (!playerRef.current) {
        console.log('[protocol] init player');
        try {
          playerRef.current = new window.YT.Player(containerId, {
            videoId: 'Q8pVd_XhiTE',
            playerVars: {
              autoplay: 1,
              mute: 1,
              playsinline: 1,
              loop: 1,
              playlist: 'Q8pVd_XhiTE', // Required for loop to work
              rel: 0,
              modestbranding: 1,
              enablejsapi: 1,
              controls: 1,
            },
            events: {
              onReady: (event: any) => {
                console.log('[protocol] yt ready');
                const player = event.target;
                
                // Start overlay blur timer (5 seconds)
                setShowYouTubeOverlay(true);
                setTimeout(() => {
                  setShowYouTubeOverlay(false);
                }, 5000);

                // If user clicked overlay before player was ready, play immediately
                if (userRequestedPlay) {
                  console.log('[protocol] User requested play before ready, starting now');
                  try {
                    player.playVideo();
                    player.unMute();
                    player.setVolume(100);
                  } catch (e) {
                    console.log('[protocol] Error starting playback after user request:', e);
                  }
                } else {
                  // Normal autoplay attempt
                  try {
                    player.playVideo();
                    console.log('[protocol] playVideo called');
                  } catch (e) {
                    console.error('[protocol] Error starting playback:', e);
                  }
                }
              },
              onStateChange: (event: any) => {
                const state = event.data;
                console.log('[protocol] state=' + state);
                
                // Hide overlay ONLY when video reaches PLAYING state
                if (state === window.YT.PlayerState.PLAYING && playerRef.current) {
                  console.log('[protocol] state=PLAYING');
                  
                  // Ensure unmuted when playing
                  try {
                    playerRef.current.unMute();
                    playerRef.current.setVolume(100);
                    const isMuted = playerRef.current.isMuted();
                    console.log('[protocol] muted=' + isMuted);
                    
                    // Hide overlay when playing (regardless of mute status)
                    setShowUnmuteOverlay(false);
                  } catch (e) {
                    console.log('[protocol] Could not unmute on state change:', e);
                    // Still hide overlay - video is playing
                    setShowUnmuteOverlay(false);
                  }
                } else if (state === window.YT.PlayerState.ENDED && playerRef.current) {
                  // Video ended - restart (loop should handle this, but just in case)
                  console.log('[protocol] Video ended, restarting');
                  try {
                    playerRef.current.playVideo();
                  } catch (e) {
                    console.log('[protocol] Could not restart:', e);
                  }
                }
                // For all other states, keep overlay visible
              },
              onError: (event: any) => {
                console.error('[protocol] YouTube Player Error:', event.data);
                setShowUnmuteOverlay(true);
              },
            },
          });
        } catch (e) {
          console.error('[Protocol Video] Error initializing player:', e);
        }
      }
    };

    // Load YouTube IFrame API script if not already loaded
    if (!window.YT) {
      // Check if script is already being loaded
      const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
        scriptLoaded = true;
      }

      // Set up callback
      const originalCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        console.log('[protocol] yt api loaded');
        if (originalCallback) originalCallback();
        initializePlayer();
      };
    } else {
      // API already loaded, initialize immediately
      console.log('[protocol] yt api loaded');
      initializePlayer();
    }

    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (e) {
          console.log('[Protocol Video] Error destroying player:', e);
        }
        playerRef.current = null;
      }
    };
  }, []);

  // Dev badge: show entry variant and URL params
  useEffect(() => {
    if (typeof window === 'undefined' || process.env.NODE_ENV !== 'development') return;
    
    // Read entry variant from cookie or localStorage
    const cookieVariant = document.cookie
      .split(';')
      .find(c => c.trim().startsWith('dq_entry_variant='))
      ?.split('=')[1];
    
    const storedVariant = localStorage.getItem('entry_variant') || cookieVariant;
    setEntryVariant(storedVariant || 'protocol'); // Default to protocol if not set
    
    // Also store in localStorage for consistency
    if (storedVariant) {
      localStorage.setItem('entry_variant', storedVariant);
    }
  }, []);

  // Extract URL params for dev badge
  const urlParams = {
    code: searchParams.get('code'),
    v: searchParams.get('v'),
    src: searchParams.get('src'),
    toEmail: searchParams.get('toEmail') || searchParams.get('to_email'),
    ref: searchParams.get('ref'),
  };

  return (
    <div
      style={{
        backgroundColor: 'black',
        color: '#00ffe0',
        fontFamily: '"Courier New", monospace',
        textAlign: 'center',
        margin: 0,
        minHeight: '100vh',
        position: 'relative',
        overflowX: 'hidden',
      }}
    >
      {/* Dev-only badge: show entry variant and URL params */}
      {process.env.NODE_ENV === 'development' && (
        <div
          style={{
            position: 'fixed',
            top: '10px',
            right: '10px',
            backgroundColor: '#fef3c7',
            border: '1px solid #fbbf24',
            borderRadius: '0.375rem',
            padding: '0.5rem 0.75rem',
            fontSize: '0.75rem',
            color: '#92400e',
            zIndex: 10000,
            maxWidth: '300px',
            textAlign: 'left',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>🔧 Dev Info</div>
          <div>
            entry_variant: <strong>{entryVariant || 'protocol'}</strong>{' '}
            <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>
              (source: {(() => {
                const params = new URLSearchParams(window.location.search);
                if (params.get('entry')) return 'override';
                const cookieMatch = document.cookie.match(/entry_variant=([^;]+)/);
                if (cookieMatch) return 'cookie';
                if (localStorage.getItem('entry_variant')) return 'localStorage';
                return 'default';
              })()})
            </span>
          </div>
          {urlParams.code && <div>code: <code>{urlParams.code}</code></div>}
          {urlParams.v && <div>v: <code>{urlParams.v}</code></div>}
          {urlParams.src && <div>src: <code>{urlParams.src}</code></div>}
          {urlParams.toEmail && <div>toEmail: <code>{urlParams.toEmail}</code></div>}
          {urlParams.ref && <div>ref: <code>{urlParams.ref}</code></div>}
        </div>
      )}

      <h1 className="protocol-title" style={{ fontSize: '1.8em', marginTop: '30px' }}>
        Win a 7 Day, 6 Night Family Cruise
      </h1>

      <button
        onClick={() => {
          // Check if identity exists
          const contestEmail = readContestEmail();
          const contestUserId = typeof window !== 'undefined' ? localStorage.getItem('contest_user_id') : null;
          const contestUserCode = typeof window !== 'undefined' ? localStorage.getItem('contest_user_code') : null;
          
          const hasIdentity = !!(contestEmail || contestUserId || contestUserCode);
          
          // Build destination URL with tracking params preserved
          // DO NOT add fresh=1 - let /contest handle new users naturally
          const params = new URLSearchParams(window.location.search);
          
          // Preserve all tracking params
          const qs = params.toString();
          const destination = `/contest${qs ? `?${qs}` : ''}`;
          
          if (process.env.NODE_ENV === 'development') {
            console.log('[protocol-challenge] Enter Contest clicked', {
              hasIdentity,
              contestEmail,
              destination,
            });
          }
          
          router.push(destination);
        }}
        className="glitch-button"
        onMouseEnter={() => setIsButtonHovered(true)}
        onMouseLeave={() => setIsButtonHovered(false)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          font: 'inherit',
          color: 'inherit',
          textDecoration: 'none',
        }}
      >
        Get on Board Now!
      </button>

      <br />

      <div
        style={{
          width: '90%',
          maxWidth: '900px',
          height: '506px',
          minHeight: '506px', // Ensure container has real height
          marginTop: '30px',
          margin: '30px auto 0',
          position: 'relative',
          border: '1px solid rgba(0, 255, 224, 0.2)', // Visual debug border
        }}
      >
        <div
          id="protocol-video-player"
          style={{
            width: '100%',
            height: '100%',
            minHeight: '506px', // Ensure player has real height
            backgroundColor: '#000', // Background so we can see the container
          }}
        />
        {/* YouTube overlay blur for bottom-left channel name/avatar */}
        {showYouTubeOverlay && (
          <div
            style={{
              position: 'absolute',
              bottom: '60px', // Above YouTube controls
              left: '0',
              width: '200px',
              height: '60px',
              pointerEvents: 'none',
              background: 'rgba(0, 0, 0, 0.3)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              borderRadius: '0 8px 0 0',
              zIndex: 10,
              transition: 'opacity 0.5s ease-out',
            }}
          />
        )}
        
        {/* Start video overlay - shown immediately, hidden only when PLAYING */}
        {showUnmuteOverlay && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 9999,
              pointerEvents: 'auto',
              backgroundColor: 'rgba(0, 0, 0, 0.85)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1rem',
            }}
          >
            <button
              onClick={() => {
                console.log('[protocol] overlay click');
                if (playerRef.current) {
                  // Player exists - start playback
                  try {
                    const player = playerRef.current;
                    player.playVideo();
                    player.unMute();
                    player.setVolume(100);
                  } catch (e) {
                    console.log('[protocol] overlay click error', e);
                  }
                } else {
                  // Player doesn't exist yet - set flag for onReady
                  console.log('[protocol] Player not ready, setting userRequestedPlay flag');
                  setUserRequestedPlay(true);
                }
              }}
              style={{
                backgroundColor: 'rgba(0, 255, 224, 0.1)',
                color: '#00ffe0',
                padding: '1rem 2rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontFamily: '"Courier New", monospace',
                fontSize: '1.2rem',
                border: '2px solid #00ffe0',
                textAlign: 'center',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(0, 255, 224, 0.2)';
                e.currentTarget.style.boxShadow = '0 0 16px #00ffe0';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(0, 255, 224, 0.1)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              ▶ Reveal the message
            </button>
            
            {playerLoadingSlow && (
              <>
                <div
                  style={{
                    color: '#00ffe0',
                    fontFamily: '"Courier New", monospace',
                    fontSize: '0.9rem',
                    opacity: 0.7,
                  }}
                >
                  Loading video…
                </div>
                <a
                  href="https://www.youtube.com/watch?v=Q8pVd_XhiTE"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent overlay click
                  }}
                  style={{
                    color: '#00ffe0',
                    fontFamily: '"Courier New", monospace',
                    fontSize: '0.875rem',
                    textDecoration: 'underline',
                    padding: '0.5rem 1rem',
                    border: '1px solid #00ffe0',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(0, 255, 224, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  Open video
                </a>
              </>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          backgroundColor: 'red',
          color: 'white',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          width: '100%',
          padding: '0.5rem',
          fontWeight: 'bold',
          fontSize: '16px',
          zIndex: 1000,
        }}
      >
        <span
          className="ticker-text"
          style={{
            display: 'inline-block',
            paddingLeft: '100%',
            animation: 'ticker 20s linear infinite',
          }}
        >
          Agnes Protocol tops banned book list — again. ⚡ Tiana M. just earned 3,450 points. ⚡ Nate R. entered the
          contest from Tucson. ⚡
        </span>
      </div>

      <style jsx>{`
        .protocol-video {
          width: 100%;
          aspect-ratio: 16 / 9;
          border-radius: 8px;
        }
      `}</style>

      <style jsx global>{`
        @keyframes ticker {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-100%);
          }
        }

        .ticker-text {
          animation: ticker 20s linear infinite !important;
        }

        @keyframes vibrate {
          0%, 100% {
            transform: translate(0);
          }
          10% {
            transform: translate(-1px, 1px) rotate(0.5deg);
          }
          20% {
            transform: translate(1px, -1px) rotate(-0.5deg);
          }
          30% {
            transform: translate(-1px, -1px) rotate(0.5deg);
          }
          40% {
            transform: translate(1px, 1px) rotate(-0.5deg);
          }
          50% {
            transform: translate(-1px, 1px) rotate(0.3deg);
          }
          60% {
            transform: translate(1px, -1px) rotate(-0.3deg);
          }
          70% {
            transform: translate(-1px, -1px) rotate(0.2deg);
          }
          80% {
            transform: translate(1px, 1px) rotate(-0.2deg);
          }
          90% {
            transform: translate(-0.5px, 0.5px) rotate(0.1deg);
          }
        }

        .glitch-button {
          border: 2px solid #00ffe0 !important;
          outline: 1px solid rgba(0, 255, 224, 0.3) !important;
          padding: 12px 24px;
          font-size: 1.1em;
          font-weight: 600;
          color: #00ffe0;
          text-shadow: 0 0 4px #00ffe0;
          background: rgba(0, 0, 0, 0.8);
          margin: 20px auto;
          display: inline-block;
          cursor: pointer;
          text-decoration: none;
          animation: vibrate 0.15s infinite;
          transition: all 0.3s ease-in-out;
          position: relative;
          z-index: 10;
        }

        .glitch-button:hover,
        .glitch-button:focus {
          animation: none !important;
          color: #00ffe0;
          background-color: rgba(17, 17, 17, 0.95);
          box-shadow: 0 0 16px #00ffe0, 0 0 32px rgba(0, 255, 224, 0.5), inset 0 0 20px rgba(0, 255, 224, 0.1);
          text-shadow: 0 0 8px #00ffe0, 0 0 12px #00ffe0;
          border-color: #00ffe0 !important;
          outline-color: rgba(0, 255, 224, 0.6) !important;
          transform: scale(1.02);
        }
      `}</style>
    </div>
  );
}
