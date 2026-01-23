// /app/lightening/page.tsx
// Gesture handoff audio: Check sessionStorage flag and attempt audio on ready

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import HelpButton from "@/components/HelpButton";
import { writeContestEmail } from "@/lib/identity";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

const LIGHTNING_VIDEO_ID = "ofr9MTgh2mM";
const VIDEO_DURATION_SECONDS = 9; // Approximate duration for failsafe timer

export default function LighteningPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showContinue, setShowContinue] = useState(false);
  const [showEnableAudio, setShowEnableAudio] = useState(false);
  const continueTimerRef = useRef<NodeJS.Timeout | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const youtubePlayerRef = useRef<any>(null);
  const audioAttemptedRef = useRef(false);
  
  // 2.4: Use window.location.origin for all API calls (no cross-origin guessing)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  
  console.log('[Lightening] Page render - baseUrl:', baseUrl);

  // Read and store email from query string
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const emailFromQuery = searchParams.get('email');
    
    if (emailFromQuery) {
      const normalizedEmail = emailFromQuery.trim().toLowerCase();
      console.log('[Lightening] Found email in query string, storing:', normalizedEmail);
      
      // Store email using the app's identity system
      writeContestEmail(normalizedEmail);
      
      // Also call login API to set cookie (use same origin)
      fetch(`${baseUrl}/api/contest/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
        credentials: 'include',
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.ok) {
            console.log('[Lightening] Email stored and cookie set');
          } else {
            console.warn('[Lightening] Failed to set cookie:', data);
          }
        })
        .catch((err) => {
          console.warn('[Lightening] Error setting cookie:', err);
          // Don't block - continue anyway
        });
    }
  }, [searchParams, baseUrl]);

  // 2.3: Failsafe timer - show Continue button after video duration
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Start timer immediately
    continueTimerRef.current = setTimeout(() => {
      console.log('[Lightening] Failsafe timer expired - showing Continue button');
      setShowContinue(true);
    }, VIDEO_DURATION_SECONDS * 1000);
    
    return () => {
      if (continueTimerRef.current) {
        clearTimeout(continueTimerRef.current);
      }
    };
  }, []);

  // Gesture handoff: Attempt audio on ready if flag exists
  const attemptAudio = () => {
    if (audioAttemptedRef.current || !youtubePlayerRef.current) return;
    
    audioAttemptedRef.current = true;
    console.log('[Lightening] Attempting audio (gesture handoff)');
    
    try {
      const player = youtubePlayerRef.current;
      
      // Unmute and set volume
      player.unMute();
      player.setVolume(100);
      
      // Ensure video is playing
      const state = player.getPlayerState();
      if (state !== window.YT.PlayerState.PLAYING) {
        player.playVideo();
      }
      
      console.log('[Lightening] ✅ Audio enabled via gesture handoff');
      
      // Clear flag after successful attempt
      if (typeof window !== 'undefined' && window.sessionStorage) {
        sessionStorage.removeItem('allow_lightening_audio');
      }
      
      // Hide enable audio button if it was showing
      setShowEnableAudio(false);
    } catch (error) {
      console.warn('[Lightening] Audio attempt failed:', error);
      // Show enable audio button as fallback
      setShowEnableAudio(true);
      audioAttemptedRef.current = false; // Allow retry
    }
  };

  // Load YouTube IFrame API and initialize player
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Check for gesture handoff flag
    const hasAudioFlag = typeof window.sessionStorage !== 'undefined' && 
                        sessionStorage.getItem('allow_lightening_audio') === '1';
    
    console.log('[Lightening] Gesture handoff flag:', hasAudioFlag);
    
    // Load YouTube IFrame API
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

    const initializePlayer = () => {
      if (!window.YT || !window.YT.Player || !playerRef.current) {
        console.log('[Lightening] YouTube API not ready yet');
        return;
      }

      if (youtubePlayerRef.current) {
        return; // Already initialized
      }

      console.log('[Lightening] Initializing YouTube player');
      
      try {
        youtubePlayerRef.current = new window.YT.Player(playerRef.current, {
          videoId: LIGHTNING_VIDEO_ID,
          host: 'https://www.youtube.com',
          playerVars: {
            autoplay: 1,
            mute: 1, // Start muted for autoplay compatibility
            controls: 0,
            rel: 0,
            playsinline: 1,
            origin: typeof window !== 'undefined' ? window.location.origin : undefined,
          },
          events: {
            onReady: (event: any) => {
              console.log('[Lightening] YouTube player ready');
              
              // Gesture handoff: If flag exists, attempt audio immediately
              if (hasAudioFlag) {
                console.log('[Lightening] Flag detected - attempting audio on ready');
                attemptAudio();
              } else {
                // No flag - video will play muted, show enable audio button after a delay
                setTimeout(() => {
                  setShowEnableAudio(true);
                }, 2000);
              }
            },
            onStateChange: (event: any) => {
              const state = event.data;
              console.log('[Lightening] Player state changed:', state);
              
              if (state === window.YT.PlayerState.ENDED) {
                console.log('[Lightening] Video ended - auto-forwarding to contest');
                // Auto-forward on ENDED event
                handleContinue();
              } else if (state === window.YT.PlayerState.PLAYING && hasAudioFlag && !audioAttemptedRef.current) {
                // If video started playing and we have the flag, try audio again
                attemptAudio();
              }
            },
            onError: (event: any) => {
              console.error('[Lightening] YouTube Player Error:', event.data);
              setShowEnableAudio(true);
            },
          },
        });
      } catch (error) {
        console.error('[Lightening] Error initializing player:', error);
        setShowEnableAudio(true);
      }
    };

    // Wait for YouTube API to be ready
    if (window.YT && window.YT.Player) {
      setTimeout(initializePlayer, 100);
    } else {
      const originalCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        console.log('[Lightening] YouTube API ready');
        if (originalCallback) originalCallback();
        setTimeout(initializePlayer, 100);
      };
    }

    return () => {
      if (youtubePlayerRef.current) {
        try {
          youtubePlayerRef.current.destroy();
          youtubePlayerRef.current = null;
        } catch (e) {
          console.warn('[Lightening] Error destroying player:', e);
        }
      }
    };
  }, []);

  const handleContinue = () => {
    const queryString = window.location.search;
    const contestUrl = `/contest${queryString}`;
    console.log('[Lightening] Continue clicked - redirecting to:', contestUrl);
    router.push(contestUrl);
  };

  const handleEnableAudio = () => {
    console.log('[Lightening] Enable Audio button clicked');
    attemptAudio();
  };

  // 2.1: Render immediately - never return null
  return (
    <>
      <div 
        style={{ 
          height: "100vh", 
          width: "100vw", 
          backgroundColor: "black", 
          overflow: "hidden", 
          position: "relative"
        }}
      >
        {/* YouTube player container */}
        <div 
          ref={playerRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            width: "100%",
            zIndex: 1
          }}
        />
        
        {/* Enable Audio button overlay - shown if audio is blocked */}
        {showEnableAudio && (
          <div style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 3,
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            alignItems: "center"
          }}>
            <button
              onClick={handleEnableAudio}
              style={{
                padding: "16px 32px",
                fontSize: "18px",
                backgroundColor: "#00ff7f",
                color: "black",
                border: "2px solid white",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "bold",
                boxShadow: "0 0 20px rgba(0, 255, 127, 0.5)"
              }}
            >
              🔊 ENABLE AUDIO
            </button>
            <p style={{
              color: "white",
              fontSize: "14px",
              textAlign: "center",
              margin: 0
            }}>
              Click to enable sound
            </p>
          </div>
        )}
        
        {/* Continue button - shown after timer or if video ends */}
        {showContinue && (
          <div style={{
            position: "absolute",
            bottom: 30,
            right: 30,
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            alignItems: "flex-end"
          }}>
            <button
              onClick={handleContinue}
              style={{
                padding: "12px 24px",
                fontSize: "16px",
                backgroundColor: "#00ff7f",
                color: "black",
                border: "2px solid white",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "bold"
              }}
            >
              Continue ▶
            </button>
          </div>
        )}
        
      </div>
      <HelpButton />
    </>
  );
}
