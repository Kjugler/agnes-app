// /app/lightening/page.tsx
// Gesture handoff audio: Check sessionStorage flag and attempt audio on ready

"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import HelpButton from "@/components/HelpButton";
import { writeContestEmail } from "@/lib/identity";
import CinematicVideo from "@/components/CinematicVideo";

const VIDEO_DURATION_SECONDS = 9; // Approximate duration for failsafe timer

export default function LighteningClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showContinue, setShowContinue] = useState(false);
  
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

  // Show Continue button after a short delay (allows users to skip)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Show continue button after 2 seconds so users can skip if needed
    const timer = setTimeout(() => {
      console.log('[Lightening] Showing Continue button');
      setShowContinue(true);
    }, 2000);
    
    return () => {
      clearTimeout(timer);
    };
  }, []);

  const handleContinue = () => {
    const queryString = window.location.search;
    const contestUrl = `/contest${queryString}`;
    console.log('[Lightening] Continue clicked - redirecting to:', contestUrl);
    router.push(contestUrl);
  };

  const handleVideoEnded = () => {
    console.log('[Lightening] Video ended - auto-forwarding to contest');
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
