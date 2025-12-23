// /app/lightening/page.tsx

"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import HelpButton from "@/components/HelpButton";
import { writeContestEmail } from "@/lib/identity";

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
  const searchParams = useSearchParams();
  const [playerReady, setPlayerReady] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  
  // Determine base URL for navigation - dev-only, stateless (no localStorage)
  const getBaseUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    
    // Only use ngrok logic in development
    const isDev = process.env.NODE_ENV === 'development';
    if (!isDev) {
      // Production: use relative paths (normal Next.js behavior)
      return '';
    }
    
    // Check if NEXT_PUBLIC_SITE_URL is set and points to ngrok
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (siteUrl && (siteUrl.includes('ngrok') || siteUrl.includes('ngrok-free.app'))) {
      console.log('[Lightening] Dev mode: Using NEXT_PUBLIC_SITE_URL:', siteUrl);
      return siteUrl;
    }
    
    // Check if we're already on ngrok
    const hostname = window.location.hostname;
    if (hostname.includes('ngrok') || hostname.includes('ngrok-free.app')) {
      const currentOrigin = `${window.location.protocol}//${window.location.host}`;
      console.log('[Lightening] Dev mode: Detected ngrok hostname, using:', currentOrigin);
      return currentOrigin;
    }
    
    // Default: use current origin (will be localhost in dev)
    const currentOrigin = `${window.location.protocol}//${window.location.host}`;
    console.log('[Lightening] Dev mode: Using current origin:', currentOrigin);
    return currentOrigin;
  }, []);
  
  // Read and store email from query string (ngrok-side storage)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const emailFromQuery = searchParams.get('email');
    
    if (emailFromQuery) {
      const normalizedEmail = emailFromQuery.trim().toLowerCase();
      console.log('[Lightening] Found email in query string, storing:', normalizedEmail);
      
      // Store email using the app's identity system
      writeContestEmail(normalizedEmail);
      
      // Also call login API to set cookie (ensures cookie is set on ngrok domain)
      fetch('/api/contest/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
        credentials: 'include',
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.ok) {
            console.log('[Lightening] Email stored and cookie set on ngrok domain');
          } else {
            console.warn('[Lightening] Failed to set cookie on ngrok domain:', data);
          }
        })
        .catch((err) => {
          console.warn('[Lightening] Error setting cookie on ngrok domain:', err);
        });
    }
  }, [searchParams]);

  // Skip redirect - EmailModal should already redirect to ngrok directly
  // This prevents the reload loop where page loads then redirects
  // Only redirect if we somehow ended up on localhost without ngrok configured
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const isDev = process.env.NODE_ENV === 'development';
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const currentHostname = window.location.hostname;
    const isOnNgrok = currentHostname.includes('ngrok') || currentHostname.includes('ngrok-free.app');
    const isOnLocalhost = currentHostname === 'localhost' || currentHostname === '127.0.0.1';
    
    // Only redirect if we're on localhost AND ngrok is configured AND we're in dev
    // This should rarely happen since EmailModal redirects to ngrok directly
    if (isDev && isOnLocalhost && siteUrl && (siteUrl.includes('ngrok') || siteUrl.includes('ngrok-free.app')) && !isOnNgrok) {
      const ngrokUrl = `${siteUrl}/lightening${window.location.search}`;
      console.log('[Lightening] Redirecting from localhost to ngrok:', ngrokUrl);
      window.location.replace(ngrokUrl); // Use replace instead of href to prevent back button issues
      return;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // On ngrok, use fallback iframe immediately for faster loading (no API wait)
    const isOnNgrok = window.location.hostname.includes('ngrok') || window.location.hostname.includes('ngrok-free.app');
    if (isOnNgrok) {
      console.log('[Lightening] On ngrok - using direct iframe for faster loading');
      setUseFallback(true);
      // Still try to load API in background for better control, but don't wait
      if (!window.YT) {
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
      return; // Exit early - fallback will handle everything
    }

    // Load YouTube IFrame API (for localhost or when not using fallback)
    if (!window.YT) {
      // Check if script is already being loaded
      const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      if (!existingScript) {
        console.log('[Lightening] Loading YouTube IFrame API script');
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        tag.async = true;
        tag.defer = true;
        tag.onerror = () => {
          console.error('[Lightening] Failed to load YouTube API script, using fallback');
          setUseFallback(true);
          setPlayerReady(true);
        };
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
                
                // When video ends, redirect to contest page immediately (preserve query string)
                if (state === window.YT.PlayerState.ENDED) {
                  console.log('[Lightening] Video ended, redirecting to contest page');
                  const queryString = window.location.search;
                  const contestUrl = getBaseUrl && !getBaseUrl.includes('localhost') 
                    ? `${getBaseUrl}/contest${queryString}`
                    : `/contest${queryString}`;
                  
                  if (getBaseUrl && !getBaseUrl.includes('localhost')) {
                    // Use full URL redirect for ngrok
                    console.log('[Lightening] Redirecting to ngrok URL:', contestUrl);
                    window.location.href = contestUrl;
                  } else {
                    console.log('[Lightening] Redirecting to localhost');
                    router.push(contestUrl);
                  }
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
      // Set up API ready callback
      const originalCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        console.log('[Lightening] YouTube API ready');
        if (originalCallback) originalCallback();
        setTimeout(initializePlayer, 100);
      };
      
      // More aggressive fallback: if API doesn't load within 800ms, use direct iframe (faster loading)
      const fallbackTimer = setTimeout(() => {
        if (!youtubePlayerRef.current && !useFallback) {
          console.warn('[Lightening] YouTube API timeout (800ms), using fallback iframe for faster loading');
          setUseFallback(true);
          setPlayerReady(true); // Mark as ready so loading message disappears
        }
      }, 800);
      
      // Also check periodically if API loaded (check more frequently for faster response)
      const checkTimer = setInterval(() => {
        if (window.YT && window.YT.Player && !youtubePlayerRef.current) {
          console.log('[Lightening] YouTube API detected, initializing player');
          clearTimeout(fallbackTimer);
          clearInterval(checkTimer);
          setTimeout(initializePlayer, 50); // Reduced delay
        } else if (youtubePlayerRef.current) {
          clearTimeout(fallbackTimer);
          clearInterval(checkTimer);
        }
      }, 100); // Check every 100ms instead of 200ms
      
      return () => {
        clearTimeout(fallbackTimer);
        clearInterval(checkTimer);
        // Restore original callback if it existed
        if (originalCallback) {
          window.onYouTubeIframeAPIReady = originalCallback;
        } else {
          delete window.onYouTubeIframeAPIReady;
        }
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
    const queryString = window.location.search;
    const contestUrl = getBaseUrl && !getBaseUrl.includes('localhost')
      ? `${getBaseUrl}/contest${queryString}`
      : `/contest${queryString}`;
    
    if (getBaseUrl && !getBaseUrl.includes('localhost')) {
      // Use full URL redirect for ngrok
      console.log('[Lightening] Skip button - redirecting to ngrok URL:', contestUrl);
      window.location.href = contestUrl;
    } else {
      console.log('[Lightening] Skip button - redirecting to localhost');
      router.push(contestUrl);
    }
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
          // Fallback: Direct iframe for faster loading (no API wait)
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
              console.log('[Lightening] Fallback iframe loaded - video should start playing');
              setPlayerReady(true);
              
              // Listen for postMessage from YouTube iframe to detect video end
              const handleMessage = (event: MessageEvent) => {
                // YouTube iframe sends messages when video ends
                if (event.data === 'ended' || (event.data && event.data.event === 'onStateChange' && event.data.info === 0)) {
                  console.log('[Lightening] Fallback video ended, redirecting');
                  const queryString = window.location.search;
                  const contestUrl = getBaseUrl && !getBaseUrl.includes('localhost')
                    ? `${getBaseUrl}/contest${queryString}`
                    : `/contest${queryString}`;
                  
                  if (getBaseUrl && !getBaseUrl.includes('localhost')) {
                    console.log('[Lightening] Fallback - redirecting to ngrok URL:', contestUrl);
                    window.location.href = contestUrl;
                  } else {
                    console.log('[Lightening] Fallback - redirecting to localhost');
                    router.push(contestUrl);
                  }
                  window.removeEventListener('message', handleMessage);
                }
              };
              window.addEventListener('message', handleMessage);
              
              // Fallback: redirect after video duration (approximately 2 minutes)
              // User can also use skip button
              setTimeout(() => {
                const queryString = window.location.search;
                const contestUrl = getBaseUrl && !getBaseUrl.includes('localhost')
                  ? `${getBaseUrl}/contest${queryString}`
                  : `/contest${queryString}`;
                
                if (getBaseUrl && !getBaseUrl.includes('localhost')) {
                  console.log('[Lightening] Fallback timeout - redirecting to ngrok URL:', contestUrl);
                  window.location.href = contestUrl;
                } else {
                  console.log('[Lightening] Fallback timeout - redirecting to localhost');
                  router.push(contestUrl);
                }
              }, 120000); // 2 minutes fallback
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
            <div 
              style={{
                marginTop: "1rem",
                fontSize: "14px",
                color: "#00ff7f",
                cursor: "pointer",
                textDecoration: "underline"
              }}
              onClick={(e) => {
                e.stopPropagation();
                handleSkip();
              }}
            >
              (Click here if video doesn't load)
            </div>
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
