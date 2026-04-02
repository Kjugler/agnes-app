'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { clearIdentityStorage } from '@/lib/identity';
import { readContestEmail } from '@/lib/identity';
import CinematicVideo from '@/components/CinematicVideo';
import GlitchIntro from '@/components/GlitchIntro';
import { buildRibbonTickerText } from '@/lib/signalRibbonFeed';
import styles from './protocol-challenge.module.css';

export default function ProtocolChallengeClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [entryVariant, setEntryVariant] = useState<string | null>(null);
  const [entryVariantSource, setEntryVariantSource] = useState<string>('unknown');
  const [isButtonHovered, setIsButtonHovered] = useState(false);
  const [showIntro, setShowIntro] = useState(true); // ✅ Protocol Challenge: intro ALWAYS plays
  const [ribbonTickerText, setRibbonTickerText] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/signal/events')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.events) && d.events.length > 0) {
          setRibbonTickerText(buildRibbonTickerText(d.events));
        }
      })
      .catch(() => {});
  }, []);

  // E4: Get variant for dev display
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Check cookie
    const cookieMatch = document.cookie.match(/entry_variant=([^;]+)/);
    if (cookieMatch) {
      setEntryVariant(cookieMatch[1]);
      return;
    }
    
    // Check localStorage
    const stored = localStorage.getItem('entry_variant');
    if (stored) {
      setEntryVariant(stored);
      } else {
        // Check URL override
        const params = new URLSearchParams(window.location.search);
        const entryOverride = params.get('entry') || params.get('v');
        if (entryOverride === 'terminal' || entryOverride === 'protocol') {
          setEntryVariant(entryOverride);
        }
        // No default - only set if explicitly provided (this page is protocol challenge, so variant is informational)
      }
  }, []);

  // Handle fresh=1 param: clear identity storage before rendering
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const params = new URLSearchParams(window.location.search);
    if (params.get('fresh') === '1') {
      console.log('[protocol-challenge] fresh=1 detected, clearing identity storage');
      clearIdentityStorage();
      
      // Remove fresh=1 from URL so refresh doesn't keep nuking state
      params.delete('fresh');
      const newQs = params.toString();
      const newUrl = `${window.location.pathname}${newQs ? `?${newQs}` : ''}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

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



  // Dev badge: show entry variant and URL params
  useEffect(() => {
    if (typeof window === 'undefined' || process.env.NODE_ENV !== 'development') return;
    
    // Read entry variant from cookie or localStorage
    const cookieVariant = document.cookie
      .split(';')
      .find(c => c.trim().startsWith('entry_variant='))
      ?.split('=')[1];
    
    const storedVariant = localStorage.getItem('entry_variant') || cookieVariant;
    // Don't default to protocol - only set if variant exists (for display purposes)
    if (storedVariant) {
      setEntryVariant(storedVariant);
    }
    
    // Also store in localStorage for consistency
    if (storedVariant) {
      localStorage.setItem('entry_variant', storedVariant);
    }

    // Compute source for display (safe to access window here since we're in useEffect)
    const params = new URLSearchParams(window.location.search);
    if (params.get('entry') || params.get('v')) {
      setEntryVariantSource('override');
    } else {
      const cookieMatch = document.cookie.match(/entry_variant=([^;]+)/);
      if (cookieMatch) {
        setEntryVariantSource('cookie');
      } else if (localStorage.getItem('entry_variant')) {
        setEntryVariantSource('localStorage');
      } else {
        setEntryVariantSource('default');
      }
    }
  }, []);

  // Extract URL params for dev badge
  const urlParams = {
    code: searchParams.get('code'),
    v: searchParams.get('v'),
    src: searchParams.get('src'),
    toEmail: searchParams.get('toEmail') || searchParams.get('to_email'),
    ref: searchParams.get('ref'),
  };

  return (
    <>
      {/* ✅ Protocol Challenge: Intro ALWAYS plays (no skipIfSeen) */}
      {showIntro && (
        <GlitchIntro
          onComplete={() => {
            console.log('[ProtocolChallenge] Glitch intro complete');
            setShowIntro(false);
          }}
          skipIfSeen={false} // Always play for Protocol Challenge
        />
      )}
      
      <div className={styles.page} style={{ opacity: showIntro ? 0 : 1, transition: 'opacity 300ms ease-in' }}>
      {/* Dev-only badge: show entry variant and URL params */}
      {process.env.NODE_ENV === 'development' && (
        <div
          style={{
            position: 'fixed',
            top: '10px',
            right: '10px',
            backgroundColor: '#fef3c7',
            border: '1px solid #fbbf24',
            borderRadius: '0.375rem',
            padding: '0.5rem 0.75rem',
            fontSize: '0.75rem',
            color: '#92400e',
            zIndex: 10000,
            maxWidth: '300px',
            textAlign: 'left',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>🔧 Dev Info</div>
          <div>
            entry_variant: <strong>{entryVariant || 'none'}</strong>{' '}
            <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>
              (source: {entryVariantSource})
            </span>
          </div>
          {urlParams.code && <div>code: <code>{urlParams.code}</code></div>}
          {urlParams.v && <div>v: <code>{urlParams.v}</code></div>}
          {urlParams.src && <div>src: <code>{urlParams.src}</code></div>}
          {urlParams.toEmail && <div>toEmail: <code>{urlParams.toEmail}</code></div>}
          {urlParams.ref && <div>ref: <code>{urlParams.ref}</code></div>}
        </div>
      )}

      <div className={styles.topBlock}>
        {process.env.NEXT_PUBLIC_STRESS_TEST_MODE === '1' && (
          <div style={{
            marginBottom: '16px',
            padding: '10px 14px',
            background: 'rgba(0, 255, 127, 0.1)',
            border: '1px solid rgba(0, 255, 127, 0.3)',
            borderRadius: '8px',
            fontSize: '13px',
            color: 'rgba(245, 245, 245, 0.9)',
          }}>
            <strong style={{ color: '#00ff7f' }}>PUBLIC STRESS TEST ACTIVE</strong> — Simulation. No real charges. No real deliveries. <a href="mailto:hello@theagnesprotocol.com" style={{ color: '#00ff7f', textDecoration: 'underline' }}>Found a bug?</a>
          </div>
        )}
        <div className={styles.ad}>
          <h1 style={{ fontSize: '1.8em', margin: 0 }}>
            Win a 7 Day, 6 Night Family Cruise
          </h1>
        </div>

        <button
          onClick={() => {
            // C: Change link from /contest to /contest/access?from=protocol-challenge
            const params = new URLSearchParams(window.location.search);
            params.set('from', 'protocol-challenge');
            
            // Preserve all tracking params
            const qs = params.toString();
            const destination = `/contest/access${qs ? `?${qs}` : ''}`;
            
            if (process.env.NODE_ENV === 'development') {
              console.log('[protocol-challenge] Enter Contest clicked - routing to access gate', {
                destination,
              });
            }
            
            router.push(destination);
          }}
          className={styles.cta}
          onMouseEnter={() => setIsButtonHovered(true)}
          onMouseLeave={() => setIsButtonHovered(false)}
        >
          Get on Board Now!
        </button>
      </div>

      <div className={styles.videoWrap}>
        <CinematicVideo
          src="/videos/Helen-Agnes.mp4"
          autoUnmute={true}
          mode="inline"
        />
      </div>

      <div className={styles.banner}>
        <span className={styles.tickerText}>
          {ribbonTickerText ??
            'Agnes Protocol tops banned book list — again. ⚡ Tiana M. just earned 3,450 points. ⚡ Nate R. entered the contest from Tucson. ⚡'}
        </span>
      </div>
      </div>
    </>
  );
}
