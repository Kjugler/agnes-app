'use client';

import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import CheckoutWiring from './CheckoutWiring'; // ← invisible helper that wires the Buy button
import CurrentScoreButton from './CurrentScoreButton';
import { BuyBookButton } from '@/components/BuyBookButton';
import { ContestEntryForm } from '@/components/ContestEntryForm';
import { startCheckout } from '@/lib/checkout';
import HelpButton from '@/components/HelpButton';
import {
  clearAssociateCaches,
  readAssociate,
  readContestEmail,
  writeAssociate,
  type AssociateCache,
} from '@/lib/identity';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export default function ContestPage() {
  const qp = useSearchParams();
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const [tapsyText, setTapsyText] = useState('Tap here to read a sample chapter!');
  const [showScoreButton, setShowScoreButton] = useState(false);
  const [contestEmail, setContestEmail] = useState<string | null>(null);
  const [associate, setAssociate] = useState<AssociateCache | null>(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [profileFirstName, setProfileFirstName] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [showEntryFormForCheckout, setShowEntryFormForCheckout] = useState(false);
  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => {
      const email = readContestEmail();
      const stored = readAssociate();
      if (stored && email && stored.email !== email) {
        clearAssociateCaches({ keepContestEmail: true });
        setAssociate(null);
        setContestEmail(email);
        return;
      }
      if (stored && !email) {
        clearAssociateCaches();
        setAssociate(null);
        setContestEmail(null);
        return;
      }
      setContestEmail(email);
      setAssociate(stored);
    };
    sync();
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadStatus = async () => {
      if (!contestEmail) {
        setHasProfile(false);
        setProfileFirstName(null);
        setAssociate(null);
        setStatusLoaded(false);
        setStatusLoading(false);
        return;
      }

      setStatusLoading(true);
      setStatusLoaded(false);

      try {
        const res = await fetch('/api/associate/status', {
          method: 'GET',
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error(`status_failed_${res.status}`);
        }
        const data = await res.json();
        if (cancelled) return;

        const nextHasProfile = Boolean(data?.hasProfile);
        setHasProfile(nextHasProfile);
        setProfileFirstName(data?.firstName || null);

        if (data?.firstName) {
          try {
            window.localStorage.setItem('first_name', data.firstName);
          } catch {
            /* ignore */
          }
        }

        if (nextHasProfile && data?.id && data?.email) {
          const payload: AssociateCache = {
            id: data.id,
            email: data.email,
            name: data?.name || data.email,
            code: data?.code || '',
          };
          writeAssociate(payload);
          setAssociate(payload);
        } else if (!nextHasProfile) {
          setAssociate(null);
        }
      } catch (err) {
        console.warn('[contest] status load failed', err);
        if (!cancelled) {
          setHasProfile(false);
          setProfileFirstName(null);
          setAssociate(null);
        }
      } finally {
        if (!cancelled) {
          setStatusLoading(false);
          setStatusLoaded(true);
        }
      }
    };
    loadStatus();
    return () => {
      cancelled = true;
      setStatusLoading(false);
    };
  }, [contestEmail]);

  // Detect “just did something that earns points” signals:
  // - return from Stripe: ?session_id=...
  // - explicit flag: ?justPurchased=1
  const sessionId = qp.get('session_id');
  const justPurchased = qp.get('justPurchased') === '1';

  // YouTube IFrame API setup for video looping
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Load YouTube IFrame API script
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    const initializePlayer = () => {
      if (!window.YT || !window.YT.Player) {
        console.log('[Contest Video] YouTube API not ready yet');
        return;
      }
      
      const containerId = 'contest-video-player';
      const container = document.getElementById(containerId);
      
      if (!container) {
        console.log('[Contest Video] Container not found, retrying...');
        setTimeout(initializePlayer, 500);
        return;
      }

      // Initialize video player
      if (!playerRef.current) {
        console.log('[Contest Video] Initializing YouTube player');
        try {
          playerRef.current = new window.YT.Player(containerId, {
            videoId: '_DEmdMYdjXk',
            playerVars: {
              autoplay: 1,
              mute: 1, // Start muted for autoplay compatibility, then unmute after playing
              controls: 1,
              rel: 0, // Don't show related videos
              modestbranding: 1,
              enablejsapi: 1,
              loop: 1, // Enable looping
              playlist: '_DEmdMYdjXk', // Required for loop to work
            },
            events: {
              onReady: (event: any) => {
                console.log('[Contest Video] Video ready, starting playback');
                const player = event.target;
                
                // Start playing (should autoplay since mute: 1)
                const startPlayback = () => {
                  try {
                    player.playVideo();
                    console.log('[Contest Video] Play command sent');
                    
                    // Wait a moment, then check if playing and unmute
                    setTimeout(() => {
                      const state = player.getPlayerState();
                      console.log('[Contest Video] Player state:', state);
                      
                      if (state === window.YT.PlayerState.PLAYING) {
                        // Video is playing - unmute it
                        try {
                          player.unMute();
                          console.log('[Contest Video] Video playing, unmuted successfully');
                        } catch (e) {
                          console.log('[Contest Video] Could not unmute:', e);
                          // Try again after a bit
                          setTimeout(() => {
                            try {
                              player.unMute();
                            } catch (e2) {
                              console.log('[Contest Video] Second unmute attempt failed:', e2);
                            }
                          }, 1000);
                        }
                      } else {
                        // Not playing yet, try again
                        console.log('[Contest Video] Video not playing yet, retrying...');
                        setTimeout(() => {
                          try {
                            player.playVideo();
                            setTimeout(() => {
                              try {
                                player.unMute();
                              } catch (e) {
                                console.log('[Contest Video] Could not unmute on retry:', e);
                              }
                            }, 1000);
                          } catch (e) {
                            console.log('[Contest Video] Retry play failed:', e);
                          }
                        }, 500);
                      }
                    }, 500);
                  } catch (e) {
                    console.error('[Contest Video] Error starting playback:', e);
                  }
                };
                
                // Start playback immediately
                startPlayback();
              },
              onStateChange: (event: any) => {
                const state = event.data;
                console.log('[Contest Video] State changed:', state);
                
                // When video ends (state 0), restart it
                if (state === window.YT.PlayerState.ENDED) {
                  console.log('[Contest Video] Video ended, restarting');
                  setTimeout(() => {
                    if (playerRef.current) {
                      try {
                        playerRef.current.seekTo(0, true); // Restart from beginning
                        playerRef.current.playVideo();
                        playerRef.current.unMute(); // Ensure unmuted
                        console.log('[Contest Video] Restarted video');
                      } catch (e) {
                        console.error('[Contest Video] Error restarting:', e);
                      }
                    }
                  }, 500);
                } else if (state === window.YT.PlayerState.PLAYING) {
                  // Video is playing - ensure it's unmuted
                  try {
                    event.target.unMute();
                  } catch (e) {
                    console.log('[Contest Video] Could not unmute during playback:', e);
                  }
                } else if (state === window.YT.PlayerState.PAUSED) {
                  // If paused, try to resume (shouldn't happen with autoplay, but just in case)
                  console.log('[Contest Video] Video paused, attempting to resume');
                  setTimeout(() => {
                    try {
                      event.target.playVideo();
                      event.target.unMute();
                    } catch (e) {
                      console.log('[Contest Video] Could not resume:', e);
                    }
                  }, 1000);
                }
              },
              onError: (event: any) => {
                console.error('[Contest Video] YouTube Player Error:', event.data);
              },
            },
          });
        } catch (error) {
          console.error('[Contest Video] Error initializing player:', error);
        }
      }
    };

    // Wait for YouTube API to be ready
    if (window.YT && window.YT.Player) {
      // API already loaded, initialize immediately
      setTimeout(initializePlayer, 100);
    } else {
      // Wait for API to load
      window.onYouTubeIframeAPIReady = () => {
        console.log('[Contest Video] YouTube API ready');
        setTimeout(initializePlayer, 100);
      };
    }

    return () => {
      // Cleanup
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
          playerRef.current = null;
        } catch (e) {
          console.warn('Error destroying video player:', e);
        }
      }
    };
  }, []); // Empty deps - run once on mount

  // Make visibility sticky for the session
  useEffect(() => {
    const key = 'contest:has-points';
    const already = typeof window !== 'undefined' ? window.localStorage.getItem(key) === '1' : false;
    const nowQualified = Boolean(sessionId || justPurchased);

    if (nowQualified) {
      try { window.localStorage.setItem(key, '1'); } catch {}
      setShowScoreButton(true);
    } else {
      setShowScoreButton(already);
    }
  }, [sessionId, justPurchased]);

  const buttons = useMemo(
    () => [
      {
        id: 'sampleBtn',
        label: 'Read Sample Chapters',
        text: 'Tap here to read a sample chapter!',
        href: '/sample-chapters',
        type: 'link' as const,
      },
      {
        id: 'contestBtn',
        label: 'Enter the Contest',
        text: 'You can win this for your family!',
        href: '/contest/signup?from=/contest',
        type: 'link' as const,
      },
      {
        id: 'pointsBtn',
        label: 'Earn Points',
        text: 'Tap here to win points.',
        href: '/contest/ascension',
        type: 'link' as const,
      },
      {
        id: 'buyBtn',
        label: 'Buy the Book',
        text: 'The adventure’s great—and you’re already living it.',
        type: 'button' as const,
      },
    ],
    [],
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const next = (current + 1) % buttons.length;
      setCurrent(next);
      setTapsyText(buttons[next].text);
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, buttons]);

  const hasAssociate = useMemo(() => {
    return statusLoaded && hasProfile && Boolean(contestEmail);
  }, [statusLoaded, hasProfile, contestEmail]);

  const handleChangeAccount = useCallback(() => {
    clearAssociateCaches();
    router.replace('/contest');
  }, [router]);

  const handleContestEntry = (href: string) => {
    if (!contestEmail) return;
    if (!statusLoaded) return;
    if (hasAssociate) {
      router.push('/contest/score');
    } else {
      router.push(href);
    }
  };

  const handleRequireContestEntry = useCallback(() => {
    setShowEntryFormForCheckout(true);
    // Optionally scroll into view
    setTimeout(() => {
      const formElement = document.querySelector('[data-contest-entry-form]');
      if (formElement) {
        formElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }, []);

  const handleContestEntryCompletedFromBuy = useCallback(async () => {
    try {
      const path = typeof window !== 'undefined' ? window.location.pathname : '/contest';
      await startCheckout({
        source: 'contest',
        path,
        successPath: '/contest/thank-you',
        cancelPath: '/contest',
      });
    } catch (err: any) {
      alert(err?.message || 'Could not start checkout.');
    }
  }, []);

  return (
    <div
      style={{
        backgroundColor: 'black',
        color: 'white',
        fontFamily: 'Arial, sans-serif',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'center',
        paddingBottom: '4rem', // leave room for ticker
      }}
    >
      {/* VIDEO SEGMENT */}
      <div style={{ width: '100%', height: '65vh', position: 'relative', overflow: 'hidden' }}>
        <div
          id="contest-video-player"
          ref={videoRef}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center top',
            position: 'absolute',
            top: 0,
            left: 0,
          }}
        />
      </div>

      {/* Tapsy COMMENT */}
      <div style={{ textAlign: 'center', marginTop: '2rem', fontSize: '1.2rem' }}>{tapsyText}</div>

      {contestEmail ? (
        <div
          style={{
            marginTop: '0.75rem',
            color: '#9ca3af',
            fontSize: '0.95rem',
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {hasAssociate ? (
            <>
              Signed in as <strong>{contestEmail}</strong>
              {' · '}
              Welcome back
              {profileFirstName ? `, ${profileFirstName}` : '!'}
            </>
          ) : (
            <>
              Signed in as <strong>{contestEmail}</strong>
            </>
          )}
          <button
            type="button"
            onClick={handleChangeAccount}
            style={{
              background: 'transparent',
              border: '1px solid rgba(148, 163, 184, 0.6)',
              color: '#e5e7eb',
              padding: '0.35rem 1rem',
              borderRadius: 999,
              cursor: 'pointer',
            }}
          >
            Change account
          </button>
        </div>
      ) : (
        <div style={{ marginTop: '0.75rem', color: '#f87171', fontSize: '0.95rem' }}>
          No contest email detected. Restart the flow to enter with your address.
        </div>
      )}

      {/* MENU BUTTONS */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1.2rem' }}>
        {buttons.map((btn, index) => (
          <div key={btn.id} style={{ position: 'relative', textAlign: 'center' }}>
            {index === current && (
              <>
                <div
                  style={{
                    position: 'absolute',
                    top: '-40px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontSize: '2rem',
                    animation: 'bounce 1s infinite',
                  }}
                >
                  👉
                </div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: '#00ff00',
                    marginBottom: '0.3rem',
                  }}
                >
                  {btn.text}
                </div>
              </>
            )}
            {btn.id === 'contestBtn' ? (
              <button
                type="button"
                disabled={statusLoading || !contestEmail}
                onClick={() => handleContestEntry(btn.href)}
                style={{
                  padding: '1rem',
                  backgroundColor: index === current ? 'green' : '#111',
                  border: '2px solid green',
                  color: index === current ? 'black' : 'white',
                  fontSize: '1rem',
                  cursor: statusLoading || !contestEmail ? 'not-allowed' : 'pointer',
                  animation: index === current ? 'pulse 1s infinite' : 'none',
                  transition: 'all 0.3s',
                  minWidth: '200px',
                  opacity: statusLoading || !contestEmail ? 0.6 : 1,
                }}
              >
                {statusLoading
                  ? 'Checking...'
                  : hasAssociate
                    ? 'See Your Progress'
                    : btn.label}
              </button>
            ) : btn.type === 'button' ? (
              <BuyBookButton
                source="contest"
                successPath="/contest/thank-you"
                cancelPath="/contest"
                onRequireContestEntry={handleRequireContestEntry}
                style={{
                  padding: '1rem',
                  backgroundColor: index === current ? 'green' : '#111',
                  border: '2px solid green',
                  color: index === current ? 'black' : 'white',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  animation: index === current ? 'pulse 1s infinite' : 'none',
                  transition: 'all 0.3s',
                }}
              >
                {btn.label}
              </BuyBookButton>
            ) : (
              <Link
                href={btn.href}
                prefetch={false}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '1rem',
                  backgroundColor: index === current ? 'green' : '#111',
                  border: '2px solid green',
                  color: index === current ? 'black' : 'white',
                  fontSize: '1rem',
                  textDecoration: 'none',
                  cursor: 'pointer',
                  animation: index === current ? 'pulse 1s infinite' : 'none',
                  transition: 'all 0.3s',
                }}
              >
                {btn.label}
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* “VIEW YOUR POINTS” — animated component */}
      {showScoreButton && (
        <div style={{ marginTop: '0.75rem' }}>
          <CurrentScoreButton />
        </div>
      )}

      {/* Contest Entry Form (shown when Buy button requires entry) */}
      {showEntryFormForCheckout && (
        <div
          data-contest-entry-form
          style={{
            marginTop: '2rem',
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            padding: '0 1.5rem',
          }}
        >
          <ContestEntryForm
            suppressAscensionRedirect={true}
            onCompleted={handleContestEntryCompletedFromBuy}
          />
        </div>
      )}

      {/* TICKER BANNER */}
      <div
        style={{
          backgroundColor: 'red',
          color: 'white',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          position: 'fixed',
          bottom: 0,
          width: '100%',
          padding: '0.5rem',
          fontWeight: 'bold',
          zIndex: 1000,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            paddingLeft: '100%',
            animation: 'ticker 20s linear infinite',
          }}
        >
          Agnes Protocol tops banned book list – again • Jody Vernon breaks silence in viral
          interview • New points leader: Billy Bronski – 1,340 pts • Tapsy declares: “This book
          changes everything” • Enter to win the 6-day dream vacation NOW!
        </span>
      </div>

      {/* ANIMATIONS */}
      <style jsx global>{`
        @keyframes ticker {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-100%); }
        }
        @keyframes pulse {
          0% { box-shadow: 0 0 5px lime; }
          50% { box-shadow: 0 0 15px lime; }
          100% { box-shadow: 0 0 5px lime; }
        }
        @keyframes bounce {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(-5px); }
        }
      `}</style>

      {/* Invisible behavior: wires Buy button to checkout */}
      <CheckoutWiring />
      <HelpButton />
    </div>
  );
}