'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BuyBookButton } from '@/components/BuyBookButton';
import HelpButton from '@/components/HelpButton';
import SiteFooter from '@/components/SiteFooter';
import { trackMeta } from '@/lib/metaPixel';
import { trackTikTok } from '@/lib/tiktokPixel';
import { useSafeBack } from '@/lib/nav';
import {
  HUB_THEME,
  hubContentWrapStyle,
  hubEyebrowStyle,
  hubPageShellStyle,
  hubPrimaryButtonStyle,
  hubSecondaryButtonStyle,
} from '@/lib/hubTheme';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export default function SampleChaptersClient() {
  const searchParams = useSearchParams();
  const goBack = useSafeBack('/contest');
  const [current, setCurrent] = useState(0);
  const [activeVideo, setActiveVideo] = useState<'left' | 'right'>('left');
  const leftVideoRef = useRef<HTMLIFrameElement>(null);
  const rightVideoRef = useRef<HTMLIFrameElement>(null);
  const leftPlayerRef = useRef<any>(null);
  const rightPlayerRef = useRef<any>(null);
  const viewContentFiredRef = useRef(false);

  useEffect(() => {
    if (viewContentFiredRef.current) return;
    viewContentFiredRef.current = true;
    trackTikTok('ViewContent', {
      content_id: 'sample-chapters',
      content_name: 'Sample Chapters',
      content_type: 'product',
    });
    trackMeta('ViewContent', {
      content_ids: ['sample-chapters'],
      content_name: 'Sample Chapters',
      content_type: 'product',
    });
  }, []);

  // Preserve referral code from URL to localStorage/cookie (if not already stored)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const codeFromUrl = searchParams.get('code');
    if (codeFromUrl) {
      try {
        // Store in localStorage if not already present
        const existingCode = window.localStorage.getItem('referral_code');
        if (!existingCode || existingCode !== codeFromUrl) {
          window.localStorage.setItem('referral_code', codeFromUrl);
        }
        
        // Store in cookie
        document.cookie = `referral_code=${encodeURIComponent(codeFromUrl)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
      } catch {
        // Fail silently if storage not available
      }
    }
  }, [searchParams]);

  const buttons = [
    {
      id: 'btn1',
      label: 'Read Chapter 1',
      text: 'Starts off running.',
      link: '/sample-chapters/read/1',
    },
    {
      id: 'btn2',
      label: 'Read Chapter 2',
      text: 'Fred enters the scene – Agnes already doesn’t like him.',
      link: '/sample-chapters/read/2',
    },
    {
      id: 'btn3',
      label: 'Read Chapter 9',
      text: 'Meet Matt and Reese – straight from the orphanage.',
      link: '/sample-chapters/read/9',
    },
    {
      id: 'btn4',
      label: 'Read Chapter 45',
      text: 'Fred and Jody – always two steps ahead.',
      link: '/sample-chapters/read/45',
    },
    {
      id: 'btn5',
      label: 'Buy the Book',
      text: 'Enjoy the adventure – you’re already living the reality.',
    },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % buttons.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // YouTube IFrame API setup and video control
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Load YouTube IFrame API
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    const initializePlayers = () => {
      if (!window.YT || !window.YT.Player) {
        console.log('[Sample Chapters] YouTube API not ready yet');
        return;
      }

      const leftContainerId = 'left-video-player';
      const rightContainerId = 'right-video-player';
      
      const leftContainer = document.getElementById(leftContainerId);
      const rightContainer = document.getElementById(rightContainerId);

      if (!leftContainer || !rightContainer) {
        console.log('[Sample Chapters] Containers not found, retrying...');
        setTimeout(initializePlayers, 500);
        return;
      }

      // Initialize left video player (Kris Video) - starts playing immediately
      if (!leftPlayerRef.current) {
        console.log('[Sample Chapters] Initializing left video player');
        try {
          leftPlayerRef.current = new window.YT.Player(leftContainerId, {
            videoId: 'qj9H74Qy4HM',
            playerVars: {
              autoplay: 1,
              mute: 1, // Start muted for autoplay compatibility
              controls: 1,
              rel: 0,
              modestbranding: 1,
              enablejsapi: 1,
            },
            events: {
              onReady: (event: any) => {
                console.log('[Sample Chapters] Left video ready, starting playback');
                const player = event.target;
                
                const startPlayback = () => {
                  try {
                    player.playVideo();
                    console.log('[Sample Chapters] Left video play command sent');
                    
                    // Wait a moment, then unmute
                    setTimeout(() => {
                      const state = player.getPlayerState();
                      console.log('[Sample Chapters] Left video state:', state);
                      
                      if (state === window.YT.PlayerState.PLAYING) {
                        try {
                          player.unMute();
                          console.log('[Sample Chapters] Left video playing, unmuted');
                        } catch (e) {
                          console.log('[Sample Chapters] Could not unmute left video:', e);
                          setTimeout(() => {
                            try {
                              player.unMute();
                            } catch (e2) {
                              console.log('[Sample Chapters] Second unmute attempt failed:', e2);
                            }
                          }, 1000);
                        }
                      }
                    }, 500);
                  } catch (e) {
                    console.error('[Sample Chapters] Error starting left video:', e);
                  }
                };
                
                startPlayback();
              },
              onStateChange: (event: any) => {
                const state = event.data;
                
                // When left video ends, switch to right video
                if (state === window.YT.PlayerState.ENDED) {
                  console.log('[Sample Chapters] Left video ended, switching to right');
                  setActiveVideo('right');
                  
                  // Pause left video
                  try {
                    event.target.pauseVideo();
                  } catch (e) {
                    console.log('[Sample Chapters] Error pausing left video:', e);
                  }
                  
                  // Start right video
                  setTimeout(() => {
                    if (rightPlayerRef.current) {
                      try {
                        rightPlayerRef.current.playVideo();
                        rightPlayerRef.current.unMute();
                        console.log('[Sample Chapters] Right video started');
                      } catch (e) {
                        console.error('[Sample Chapters] Error starting right video:', e);
                      }
                    }
                  }, 500);
                } else if (state === window.YT.PlayerState.PLAYING) {
                  // Ensure unmuted when playing
                  try {
                    event.target.unMute();
                  } catch (e) {
                    console.log('[Sample Chapters] Could not unmute left video:', e);
                  }
                }
              },
              onError: (event: any) => {
                console.error('[Sample Chapters] Left video error:', event.data);
              },
            },
          });
        } catch (error) {
          console.error('[Sample Chapters] Error initializing left player:', error);
        }
      }

      // Initialize right video player (Beach Video) - waits for left to finish
      if (!rightPlayerRef.current) {
        console.log('[Sample Chapters] Initializing right video player');
        try {
          rightPlayerRef.current = new window.YT.Player(rightContainerId, {
            videoId: 'Rp1C4kokLdE',
            playerVars: {
              autoplay: 0, // Don't autoplay - wait for left video to end
              mute: 1, // Start muted
              controls: 1,
              rel: 0,
              modestbranding: 1,
              enablejsapi: 1,
            },
            events: {
              onReady: (event: any) => {
                console.log('[Sample Chapters] Right video ready (waiting for left to finish)');
              },
              onStateChange: (event: any) => {
                const state = event.data;
                
                // When right video ends, switch back to left video
                if (state === window.YT.PlayerState.ENDED) {
                  console.log('[Sample Chapters] Right video ended, switching to left');
                  setActiveVideo('left');
                  
                  // Pause right video
                  try {
                    event.target.pauseVideo();
                  } catch (e) {
                    console.log('[Sample Chapters] Error pausing right video:', e);
                  }
                  
                  // Start left video
                  setTimeout(() => {
                    if (leftPlayerRef.current) {
                      try {
                        leftPlayerRef.current.seekTo(0, true); // Restart from beginning
                        leftPlayerRef.current.playVideo();
                        leftPlayerRef.current.unMute();
                        console.log('[Sample Chapters] Left video restarted');
                      } catch (e) {
                        console.error('[Sample Chapters] Error restarting left video:', e);
                      }
                    }
                  }, 500);
                } else if (state === window.YT.PlayerState.PLAYING) {
                  // Ensure unmuted when playing
                  try {
                    event.target.unMute();
                  } catch (e) {
                    console.log('[Sample Chapters] Could not unmute right video:', e);
                  }
                }
              },
              onError: (event: any) => {
                console.error('[Sample Chapters] Right video error:', event.data);
              },
            },
          });
        } catch (error) {
          console.error('[Sample Chapters] Error initializing right player:', error);
        }
      }
    };

    // Wait for YouTube API to be ready
    if (window.YT && window.YT.Player) {
      setTimeout(initializePlayers, 100);
    } else {
      window.onYouTubeIframeAPIReady = () => {
        console.log('[Sample Chapters] YouTube API ready');
        setTimeout(initializePlayers, 100);
      };
    }

    return () => {
      // Cleanup
      if (leftPlayerRef.current) {
        try {
          leftPlayerRef.current.destroy();
          leftPlayerRef.current = null;
        } catch (e) {
          console.warn('[Sample Chapters] Error destroying left player:', e);
        }
      }
      if (rightPlayerRef.current) {
        try {
          rightPlayerRef.current.destroy();
          rightPlayerRef.current = null;
        } catch (e) {
          console.warn('[Sample Chapters] Error destroying right player:', e);
        }
      }
    };
  }, []); // Empty deps - run once on mount

  return (
    <div style={{ ...hubPageShellStyle(), margin: 0 }}>
      <div style={hubContentWrapStyle()}>
        <button
          type="button"
          onClick={goBack}
          style={{
            color: HUB_THEME.textMuted,
            background: 'none',
            border: 'none',
            fontFamily: 'inherit',
            fontSize: '14px',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          ← Back
        </button>

        <header style={{ textAlign: 'center', marginTop: '28px', marginBottom: '40px' }}>
          <p style={hubEyebrowStyle()}>
            The Agnes Protocol
          </p>
          <h1
            style={{
              margin: '0 0 14px 0',
              fontSize: 'clamp(1.65rem, 4vw, 2.25rem)',
              fontWeight: 800,
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
              color: HUB_THEME.text,
            }}
          >
            Explore Sample Chapters from <em>The Agnes Protocol</em>
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 'clamp(1rem, 2.5vw, 1.15rem)',
              lineHeight: 1.55,
              color: HUB_THEME.textMuted,
              maxWidth: '32rem',
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            Read four chapters free. Decide for yourself.
          </p>
        </header>

        {/* VIDEOS */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '20px',
            marginBottom: '48px',
            flexWrap: 'wrap',
          }}
        >
          {(['left', 'right'] as const).map((side) => (
            <div
              key={side}
              style={{
                background: HUB_THEME.surface,
                border: `1px solid ${HUB_THEME.border}`,
                borderRadius: '12px',
                padding: '8px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.06)',
                opacity: activeVideo === side ? 1 : 0.72,
                transition: 'opacity 0.3s ease',
              }}
            >
              <div
                id={side === 'left' ? 'left-video-player' : 'right-video-player'}
                ref={side === 'left' ? leftVideoRef : rightVideoRef}
                style={{
                  width: 'min(100%, 320px)',
                  height: '180px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}
              />
            </div>
          ))}
        </div>

        {/* CHAPTER BUTTONS */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: '16px',
            maxWidth: '640px',
            margin: '0 auto',
          }}
        >
          {buttons.slice(0, 4).map((btn, index) => {
            const isActive = current === index;
            return (
              <div
                key={btn.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  padding: '20px 22px',
                  borderRadius: '12px',
                  border: `1px solid ${isActive ? 'rgba(0, 255, 127, 0.4)' : HUB_THEME.border}`,
                  background: HUB_THEME.surface,
                  boxShadow: isActive
                    ? '0 12px 32px rgba(0, 0, 0, 0.08)'
                    : '0 4px 16px rgba(0, 0, 0, 0.04)',
                  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '16px',
                    justifyContent: 'space-between',
                  }}
                >
                  <Link href={btn.link ?? '#'} style={hubPrimaryButtonStyle(isActive)}>
                    {btn.label}
                    {isActive && (
                      <span style={{ marginLeft: '10px' }} aria-hidden>
                        →
                      </span>
                    )}
                  </Link>
                  {isActive && (
                    <p
                      style={{
                        margin: 0,
                        flex: '1 1 200px',
                        fontSize: '15px',
                        lineHeight: 1.5,
                        color: HUB_THEME.textMuted,
                        textAlign: 'left',
                      }}
                    >
                      {btn.text}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA BUTTONS */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '16px',
            marginTop: '40px',
            flexWrap: 'wrap',
          }}
        >
          <BuyBookButton
            source="sample-chapters"
            successPath="/checkout/success"
            cancelPath="/sample-chapters"
            style={{
              ...hubPrimaryButtonStyle(current === 4),
              minHeight: 48,
              textTransform: 'none',
            }}
          >
            {buttons[4].label}
            {current === 4 && (
              <span style={{ marginLeft: '10px' }} aria-hidden>
                →
              </span>
            )}
          </BuyBookButton>
          <Link href="/author" style={hubSecondaryButtonStyle()}>
            About the Author
          </Link>
        </div>

        <SiteFooter variant="light" />
      </div>

      <HelpButton />
    </div>
  );
}
