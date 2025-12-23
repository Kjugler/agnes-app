'use client';

import React, { useEffect, useRef } from 'react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export default function ProtocolChallengePage() {
  const playerRef = useRef<any>(null);

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
        console.log('[Protocol Video] Initializing YouTube player');
        try {
          playerRef.current = new window.YT.Player(containerId, {
            videoId: 'Q8pVd_XhiTE',
            playerVars: {
              autoplay: 1,
              mute: 1, // Start muted for autoplay compatibility, then unmute after playing
              controls: 1,
              rel: 0,
              modestbranding: 1,
              enablejsapi: 1,
              loop: 1,
              playlist: 'Q8pVd_XhiTE', // Required for loop to work
            },
            events: {
              onReady: (event: any) => {
                console.log('[Protocol Video] Video ready, starting playback');
                const player = event.target;

                // Start playing (should autoplay since mute: 1)
                const startPlayback = () => {
                  try {
                    player.playVideo();
                    console.log('[Protocol Video] Play command sent');

                    // Wait a moment, then check if playing and unmute
                    setTimeout(() => {
                      const state = player.getPlayerState();
                      console.log('[Protocol Video] Player state:', state);

                      if (state === window.YT.PlayerState.PLAYING) {
                        // Video is playing - unmute it
                        try {
                          player.unMute();
                          console.log('[Protocol Video] Video playing, unmuted successfully');
                        } catch (e) {
                          console.log('[Protocol Video] Could not unmute:', e);
                          // Try again after a bit
                          setTimeout(() => {
                            try {
                              player.unMute();
                            } catch (e2) {
                              console.log('[Protocol Video] Second unmute attempt failed:', e2);
                            }
                          }, 1000);
                        }
                      } else {
                        // Not playing yet, try again
                        setTimeout(() => {
                          try {
                            if (player.getPlayerState() === window.YT.PlayerState.PLAYING) {
                              player.unMute();
                            }
                          } catch (e) {
                            console.log('[Protocol Video] Retry unmute failed:', e);
                          }
                        }, 1000);
                      }
                    }, 500);
                  } catch (e) {
                    console.error('[Protocol Video] Error starting playback:', e);
                  }
                };

                startPlayback();
              },
              onStateChange: (event: any) => {
                const state = event.data;
                if (state === window.YT.PlayerState.PLAYING && playerRef.current) {
                  // Video started playing, ensure it's unmuted
                  try {
                    playerRef.current.unMute();
                  } catch (e) {
                    console.log('[Protocol Video] Could not unmute on state change:', e);
                  }
                }
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
        if (originalCallback) originalCallback();
        initializePlayer();
      };
    } else {
      // API already loaded, initialize immediately
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
      <h1 className="protocol-title" style={{ fontSize: '1.8em', marginTop: '30px' }}>
        Win a 7 Day, 6 Night Family Cruise
      </h1>

      <a href="/contest" className="glitch-button">
        Get on Board Now!
      </a>

      <br />

      <div
        id="protocol-video-player"
        style={{
          width: '90%',
          maxWidth: '900px',
          height: '506px',
          marginTop: '30px',
          margin: '30px auto 0',
        }}
      />

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

        @keyframes glitch {
          0% {
            transform: translate(0);
          }
          20% {
            transform: translate(-2px, 2px);
          }
          40% {
            transform: translate(2px, -2px);
          }
          60% {
            transform: translate(-1px, 1px);
          }
          80% {
            transform: translate(1px, -1px);
          }
          100% {
            transform: translate(0);
          }
        }

        .glitch-button {
          border: 2px solid #00ffe0;
          padding: 10px 20px;
          font-size: 1em;
          color: red;
          text-shadow: 0 0 2px red;
          background: black;
          margin: 20px auto;
          display: inline-block;
          cursor: pointer;
          text-decoration: none;
          animation: glitch 0.3s infinite;
        }

        .glitch-button:hover {
          animation: none;
          color: #00ffe0;
          background-color: #111;
          box-shadow: 0 0 12px #00ffe0, 0 0 24px #00ffe0;
          text-shadow: 0 0 6px #00ffe0;
          transition: all 0.3s ease-in-out;
        }
      `}</style>
    </div>
  );
}
