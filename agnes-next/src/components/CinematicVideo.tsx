'use client';

import { useState, useRef, useEffect } from 'react';

interface CinematicVideoProps {
  src: string;
  poster?: string;
  className?: string;
  autoUnmute?: boolean; // If true, automatically unmute and play with sound (no overlay)
  onEnded?: () => void; // Callback when video ends
  loop?: boolean; // Whether to loop (default: true)
  mode?: 'fullscreen' | 'inline'; // Display mode: fullscreen (fixed overlay) or inline (normal flow)
}

export default function CinematicVideo({
  src,
  poster,
  className,
  autoUnmute = false,
  onEnded,
  loop = true,
  mode = 'fullscreen',
}: CinematicVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true); // Always start muted for autoplay compatibility
  const [showUnmuteOverlay, setShowUnmuteOverlay] = useState(!autoUnmute); // Hide overlay if autoUnmute
  const [hasError, setHasError] = useState(false);

  // Auto-unmute logic: start muted (for autoplay), then unmute once playing
  // Similar strategy to YouTube IFrame API: start muted, play, then aggressively unmute
  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;

    // If autoUnmute is enabled, unmute once video starts playing
    if (autoUnmute) {
      // Never show overlay when autoUnmute is enabled
      setShowUnmuteOverlay(false);

      // Aggressive unmute strategy (like YouTube API)
      const attemptUnmute = () => {
        try {
          if (video.muted) {
            video.muted = false;
            setIsMuted(false);
            console.log('[CinematicVideo] Unmuted successfully');
            return true;
          }
        } catch (error) {
          console.log('[CinematicVideo] Unmute attempt failed (will retry):', error);
        }
        return false;
      };

      const handlePlaying = () => {
        // Video is playing - try to unmute immediately
        if (!attemptUnmute()) {
          // Retry after a short delay (like YouTube does)
          setTimeout(() => {
            attemptUnmute();
          }, 500);
        }
      };

      const handlePlay = () => {
        // Video started playing - try to unmute
        attemptUnmute();
      };

      // Try to unmute once video can play (may work if user has interacted)
      const handleCanPlay = async () => {
        try {
          // Try to ensure video is playing
          if (video.paused) {
            await video.play();
          }
          // Try unmute immediately
          attemptUnmute();
        } catch (error) {
          // Expected - will unmute on play event instead
          console.log('[CinematicVideo] CanPlay unmute blocked (will try on play)');
        }
      };

      // Also try unmute after video starts (similar to YouTube's setTimeout strategy)
      const handleLoadedData = async () => {
        try {
          if (video.paused) {
            await video.play();
          }
          // Wait a moment then try unmute (like YouTube does)
          setTimeout(() => {
            const state = video.readyState;
            if (state >= 2 && !video.paused) {
              // Video has data and is playing
              if (!attemptUnmute()) {
                // Retry once more
                setTimeout(() => attemptUnmute(), 1000);
              }
            }
          }, 500);
        } catch (error) {
          console.log('[CinematicVideo] LoadedData play/unmute failed:', error);
        }
      };

      video.addEventListener('playing', handlePlaying);
      video.addEventListener('play', handlePlay);
      video.addEventListener('canplay', handleCanPlay);
      video.addEventListener('loadeddata', handleLoadedData);

      return () => {
        video.removeEventListener('playing', handlePlaying);
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('loadeddata', handleLoadedData);
      };
    }
  }, [autoUnmute]);

  const handleUnmute = async () => {
    if (!videoRef.current) return;

    try {
      // Unmute and play (some browsers need play() after unmute)
      videoRef.current.muted = false;
      setIsMuted(false);
      setShowUnmuteOverlay(false);

      // Ensure video is playing
      if (videoRef.current.paused) {
        await videoRef.current.play();
      }
    } catch (error) {
      console.error('[CinematicVideo] Error unmuting:', error);
      // Keep overlay visible if unmute fails
      setShowUnmuteOverlay(true);
    }
  };

  const handleVideoError = () => {
    console.error('[CinematicVideo] Video failed to load:', src);
    setHasError(true);
    setShowUnmuteOverlay(false);
  };

  const handleVideoEnded = () => {
    if (onEnded) {
      onEnded();
    }
  };

  // Hide overlay after user interacts (they've seen it)
  useEffect(() => {
    if (!isMuted && showUnmuteOverlay && !autoUnmute) {
      // Auto-hide after a short delay once unmuted
      const timer = setTimeout(() => {
        setShowUnmuteOverlay(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isMuted, showUnmuteOverlay, autoUnmute]);

  // Ensure video plays on mount (especially for autoUnmute mode)
  // Use similar strategy to YouTube: try multiple times with delays
  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;

    // Force play attempt on mount (like YouTube API does)
    const attemptPlay = async () => {
      try {
        if (video.paused) {
          await video.play();
          console.log('[CinematicVideo] Video play() called');
          
          // If autoUnmute, try unmute immediately after play (like YouTube does)
          if (autoUnmute) {
            setTimeout(() => {
              try {
                video.muted = false;
                setIsMuted(false);
                console.log('[CinematicVideo] Unmuted after play()');
              } catch (e) {
                console.log('[CinematicVideo] Unmute after play() failed (will retry on events)');
              }
            }, 300);
          }
        }
      } catch (error) {
        console.warn('[CinematicVideo] Failed to play:', error);
      }
    };

    // Try immediately and after delays (like YouTube retry strategy)
    attemptPlay();
    const timer1 = setTimeout(attemptPlay, 100);
    const timer2 = setTimeout(attemptPlay, 500);
    
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [autoUnmute]);

  // Handle click on container to ensure playback (for autoUnmute mode)
  const handleContainerClick = async () => {
    if (!videoRef.current || !autoUnmute) return;
    
    try {
      if (videoRef.current.paused) {
        await videoRef.current.play();
      }
      // Unmute on click (user interaction allows this)
      videoRef.current.muted = false;
      setIsMuted(false);
    } catch (error) {
      console.warn('[CinematicVideo] Failed to play/unmute on click:', error);
    }
  };

  // Container styles based on mode
  const containerStyles: React.CSSProperties =
    mode === 'fullscreen'
      ? {
          position: 'fixed',
          inset: 0,
          backgroundColor: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          cursor: autoUnmute ? 'default' : 'auto',
        }
      : {
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          backgroundColor: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          cursor: autoUnmute ? 'default' : 'auto',
        };

  return (
    <div
      onClick={autoUnmute ? handleContainerClick : undefined}
      style={containerStyles}
      className={className}
    >
      {hasError ? (
        <div
          style={{
            color: '#fff',
            fontSize: '18px',
            textAlign: 'center',
            padding: '2rem',
          }}
        >
          Video unavailable
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            src={src}
            poster={poster}
            playsInline
            autoPlay
            muted={isMuted}
            loop={loop}
            preload="auto"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
            onError={handleVideoError}
            onEnded={handleVideoEnded}
            onLoadedData={async () => {
              // Ensure video starts playing when data is loaded
              if (videoRef.current && videoRef.current.paused) {
                try {
                  await videoRef.current.play();
                } catch (error) {
                  console.warn('[CinematicVideo] Failed to play on loadedData:', error);
                }
              }
            }}
          />

          {/* Unmute overlay - shown while muted (never show if autoUnmute is enabled) */}
          {!autoUnmute && showUnmuteOverlay && isMuted && (
            <button
              onClick={handleUnmute}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                padding: '16px 32px',
                fontSize: '18px',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                color: '#fff',
                border: '2px solid rgba(255, 255, 255, 0.8)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                zIndex: 10,
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
                e.currentTarget.style.borderColor = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.8)';
              }}
            >
              Tap for sound
            </button>
          )}
        </>
      )}
    </div>
  );
}
