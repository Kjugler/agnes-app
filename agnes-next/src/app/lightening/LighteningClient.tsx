// /app/lightening/page.tsx
// Spec 1: Lightning-first entry. Variant routing happens ONLY after video/continue.
// User lands → Lightning plays → Continue or video ends → THEN route to terminal/protocol/contest.

"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import HelpButton from "@/components/HelpButton";
import { writeContestEmail, readContestEmail } from "@/lib/identity";
import CinematicVideo from "@/components/CinematicVideo";
import { resolveVariantClient, setVariantCookieClient } from "@/lib/entryVariant";

const STRESS_TEST_MODE = process.env.NEXT_PUBLIC_STRESS_TEST_MODE === '1';

export default function LighteningClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showContinue, setShowContinue] = useState(false);
  const [showStressOverlay, setShowStressOverlay] = useState(false);
  const [overlayFadingOut, setOverlayFadingOut] = useState(false);
  const [overlayFadingIn, setOverlayFadingIn] = useState(true);
  const [showGlitchFrame, setShowGlitchFrame] = useState(false);
  
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // Read and store email from query string
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const emailFromQuery = searchParams.get('email');
    
    if (emailFromQuery) {
      const normalizedEmail = emailFromQuery.trim().toLowerCase();
      writeContestEmail(normalizedEmail);
      
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
          }
        })
        .catch(() => {});
    }
  }, [searchParams, baseUrl]);

  // Show Continue button after a short delay (allows users to skip)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const timer = setTimeout(() => setShowContinue(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  // SPEC: Lightning page stress test overlay — appears after ~2s, visible 12s, then fades out
  // ARG: After overlay fades, quick glitch frame (0.4s) then normal flow
  useEffect(() => {
    if (!STRESS_TEST_MODE || typeof window === 'undefined') return;
    const showDelay = 2000;
    const visibleDuration = 12000;
    const fadeDuration = 600;
    const glitchDuration = 400;
    const overlayEnd = showDelay + visibleDuration + fadeDuration;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => {
      setShowStressOverlay(true);
      setOverlayFadingIn(true);
      timers.push(setTimeout(() => setOverlayFadingIn(false), 50));
    }, showDelay));
    timers.push(setTimeout(() => setOverlayFadingOut(true), showDelay + visibleDuration));
    timers.push(setTimeout(() => {
      setShowStressOverlay(false);
      setShowGlitchFrame(true);
    }, overlayEnd));
    timers.push(setTimeout(() => setShowGlitchFrame(false), overlayEnd + glitchDuration));
    return () => timers.forEach(clearTimeout);
  }, []);

  /**
   * Variant routing: ONLY called after video ends or Continue click.
   * Precedence: ?v= > cookie > weighted random.
   */
  const handleContinue = () => {
    const variant = resolveVariantClient();
    setVariantCookieClient(variant);

    const params = new URLSearchParams(window.location.search);
    params.set('v', variant);

    let ref = params.get('ref');
    if (!ref && typeof document !== 'undefined') {
      const apRef = document.cookie.match(/ap_ref=([^;]+)/)?.[1]?.trim();
      const refCookie = document.cookie.match(/ref=([^;]+)/)?.[1]?.trim();
      ref = apRef || refCookie || undefined;
    }
    if (ref) params.set('ref', ref);

    const email = readContestEmail();
    if (email) params.set('email', email);

    const qs = params.toString();
    const queryString = qs ? `?${qs}` : '';

    if (variant === 'terminal') {
      params.set('embed', '1');
      params.set('skipLoad', '1');
      const terminalUrl = `/terminal-proxy?${params.toString()}`;
      console.log('[Lightening] Routing to terminal:', terminalUrl);
      router.push(terminalUrl);
    } else if (variant === 'protocol') {
      const protocolUrl = `/the-protocol-challenge${queryString}`;
      console.log('[Lightening] Routing to protocol:', protocolUrl);
      router.push(protocolUrl);
    } else {
      const contestUrl = `/contest${queryString}`;
      console.log('[Lightening] Routing to contest:', contestUrl);
      router.push(contestUrl);
    }
  };

  const handleVideoEnded = () => {
    handleContinue();
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
        {/* Lightning video - native MP4 with auto-unmute and no loop */}
        <CinematicVideo
          src="/videos/lightning.mp4"
          autoUnmute={true}
          loop={false}
          onEnded={handleVideoEnded}
          mode="fullscreen"
        />
        
        {/* SPEC: Stress test overlay — Lightning page only, does not interrupt animation */}
        {STRESS_TEST_MODE && showStressOverlay && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              pointerEvents: 'none',
              opacity: overlayFadingOut ? 0 : overlayFadingIn ? 0 : 1,
              transition: 'opacity 0.6s ease-out',
            }}
          >
            <div
              style={{
                maxWidth: '90%',
                padding: '32px 40px',
                textAlign: 'center',
                color: '#ffffff',
                fontFamily: 'Arial, Helvetica, sans-serif',
                lineHeight: 1.6,
              }}
            >
              <div style={{ fontSize: '22px', fontWeight: 700, marginBottom: '16px', letterSpacing: '0.02em' }}>
                PUBLIC STRESS TEST ACTIVE
              </div>
              <div style={{ fontSize: '16px', marginBottom: '20px', opacity: 0.95 }}>
                You are entering a live beta environment.
              </div>
              <div style={{ fontSize: '15px', marginBottom: '12px' }}>
                All purchases are simulated.<br />
                No real charges.<br />
                No real deliveries.
              </div>
              <div style={{ fontSize: '15px', marginBottom: '24px', fontWeight: 600 }}>
                Explore the system.<br />
                Invite friends.<br />
                Try to break it.
              </div>
              <div style={{ fontSize: '14px', opacity: 0.9 }}>
                Found a bug?<br />
                <a href="mailto:hello@theagnesprotocol.com" style={{ color: '#00ff7f', textDecoration: 'underline' }}>
                  hello@theagnesprotocol.com
                </a>
              </div>
            </div>
          </div>
        )}

        {/* ARG: Quick glitch frame after overlay fades — system message feel */}
        {STRESS_TEST_MODE && showGlitchFrame && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#000',
              color: '#00ff7f',
              fontFamily: 'monospace',
              fontSize: '14px',
              letterSpacing: '0.15em',
              textAlign: 'center',
              animation: 'lightningGlitchFlicker 0.4s steps(2)',
            }}
          >
            <div>
              <div style={{ marginBottom: '12px', opacity: 0.9 }}>SYSTEM LOG: BETA OBSERVATION ACTIVE</div>
              <div style={{ fontSize: '12px', opacity: 0.8 }}>USER PARTICIPATION RECORDED</div>
            </div>
          </div>
        )}

        {/* Continue button - shown after timer */}
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
      <style jsx global>{`
        @keyframes lightningGlitchFlicker {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
      <HelpButton />
    </>
  );
}
