'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSafeBack } from '@/lib/nav';
import { readContestEmail } from '@/lib/identity';
import { BuyBookButton } from '@/components/BuyBookButton';
import HelpButton from '@/components/HelpButton';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export default function SampleChaptersPage() {
  const searchParams = useSearchParams();
  const [current, setCurrent] = useState(0);
  const [activeVideo, setActiveVideo] = useState<'left' | 'right'>('left');
  const leftVideoRef = useRef<HTMLIFrameElement>(null);
  const rightVideoRef = useRef<HTMLIFrameElement>(null);
  const leftPlayerRef = useRef<any>(null);
  const rightPlayerRef = useRef<any>(null);
  const goBack = useSafeBack('/contest');

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
      link: '/chapters/chapter1.pdf',
    },
    {
      id: 'btn2',
      label: 'Read Chapter 2',
      text: 'Fred enters the scene – Agnes already doesn’t like him.',
      link: '/chapters/chapter2.pdf',
    },
    {
      id: 'btn3',
      label: 'Read Chapter 9',
      text: 'Meet Matt and Reese – straight from the orphanage.',
      link: '/chapters/chapter9.pdf',
    },
    {
      id: 'btn4',
      label: 'Read Chapter 45',
      text: 'Fred and Jody – always two steps ahead.',
      link: '/chapters/chapter45.pdf',
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
    <div
      style={{
        backgroundColor: 'black',
        color: '#00ffe5',
        fontFamily: '"Courier New", Courier, monospace',
        margin: 0,
        padding: 0,
        textAlign: 'center',
        minHeight: '100vh',
      }}
    >
      <h1 style={{ marginTop: '20px', fontSize: '1.6em' }}>
        Explore Sample Chapters from <em>The Agnes Protocol</em>
      </h1>

      {/* VIDEOS */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '30px',
          marginTop: '30px',
          flexWrap: 'wrap',
        }}
      >
        <div
          id="left-video-player"
          ref={leftVideoRef}
          style={{
            width: '300px',
            height: '170px',
            border: '2px solid #00ff00',
          }}
        />
        <div
          id="right-video-player"
          ref={rightVideoRef}
          style={{
            width: '300px',
            height: '170px',
            border: '2px solid #00ff00',
          }}
        />
      </div>

      {/* CHAPTER BUTTONS */}
      <div
        style={{
          margin: '40px auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '18px',
        }}
      >
        {buttons.slice(0, 4).map((btn, index) => (
          <div
            key={btn.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              justifyContent: 'center',
            }}
          >
            <a
              href={btn.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '12px 24px',
                border: '2px solid #00ff00',
                color: current === index ? 'black' : '#00ffe5',
                backgroundColor: current === index ? '#00ff00' : 'black',
                textDecoration: 'none',
                animation: current === index ? 'pulse 1.5s infinite' : 'none',
              }}
            >
              {btn.label}
              {current === index && (
                <span style={{ marginLeft: '12px', fontSize: '1.2em' }}>👉</span>
              )}
            </a>
            {current === index && (
              <span
                style={{
                  color: '#00ff00',
                  fontSize: '0.95em',
                  fontStyle: 'italic',
                  maxWidth: '250px',
                  textAlign: 'left',
                }}
              >
                {btn.text}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* CTA BUTTONS */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '20px',
          marginTop: '30px',
          flexWrap: 'wrap',
        }}
      >
        <BuyBookButton
          source="sample-chapters"
          successPath="/contest/thank-you"
          cancelPath="/sample-chapters"
          style={{
            padding: '10px 14px',
            border: '2px solid #00ffe5',
            color: current === 4 ? 'black' : '#00ffe5',
            backgroundColor: current === 4 ? '#00ffe5' : 'black',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            boxShadow: '0 0 12px #00ffe5',
            minHeight: 48,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
          }}
        >
          {buttons[4].label}
          {current === 4 && (
            <span style={{ marginLeft: '12px', fontSize: '1.2em' }}>👉</span>
          )}
        </BuyBookButton>
        <button
          type="button"
          onClick={goBack}
          style={{
            padding: '10px 14px',
            border: '2px solid #00ffe5',
            color: '#00ffe5',
            backgroundColor: 'black',
            textTransform: 'uppercase',
            fontWeight: 'bold',
            boxShadow: '0 0 12px #00ffe5',
            minHeight: 48,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            cursor: 'pointer',
          }}
        >
          Go Back
        </button>
      </div>

      {/* PULSE KEYFRAMES */}
      <style jsx>{`
        @keyframes pulse {
          0% {
            box-shadow: 0 0 10px #00ff00;
          }
          50% {
            box-shadow: 0 0 20px #00ff00;
          }
          100% {
            box-shadow: 0 0 10px #00ff00;
          }
        }
      `}</style>

      {/* FOOTER */}
      <footer
        style={{
          textAlign: 'center',
          marginTop: '40px',
          fontSize: '0.9rem',
          color: '#00ff00',
        }}
      >
        <p>© 2025 DeepQuill LLC – All Rights Reserved</p>
        <p>
          Contact:{' '}
          <a href="mailto:hello@theagnesprotocol.com" style={{ color: '#00ff00' }}>
            hello@theagnesprotocol.com
          </a>
        </p>
        <p>All purchases are final. Contact us with any issues.</p>
      </footer>
      <HelpButton />
    </div>
  );
}
