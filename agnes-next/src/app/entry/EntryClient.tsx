'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const FULL_TEXT = 'THE AGNES PROTOCOL';

// Create glitched version with character blocks (redaction effect)
function getGlitchedText(text: string, frame: number): string {
  // Every ~200ms, replace 2-3 random characters with blocks
  if (frame % 3 === 0) {
    const chars = text.split('');
    const indices = [5, 11, 16]; // Positions for AGNES, PROTOCOL
    const blockIndices = indices.slice(0, Math.floor(Math.random() * 2) + 2);
    blockIndices.forEach((idx) => {
      if (idx < chars.length) {
        chars[idx] = '▮';
      }
    });
    return chars.join('');
  }
  return text;
}

export default function EntryClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [visibleCount, setVisibleCount] = useState(0);
  const [isInterference, setIsInterference] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [flashSync, setFlashSync] = useState(false);
  const [glitchFrame, setGlitchFrame] = useState(0);
  const [skipRouting, setSkipRouting] = useState(false);
  
  // 2) Prevent double entry: if coming from /start, skip entry routing (middleware handles it)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Check if we came from /start (referrer check or query param)
    const referrer = document.referrer;
    const fromStart = referrer.includes('/start') || searchParams.get('from') === 'start';
    
    // If coming from /start, don't do entry routing - let middleware handle it
    if (fromStart) {
      console.log('[entry] Skipping entry routing - came from /start (middleware handles routing)');
      setSkipRouting(true);
      return;
    }
  }, [searchParams]);

  useEffect(() => {
    // 2) Skip routing if we came from /start
    if (skipRouting) {
      return;
    }
    
    // Typewriter effect: increment visibleCount every ~60ms
    if (visibleCount < FULL_TEXT.length) {
      const timer = setTimeout(() => {
        setVisibleCount((prev) => prev + 1);
      }, 60);
      return () => clearTimeout(timer);
    }

    // After typewriter completes, wait 400ms, then start interference
    if (visibleCount === FULL_TEXT.length && !isInterference && !isComplete) {
      const holdTimer = setTimeout(() => {
        setIsInterference(true);
        
        // Sync loss flash at ~60% through glitch (840ms into 1400ms)
        const flashTimer = setTimeout(() => {
          setFlashSync(true);
          setTimeout(() => setFlashSync(false), 80);
        }, 840);
        
        // Glitch frame counter for character replacement
        const frameInterval = setInterval(() => {
          setGlitchFrame((prev) => prev + 1);
        }, 200);
        
        // After 1400ms interference, cut to black and redirect
        const glitchTimer = setTimeout(() => {
          clearInterval(frameInterval);
          setIsInterference(false);
          setIsComplete(true);
          
          // Clean fade to black (120ms hard cut)
          setTimeout(() => {
            // 2) Skip routing if we came from /start (prevents ping-pong)
            if (skipRouting) {
              console.log('[entry] Skipping routing - came from /start');
              return;
            }
            
            // Preserve query params
            const queryString = searchParams.toString();
            
            // ✅ Referral links now go through /start (splitter) - removed direct contest routing
            // If someone hits /entry?ref=..., middleware will redirect to /start?ref=...
            // This ensures referral links go through the variant splitter
            
            // Check if this is terminal variant (matches middleware logic)
            // Priority: v= param > entry= param > cookie > random
            const vParam = searchParams.get('v');
            const entryParam = searchParams.get('entry');
            
            // Read cookie (if available)
            let cookieVariant: string | null = null;
            if (typeof document !== 'undefined') {
              const cookies = document.cookie.split(';');
              const variantCookie = cookies.find(c => c.trim().startsWith('entry_variant='));
              if (variantCookie) {
                cookieVariant = variantCookie.split('=')[1]?.trim() || null;
              }
            }
            
            // Determine variant using same priority as middleware
            let isTerminalVariant = false;
            if (vParam === 'terminal' || entryParam === 'terminal') {
              isTerminalVariant = true;
            } else if (vParam === 'protocol' || entryParam === 'protocol') {
              isTerminalVariant = false;
            } else if (cookieVariant === 'terminal') {
              isTerminalVariant = true;
            } else if (cookieVariant === 'protocol') {
              isTerminalVariant = false;
            } else {
              // No variant set - random 50/50 (matches middleware)
              isTerminalVariant = Math.random() < 0.5;
            }
            
            if (isTerminalVariant) {
              // Terminal variant: navigate directly to terminal-proxy (bypass /start)
              // Add skipLoad=1 to skip LoadingScreen in Vite app
              // Preserve v= param so middleware can set cookie correctly
              const terminalParams = new URLSearchParams(queryString);
              terminalParams.set('embed', '1');
              terminalParams.set('skipLoad', '1');
              // Ensure v=terminal is set so cookie can be set
              if (!terminalParams.has('v')) {
                terminalParams.set('v', 'terminal');
              }
              
              // Set entry_variant cookie client-side (since /terminal-proxy bypasses middleware)
              if (typeof document !== 'undefined') {
                document.cookie = `entry_variant=terminal; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
              }
              
              const terminalUrl = `/terminal-proxy/?${terminalParams.toString()}`;
              router.replace(terminalUrl);
            } else {
              // Protocol variant: route directly to Protocol Challenge (not via /start)
              // Preserve all query params
              const protocolParams = new URLSearchParams(queryString);
              // Ensure v=protocol is set
              if (!protocolParams.has('v')) {
                protocolParams.set('v', 'protocol');
              }
              
              // Set entry_variant cookie client-side
              if (typeof document !== 'undefined') {
                document.cookie = `entry_variant=protocol; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
              }
              
              const protocolUrl = `/the-protocol-challenge?${protocolParams.toString()}`;
              router.replace(protocolUrl);
            }
          }, 120);
        }, 1400);
        
        return () => {
          clearTimeout(flashTimer);
          clearTimeout(glitchTimer);
          clearInterval(frameInterval);
        };
      }, 400);
      
      return () => clearTimeout(holdTimer);
    }
  }, [visibleCount, isInterference, isComplete, router, searchParams]);

  const displayText = FULL_TEXT.slice(0, visibleCount);
  const glitchedText = isInterference ? getGlitchedText(displayText, glitchFrame) : displayText;
  const showCursor = visibleCount === FULL_TEXT.length && !isInterference && !isComplete;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        zIndex: 9999,
        transition: isComplete ? 'opacity 120ms ease-out' : 'none',
        opacity: isComplete ? 0 : 1,
        overflow: 'hidden',
      }}
    >
      {/* Vignette overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at center, transparent 0%, rgba(0, 0, 0, 0.4) 100%)',
          pointerEvents: 'none',
          zIndex: 4,
        }}
      />

      {/* Scanline overlay */}
      {isInterference && (
        <div
          className="scanline-overlay"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255, 0, 0, 0.08) 2px, rgba(255, 0, 0, 0.08) 4px)',
            pointerEvents: 'none',
            zIndex: 3,
          }}
        />
      )}

      {/* Noise overlay */}
      {isInterference && (
        <div
          className="noise-overlay"
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.4'/%3E%3C/svg%3E")`,
            opacity: 0.3,
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
      )}

      {/* Tear layer (horizontal bands) */}
      {isInterference && (
        <div
          className="tear-layer"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}

      {/* Sync loss flash */}
      {flashSync && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(255, 255, 255, 0.15)',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        />
      )}

      {/* Text container */}
      <div
        style={{
          maxWidth: '92vw',
          textAlign: 'center',
          color: '#ff0000',
          position: 'relative',
          zIndex: 0,
        }}
      >
        {/* Main text */}
        <span
          className={isInterference ? 'glitch-text-interference' : ''}
          style={{
            fontSize: 'clamp(28px, 7vw, 96px)',
            fontWeight: 700,
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
            display: 'inline-block',
            textShadow: isInterference
              ? undefined
              : '0 0 10px rgba(255, 0, 0, 0.3), 0 0 20px rgba(255, 0, 0, 0.15)',
            filter: isInterference ? 'contrast(1.2) saturate(1.2)' : 'drop-shadow(0 0 8px rgba(255, 0, 0, 0.2))',
            position: 'relative',
          }}
        >
          {glitchedText}
          {showCursor && (
            <span
              style={{
                display: 'inline-block',
                width: '0.08em',
                height: '1em',
                background: '#ff0000',
                marginLeft: '0.1em',
                animation: 'blink 1s infinite',
                boxShadow: '0 0 8px rgba(255, 0, 0, 0.4)',
              }}
            />
          )}
        </span>

        {/* RGB clone A (red/cyan offset) - only during interference */}
        {isInterference && (
          <span
            className="glitch-clone-a"
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              fontSize: 'clamp(28px, 7vw, 96px)',
              fontWeight: 700,
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
              color: '#ff0000',
              pointerEvents: 'none',
              zIndex: -1,
            }}
          >
            {glitchedText}
          </span>
        )}

        {/* RGB clone B (blue offset) - only during interference */}
        {isInterference && (
          <span
            className="glitch-clone-b"
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              fontSize: 'clamp(28px, 7vw, 96px)',
              fontWeight: 700,
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
              color: '#00ffff',
              pointerEvents: 'none',
              zIndex: -2,
            }}
          >
            {glitchedText}
          </span>
        )}
      </div>

      <style jsx global>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }

        @keyframes jitter {
          0% { transform: translateX(0) translateY(0) skewX(0deg); }
          10% { transform: translateX(-8px) translateY(4px) skewX(-2deg); }
          20% { transform: translateX(12px) translateY(-6px) skewX(3deg); }
          30% { transform: translateX(-6px) translateY(8px) skewX(-1deg); }
          40% { transform: translateX(10px) translateY(-4px) skewX(2deg); }
          50% { transform: translateX(-12px) translateY(6px) skewX(-3deg); }
          60% { transform: translateX(8px) translateY(-8px) skewX(1deg); }
          70% { transform: translateX(-10px) translateY(4px) skewX(-2deg); }
          80% { transform: translateX(6px) translateY(-6px) skewX(2deg); }
          90% { transform: translateX(-8px) translateY(8px) skewX(-1deg); }
          100% { transform: translateX(0) translateY(0) skewX(0deg); }
        }

        @keyframes rgbShift {
          0% { text-shadow: 4px 0 0 rgba(255, 0, 0, 0.8), -4px 0 0 rgba(0, 255, 255, 0.8); }
          25% { text-shadow: -6px 0 0 rgba(255, 0, 0, 0.9), 6px 0 0 rgba(0, 255, 255, 0.9); }
          50% { text-shadow: 8px 0 0 rgba(255, 0, 0, 0.8), -8px 0 0 rgba(0, 255, 255, 0.8); }
          75% { text-shadow: -10px 0 0 rgba(255, 0, 0, 0.9), 10px 0 0 rgba(0, 255, 255, 0.9); }
          100% { text-shadow: 4px 0 0 rgba(255, 0, 0, 0.8), -4px 0 0 rgba(0, 255, 255, 0.8); }
        }

        @keyframes scanMove {
          0% { transform: translateY(0); }
          100% { transform: translateY(4px); }
        }

        @keyframes noiseFlicker {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.5; }
        }

        @keyframes tear {
          0% { background-position: 0 0, 0 0, 0 0; }
          25% { background-position: -20px 0, 20px 0, -10px 0; }
          50% { background-position: 20px 0, -20px 0, 10px 0; }
          75% { background-position: -15px 0, 15px 0, -5px 0; }
          100% { background-position: 0 0, 0 0, 0 0; }
        }

        .glitch-text-interference {
          animation: jitter 0.15s infinite, rgbShift 0.2s infinite;
        }

        .glitch-clone-a {
          animation: jitter 0.15s infinite;
          text-shadow: 6px 0 0 rgba(255, 0, 0, 0.9), -6px 0 0 rgba(0, 255, 255, 0.9);
          transform: translateX(-4px);
        }

        .glitch-clone-b {
          animation: jitter 0.15s infinite;
          text-shadow: -8px 0 0 rgba(0, 255, 255, 0.9), 8px 0 0 rgba(255, 0, 0, 0.9);
          transform: translateX(4px);
        }

        .scanline-overlay {
          animation: scanMove 0.1s linear infinite;
        }

        .noise-overlay {
          animation: noiseFlicker 0.1s infinite;
        }

        .tear-layer {
          background: repeating-linear-gradient(
            90deg,
            transparent 0%,
            transparent 8%,
            rgba(255, 0, 0, 0.1) 8%,
            rgba(255, 0, 0, 0.1) 9%,
            transparent 9%,
            transparent 18%,
            rgba(0, 255, 255, 0.1) 18%,
            rgba(0, 255, 255, 0.1) 19%,
            transparent 19%,
            transparent 28%,
            rgba(255, 0, 0, 0.08) 28%,
            rgba(255, 0, 0, 0.08) 29%,
            transparent 29%
          );
          background-size: 200% 100%;
          animation: tear 0.3s linear infinite;
        }

        @media (max-width: 360px) {
          .glitch-text-interference,
          .glitch-clone-a,
          .glitch-clone-b {
            font-size: clamp(24px, 6vw, 80px) !important;
          }
        }
      `}</style>
    </div>
  );
}
