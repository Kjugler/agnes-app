// /app/lightening/page.tsx

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HelpButton from "@/components/HelpButton";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export default function LighteningPage() {
  const playerRef = useRef<HTMLDivElement>(null);
  const youtubePlayerRef = useRef<any>(null);
  const router = useRouter();
  const [playerReady, setPlayerReady] = useState(false);
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Load YouTube IFrame API
    if (!window.YT) {
      // Check if script is already being loaded
      const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      if (!existingScript) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        tag.async = true;
        tag.defer = true;
        const firstScriptTag = document.getElementsByTagName("script")[0];
        if (firstScriptTag && firstScriptTag.parentNode) {
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        } else {
          document.head.appendChild(tag);
        }
      }
    }

    const initializePlayer = () => {
      if (!window.YT || !window.YT.Player) {
        console.log('[Lightening] YouTube API not ready yet');
        return;
      }

      const containerId = 'player';
      const container = document.getElementById(containerId);
      
      if (!container) {
        console.log('[Lightening] Container not found, retrying...');
        setTimeout(initializePlayer, 500);
        return;
      }

      if (!youtubePlayerRef.current) {
        console.log('[Lightening] Initializing YouTube player');
        try {
          youtubePlayerRef.current = new window.YT.Player(containerId, {
            videoId: "ofr9MTgh2mM",
            playerVars: {
              autoplay: 1,
              mute: 1, // Start muted for autoplay compatibility
              controls: 1,
              modestbranding: 1,
              loop: 0,
              rel: 0,
              enablejsapi: 1,
            },
            events: {
              onReady: (event: any) => {
                console.log('[Lightening] Video ready, starting playback');
                setPlayerReady(true);
                const player = event.target;
                
                // Aggressive autoplay with audio
                const startPlayback = () => {
                  try {
                    // Start playing immediately
                    player.playVideo();
                    console.log('[Lightening] Play command sent');
                    
                    // Try to unmute immediately (might work if browser allows)
                    try {
                      player.unMute();
                    } catch (e) {
                      console.log('[Lightening] Immediate unmute failed, will retry:', e);
                    }
                    
                    // Check playback state and unmute
                    const checkAndUnmute = () => {
                      try {
                        const state = player.getPlayerState();
                        console.log('[Lightening] Player state:', state);
                        
                        if (state === window.YT.PlayerState.PLAYING) {
                          // Video is playing - unmute it
                          try {
                            player.unMute();
                            console.log('[Lightening] Video playing, unmuted for audio');
                          } catch (e) {
                            console.log('[Lightening] Could not unmute:', e);
                            // Keep trying
                            setTimeout(checkAndUnmute, 500);
                          }
                        } else if (state === window.YT.PlayerState.UNSTARTED || state === window.YT.PlayerState.CUED) {
                          // Not playing yet, try again
                          console.log('[Lightening] Video not playing yet, retrying play...');
                          try {
                            player.playVideo();
                            setTimeout(checkAndUnmute, 500);
                          } catch (e) {
                            console.log('[Lightening] Retry play failed:', e);
                            setTimeout(checkAndUnmute, 1000);
                          }
                        } else {
                          // Other state, check again
                          setTimeout(checkAndUnmute, 500);
                        }
                      } catch (e) {
                        console.error('[Lightening] Error checking state:', e);
                      }
                    };
                
                    // Start checking immediately and repeatedly
                    setTimeout(checkAndUnmute, 200);
                    setTimeout(checkAndUnmute, 500);
                    setTimeout(checkAndUnmute, 1000);
                    setTimeout(checkAndUnmute, 2000);
                  } catch (e) {
                    console.error('[Lightening] Error starting playback:', e);
                    // Retry after a delay
                    setTimeout(() => {
                      try {
                        player.playVideo();
                      } catch (e2) {
                        console.error('[Lightening] Retry failed:', e2);
                      }
                    }, 1000);
                  }
                };
                
                // Start playback immediately
                startPlayback();
                
                // Also try after a short delay in case first attempt doesn't work
                setTimeout(startPlayback, 300);
              },
              onStateChange: (event: any) => {
                const state = event.data;
                console.log('[Lightening] State changed:', state);
                
                // When video ends, redirect to contest page immediately
                if (state === window.YT.PlayerState.ENDED) {
                  console.log('[Lightening] Video ended, redirecting to contest page');
                  router.push("/contest");
                } else if (state === window.YT.PlayerState.PLAYING) {
                  // Video is playing - ensure it's unmuted for audio
                  try {
                    event.target.unMute();
                    console.log('[Lightening] Video playing, ensured unmuted');
                  } catch (e) {
                    console.log('[Lightening] Could not unmute during playback:', e);
                    // Try again
                    setTimeout(() => {
                      try {
                        event.target.unMute();
                      } catch (e2) {
                        console.log('[Lightening] Second unmute attempt failed:', e2);
                      }
                    }, 500);
                  }
                } else if (state === window.YT.PlayerState.PAUSED) {
                  // If paused, try to resume (shouldn't happen, but just in case)
                  console.log('[Lightening] Video paused, attempting to resume');
                  setTimeout(() => {
                    try {
                      event.target.playVideo();
                      event.target.unMute();
                    } catch (e) {
                      console.log('[Lightening] Could not resume:', e);
                    }
                  }, 500);
                }
              },
              onError: (event: any) => {
                console.error('[Lightening] YouTube Player Error:', event.data);
              },
            },
          });
        } catch (error) {
          console.error('[Lightening] Error initializing player:', error);
        }
      }
    };

    // Wait for YouTube API to be ready
    if (window.YT && window.YT.Player) {
      setTimeout(initializePlayer, 100);
    } else {
      window.onYouTubeIframeAPIReady = () => {
        console.log('[Lightening] YouTube API ready');
        setTimeout(initializePlayer, 100);
      };
      
      // Fallback: if API doesn't load within 3 seconds, use direct iframe
      const fallbackTimer = setTimeout(() => {
        if (!youtubePlayerRef.current && !useFallback) {
          console.warn('[Lightening] YouTube API timeout, using fallback iframe');
          setUseFallback(true);
        }
      }, 3000);
      
      // Clear timer if player initializes
      const checkTimer = setInterval(() => {
        if (youtubePlayerRef.current) {
          clearTimeout(fallbackTimer);
          clearInterval(checkTimer);
        }
      }, 500);
      
      return () => {
        clearTimeout(fallbackTimer);
        clearInterval(checkTimer);
        // Cleanup
        if (youtubePlayerRef.current) {
          try {
            youtubePlayerRef.current.destroy();
            youtubePlayerRef.current = null;
          } catch (e) {
            console.warn('[Lightening] Error destroying player:', e);
          }
        }
      };
    }

    return () => {
      // Cleanup
      if (youtubePlayerRef.current) {
        try {
          youtubePlayerRef.current.destroy();
          youtubePlayerRef.current = null;
        } catch (e) {
          console.warn('[Lightening] Error destroying player:', e);
        }
      }
    };
  }, [router]);

  const handleSkip = () => {
    router.push("/contest");
  };

  // Handle page click to trigger playback if autoplay was blocked
  const handlePageClick = () => {
    if (youtubePlayerRef.current) {
      try {
        const state = youtubePlayerRef.current.getPlayerState();
        if (state === window.YT.PlayerState.UNSTARTED || state === window.YT.PlayerState.CUED) {
          console.log('[Lightening] User clicked, starting playback');
          youtubePlayerRef.current.playVideo();
          youtubePlayerRef.current.unMute();
        }
      } catch (e) {
        console.log('[Lightening] Error on click:', e);
      }
    }
  };

  return (
    <>
      <div 
        onClick={handlePageClick}
        style={{ 
          height: "100vh", 
          width: "100vw", 
          backgroundColor: "black", 
          overflow: "hidden", 
          position: "relative", 
          cursor: "pointer" 
        }}
      >
        {/* YouTube video player container */}
        {useFallback ? (
          // Fallback: Direct iframe if API fails to load
          <iframe
            id="player-fallback"
            src="https://www.youtube.com/embed/ofr9MTgh2mM?autoplay=1&mute=0&controls=1&rel=0&modestbranding=1&enablejsapi=1&loop=0&playlist=ofr9MTgh2mM"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              height: "100%",
              width: "100%",
              zIndex: 1,
              border: "none"
            }}
            allow="autoplay; encrypted-media"
            allowFullScreen
            onLoad={() => {
              console.log('[Lightening] Fallback iframe loaded');
              setPlayerReady(true);
            }}
            onEnded={() => {
              console.log('[Lightening] Fallback video ended, redirecting');
              router.push("/contest");
            }}
          />
        ) : (
          <div 
            id="player" 
            ref={playerRef} 
            style={{ 
              position: "absolute", 
              top: 0, 
              left: 0, 
              height: "100%", 
              width: "100%", 
              zIndex: 1,
              minHeight: "100vh",
              minWidth: "100vw"
            }} 
          />
        )}
        
        {/* Loading indicator - shows while video is loading */}
        {!playerReady && !useFallback && (
          <div style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "white",
            fontSize: "18px",
            zIndex: 2,
            textAlign: "center"
          }}>
            Loading video...
          </div>
        )}
        <button
          onClick={handleSkip}
          style={{
            position: "absolute",
            bottom: 30,
            right: 30,
            zIndex: 2,
            padding: "12px 20px",
            fontSize: "16px",
            background: "red",
            color: "white",
            border: "2px solid white",
            borderRadius: "8px",
            cursor: "pointer"
          }}
        >
          Skip ▶
        </button>
      </div>
      <HelpButton />
    </>
  );
}
