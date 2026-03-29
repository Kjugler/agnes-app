// /app/lightening/page.tsx
// Spec 1: Lightning-first entry. Variant routing happens ONLY after video/continue.
// User lands → Lightning plays → Continue or video ends → THEN route to terminal/protocol/contest.

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import HelpButton from "@/components/HelpButton";
import { writeContestEmail, readContestEmail } from "@/lib/identity";
import CinematicVideo from "@/components/CinematicVideo";
import {
  resolveEntryFunnelClient,
  setSeenVariantCookie,
  setVariantCookieClient,
} from "@/lib/entryVariant";
import GlitchIntro from "@/components/terminal/GlitchIntro";

const STRESS_TEST_MODE = process.env.NEXT_PUBLIC_STRESS_TEST_MODE === '1';
const ENTRY_FUNNEL_DEBUG = process.env.NEXT_PUBLIC_ENTRY_FUNNEL_DEBUG === '1';

export default function LighteningClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showContinue, setShowContinue] = useState(false);
  const [showStressOverlay, setShowStressOverlay] = useState(false);
  const [overlayFadingOut, setOverlayFadingOut] = useState(false);
  const [overlayFadingIn, setOverlayFadingIn] = useState(true);
  const [showGlitchFrame, setShowGlitchFrame] = useState(false);
  /** Full-screen red THE AGNES PROTOCOL beat after Continue (all variants). */
  const [postLightningGlitch, setPostLightningGlitch] = useState(false);
  const pendingRouteRef = useRef<string | null>(null);
  
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
   * See resolveEntryFunnelClient() in @/lib/entryVariant for precedence.
   */
  const handleContinue = () => {
    if (ENTRY_FUNNEL_DEBUG && typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const cookieStr = document.cookie;
      const entryCookie =
        cookieStr.match(/(?:^|;\s*)entry_variant=([^;]+)/)?.[1]?.trim() ?? null;
      const discovery = /(?:^|;\s*)terminal_discovery_complete=1(?:;|$)/.test(cookieStr);
      const seenT = /(?:^|;\s*)seen_terminal=1(?:;|$)/.test(cookieStr);
      const seenP = /(?:^|;\s*)seen_protocol=1(?:;|$)/.test(cookieStr);
      const seenC = /(?:^|;\s*)seen_contest=1(?:;|$)/.test(cookieStr);
      console.log('[ENTRY_FUNNEL:client:pre]', {
        path: window.location.pathname,
        queryV: sp.get('v'),
        entry_variant_cookie: entryCookie,
        seen_terminal: seenT,
        seen_protocol: seenP,
        seen_contest: seenC,
        terminal_discovery_complete: discovery,
        coarsePointer: window.matchMedia?.('(pointer: coarse)').matches,
        innerWidth: window.innerWidth,
      });
    }

    const resolution = resolveEntryFunnelClient();
    const variant = resolution.variant;
    setVariantCookieClient(variant);
    setSeenVariantCookie(variant);

    if (ENTRY_FUNNEL_DEBUG && typeof window !== 'undefined') {
      console.log('[ENTRY_FUNNEL:client:post]', {
        chosenVariant: variant,
        phase: resolution.phase,
        decision: resolution.decision,
        entry_variant_sticky_7d: true,
        seen_cookie_updated: true,
      });
    }

    const params = new URLSearchParams(window.location.search);
    params.set('v', variant);

    let ref: string | null = params.get('ref');
    if (!ref && typeof document !== 'undefined') {
      const apRef = document.cookie.match(/ap_ref=([^;]+)/)?.[1]?.trim();
      const refCookie = document.cookie.match(/ref=([^;]+)/)?.[1]?.trim();
      ref = apRef || refCookie || null;
    }
    if (ref) params.set('ref', ref);

    const email = readContestEmail();
    if (email) params.set('email', email);

    params.set('fromLightning', '1');

    const qs = params.toString();
    const queryString = qs ? `?${qs}` : '';

    if (variant === 'terminal') {
      params.set('embed', '1');
      params.set('skipLoad', '1');
      const terminalUrl = `/terminal?${params.toString()}`;
      console.log('[Lightening] Routing to terminal (after bridge):', terminalUrl);
      pendingRouteRef.current = terminalUrl;
      setPostLightningGlitch(true);
      return;
    }
    if (variant === 'protocol') {
      // Protocol Challenge runs its own full-screen glitch synced to Helen-Agnes; skip lightning-page
      // overlay so users get one beat (not two + brief lightning flashback).
      const protocolUrl = `/the-protocol-challenge${queryString}`;
      console.log('[Lightening] Routing to protocol:', protocolUrl);
      router.push(protocolUrl);
      return;
    }
    const contestUrl = `/contest${queryString}`;
    console.log('[Lightening] Routing to contest (after bridge):', contestUrl);
    pendingRouteRef.current = contestUrl;
    setPostLightningGlitch(true);
  };

  const handlePostLightningGlitchComplete = () => {
    const href = pendingRouteRef.current;
    pendingRouteRef.current = null;
    setPostLightningGlitch(false);
    if (href) router.push(href);
  };

  const handleVideoEnded = () => {
    handleContinue();
  };

  // 2.1: Render immediately - never return null
  return (
    <>
      {postLightningGlitch && (
        <GlitchIntro
          skipIfSeen={false}
          zIndex={200000}
          onComplete={handlePostLightningGlitchComplete}
        />
      )}
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
          src="/videos/Lightning.mp4"
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
                padding: 'clamp(24px, 5vh, 32px) clamp(18px, 5vw, 40px)',
                textAlign: 'center',
                color: '#ffffff',
                fontFamily: 'Arial, Helvetica, sans-serif',
                lineHeight: 1.7,
              }}
            >
              <div style={{ fontSize: 'clamp(21px, 5.2vw, 26px)', fontWeight: 700, marginBottom: '18px', letterSpacing: '0.02em', lineHeight: 1.35 }}>
                PUBLIC STRESS TEST ACTIVE
              </div>
              <div style={{ fontSize: 'clamp(16px, 4.3vw, 18px)', marginBottom: '22px', opacity: 0.95, lineHeight: 1.65 }}>
                You are entering a live beta environment.
              </div>
              <div style={{ fontSize: 'clamp(15px, 4.1vw, 17px)', marginBottom: '14px', lineHeight: 1.65 }}>
                All purchases are simulated.<br />
                No real charges.<br />
                No real deliveries.
              </div>
              <div style={{ fontSize: 'clamp(15px, 4.1vw, 17px)', marginBottom: '26px', fontWeight: 600, lineHeight: 1.65 }}>
                Explore the system.<br />
                Invite friends.<br />
                Try to break it.
              </div>
              <div style={{ fontSize: 'clamp(14px, 3.8vw, 16px)', opacity: 0.9, lineHeight: 1.65 }}>
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
