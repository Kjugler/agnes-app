'use client';

import styles from './page.module.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function AscensionPage() {
  const router = useRouter();
  const qp = useSearchParams();
  const [reduced, setReduced] = useState(false);
  const [doorsVisible, setDoorsVisible] = useState(false);
  const [audioPlayed, setAudioPlayed] = useState(false);
  const [joinModal, setJoinModal] = useState<{ name: string; code: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  const [awardingPurchase, setAwardingPurchase] = useState(false);

  const name = useMemo(() => {
    if (typeof window === 'undefined') return 'Explorer';
    return localStorage.getItem('first_name') || 'Explorer';
  }, []);

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    
    // Show doors after 2 seconds with dramatic entrance
    const timer = setTimeout(() => {
      setDoorsVisible(true);
    }, 2000);
    
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const purchase = qp.get('purchase');
    const sessionId = qp.get('session_id');
    if (purchase !== 'success' || !sessionId) return;
    if (awardingPurchase) return;

    const storageKey = `purchase_session_${sessionId}`;
    let alreadyAwarded = false;
    try {
      alreadyAwarded = window.localStorage.getItem(storageKey) === '1';
    } catch {
      alreadyAwarded = false;
    }
    if (alreadyAwarded) {
      const url = new URL(window.location.href);
      url.searchParams.delete('purchase');
      url.searchParams.delete('session_id');
      router.replace(`${url.pathname}${url.search}${url.hash}`);
      return;
    }

    setAwardingPurchase(true);

    let associateCode: string | undefined;
    let email: string | undefined;
    try {
      associateCode =
        window.localStorage.getItem('ap_code') ||
        window.localStorage.getItem('ref') ||
        window.localStorage.getItem('discount_code') ||
        undefined;
      email =
        window.localStorage.getItem('user_email') ||
        window.localStorage.getItem('mockEmail') ||
        undefined;
    } catch {
      associateCode = undefined;
      email = undefined;
    }

    (async () => {
      try {
        await fetch('/api/points/award', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'book_purchase',
            sessionId,
            associateCode,
            email,
          }),
        });
      } catch (err) {
        console.warn('[ascension] book purchase award failed', err);
      } finally {
        try {
          window.localStorage.setItem(storageKey, '1');
        } catch {}
        const url = new URL(window.location.href);
        url.searchParams.delete('purchase');
        url.searchParams.delete('session_id');
        router.replace(`${url.pathname}${url.search}${url.hash}`);
        setAwardingPurchase(false);
      }
    })();
  }, [qp, awardingPurchase, router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (qp.get('joined') !== '1') return;

    try {
      const stored = window.localStorage.getItem('associate');
      if (stored) {
        const parsed = JSON.parse(stored) as { name?: string; code?: string };
        if (parsed?.code) {
          setJoinModal({
            name: parsed.name || 'Explorer',
            code: parsed.code,
          });
        }
      }
    } catch (err) {
      console.warn('ascension load associate failed', err);
    }
  }, [qp]);

  const closeJoinModal = () => {
    setJoinModal(null);
    setCopied(false);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('joined');
      router.replace(`${url.pathname}${url.search}${url.hash}`);
    }
  };

  const copyCode = async () => {
    if (!joinModal) return;
    try {
      await navigator.clipboard.writeText(joinModal.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.warn('copy failed', err);
    }
  };

  const downloadCard = () => {
    if (typeof window === 'undefined' || !joinModal) return;
    const canvas = document.createElement('canvas');
    const width = 1200;
    const height = 630;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#312e81');
    gradient.addColorStop(1, '#0ea5e9');
    ctx.fillStyle = gradient;
    ctx.fillRect(40, 40, width - 80, height - 80);

    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(60, 200, width - 120, 300);

    ctx.font = 'bold 72px "Segoe UI", sans-serif';
    ctx.fillStyle = '#e0f2fe';
    ctx.fillText('Associate Access', 80, 160);

    ctx.font = '48px "Segoe UI", sans-serif';
    ctx.fillStyle = '#f8fafc';
    const nameText = joinModal.name.toUpperCase();
    ctx.fillText(nameText, 110, 320);

    ctx.font = '40px "Segoe UI", sans-serif';
    ctx.fillStyle = '#facc15';
    ctx.fillText(`CODE: ${joinModal.code}`, 110, 400);

    ctx.font = '28px "Segoe UI", sans-serif';
    ctx.fillStyle = '#bfdbfe';
    ctx.fillText('agnesprotocol.com/contest', 110, 470);

    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = `agnes-code-${joinModal.code}.png`;
    link.click();
  };

  // Play audio function
  const playAudio = async () => {
    if (reduced || audioPlayed) return;
    
    try {
      if (audioRef.current) {
        audioRef.current.volume = 0.5;
        await audioRef.current.play();
        console.log('✅ Audio started');
        setAudioPlayed(true);
      }
    } catch (error) {
      console.log('⚠️ Audio blocked:', error);
    }
  };

  // Try to play on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      playAudio();
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // Listen for ANY interaction as fallback
  useEffect(() => {
    if (audioPlayed || reduced) return;
    
    const handleInteraction = () => {
      playAudio();
    };

    const events = ['click', 'touchstart', 'mousemove', 'keydown'];
    events.forEach(event => {
      window.addEventListener(event, handleInteraction, { once: true });
    });

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleInteraction);
      });
    };
  }, [audioPlayed, reduced]);

  const handleSelect = (dest: 'score' | 'badges') => {
    try { localStorage.setItem('hasAscended', 'true'); } catch {}
    // Optional query override wins
    const qpDest = qp.get('dest') as 'score' | 'badges' | null;
    const finalDest = qpDest ?? dest;

    // Flash + route
    if (flashRef.current) {
      flashRef.current.classList.remove(styles.active);
      // force reflow
      // @ts-ignore
      void flashRef.current.offsetWidth;
      flashRef.current.classList.add(styles.active);
    }
    setTimeout(() => router.push(`/contest/${finalDest}`), 300);
  };

  return (
    <div className={styles.root}>
      {/* gradient clouds behind everything */}
      <div className={styles.cloudGrain} />

      {/* photographic cloud layer */}
      <img
        className={styles.cloudImage}
        src="/images/ascension/clouds.png"
        alt=""
        aria-hidden="true"
      />

      {/* silhouettes layer (women left, men right) - NOW MUCH MORE VISIBLE */}
      <img
        className={styles.silhouettesImg}
        src="/images/ascension/silhouettes.png"
        alt=""
        aria-hidden="true"
      />

      {/* NAME */}
      <h1 className={styles.name}>
        Welcome, {name}
      </h1>

      {/* Subtle audio prompt */}
      {!audioPlayed && (
        <div className={styles.audioPrompt}>
          Tap anywhere to begin...
        </div>
      )}

      {/* DOORS */}
      <div className={styles.doors}>
        {/* Door 1 */}
        <div className={styles.doorWrap}>
          <div className={styles.door} role="img" aria-label="Door to See My Score">
            <div className={styles.doorPanels} />
            {/* optional overlay image to lock the texture/look */}
            <img className={styles.doorImg} src="/images/ascension/door-red.png" alt="" />
            <span className={styles.knob} aria-hidden="true" />
            <div className={styles.doorLabel}>
              See My<br />Score
            </div>
            <a
              className={styles.doorLink}
              href="/contest/score"
              aria-label="See My Score"
              onClick={(e) => {
                e.preventDefault();
                try { localStorage.setItem('hasAscended','true'); } catch {}
                e.currentTarget.blur();
                handleSelect('score');
              }}
            />
          </div>
        </div>

        {/* Door 2 */}
        <div className={styles.doorWrap}>
          <div className={styles.door} role="img" aria-label="Door to Explore Badges">
            <div className={styles.doorPanels} />
            <img className={styles.doorImg} src="/images/ascension/door-red.png" alt="" />
            <span className={styles.knob} aria-hidden="true" />
            <div className={styles.doorLabel}>
              Explore<br />Badges
            </div>
            <a
              className={styles.doorLink}
              href="/contest/badges"
              aria-label="Explore Badges"
              onClick={(e) => {
                e.preventDefault();
                try { localStorage.setItem('hasAscended','true'); } catch {}
                e.currentTarget.blur();
                handleSelect('badges');
              }}
            />
          </div>
        </div>
      </div>

      {/* existing flash overlay + audio element remain as-is */}
      <div ref={flashRef} className={styles.flash} />
      <audio 
        ref={audioRef} 
        src="/sfx/ascend.mp3" 
        preload="auto"
        loop
        onError={(e) => console.log('Audio load error:', e)}
        onLoadStart={() => console.log('🎵 Audio loading...')}
        onLoadedData={() => console.log('🎵 Audio loaded')}
        onPlay={() => console.log('🎵 Audio playing!')}
      />
      {joinModal && (
        <div className={styles.joinOverlay}>
          <div className={styles.joinCard}>
            <h2>Welcome aboard!</h2>
            <p>
              Your code: <strong>{joinModal.code}</strong>
            </p>
            <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>
              Share for 15% off • Earn $2 for every purchase
            </p>
            <div className={styles.joinActions}>
              <button type="button" onClick={copyCode}>
                {copied ? 'Copied!' : 'Copy Code'}
              </button>
              <button type="button" onClick={downloadCard}>
                Download Card
              </button>
            </div>
            <button type="button" className={styles.joinClose} onClick={closeJoinModal}>
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}