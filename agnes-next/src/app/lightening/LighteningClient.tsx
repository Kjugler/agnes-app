// /app/lightening/page.tsx
// Spec 1: Lightning-first entry. Variant routing happens ONLY after video/continue.
// User lands → Lightning plays → Continue or video ends → THEN route to protocol/contest (terminal branch → contest pass-through).

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import HelpButton from "@/components/HelpButton";
import { writeContestEmail, readContestEmail } from "@/lib/identity";
import CinematicVideo from "@/components/CinematicVideo";
import {
  incrementLightningContinueCount,
  resolveEntryFunnelClient,
  setSeenVariantCookie,
  setVariantCookieClient,
} from "@/lib/entryVariant";
import GlitchIntro from "@/components/terminal/GlitchIntro";

const ENTRY_FUNNEL_DEBUG = process.env.NEXT_PUBLIC_ENTRY_FUNNEL_DEBUG === '1';

export default function LighteningClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showContinue, setShowContinue] = useState(false);
  /** Full-screen red THE AGNES PROTOCOL beat after Continue (all variants). */
  const [postLightningGlitch, setPostLightningGlitch] = useState(false);
  const pendingRouteRef = useRef<string | null>(null);
  
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // Text-a-friend: remember selected on-site video hint (SMS sends site link only)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const source = searchParams.get('source');
    const video = searchParams.get('video');
    if (source === 'textafriend' && video && /^fb[123]$/.test(video)) {
      try {
        sessionStorage.setItem('textafriend_video', video);
      } catch {
        /* ignore */
      }
    }
    if (searchParams.get('discount') === '15') {
      try {
        sessionStorage.setItem('textafriend_discount', '15');
      } catch {
        /* ignore */
      }
    }
  }, [searchParams]);

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

    incrementLightningContinueCount();
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
      params.delete('embed');
      params.delete('skipLoad');
      params.set('v', 'terminal');
      params.set('terminalPass', '1');
      const contestTerminalUrl = `/contest?${params.toString()}`;
      console.log('[Lightening] Routing to contest terminal pass (after bridge):', contestTerminalUrl);
      pendingRouteRef.current = contestTerminalUrl;
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

        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 100,
            zIndex: 2,
            textAlign: 'center',
            pointerEvents: 'none',
            padding: '0 1.25rem',
          }}
        >
          <p
            style={{
              margin: '0 0 10px 0',
              fontSize: 'clamp(15px, 3.8vw, 18px)',
              fontWeight: 500,
              color: 'rgba(245, 245, 245, 0.88)',
              letterSpacing: '0.04em',
              textShadow: '0 2px 12px rgba(0,0,0,0.85)',
            }}
          >
            A story. A game. Something more.
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 'clamp(13px, 3.2vw, 15px)',
              color: 'rgba(203, 213, 225, 0.75)',
              letterSpacing: '0.06em',
              textShadow: '0 2px 10px rgba(0,0,0,0.8)',
            }}
          >
            Tap anywhere to begin
          </p>
        </div>

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
      <HelpButton />
    </>
  );
}
