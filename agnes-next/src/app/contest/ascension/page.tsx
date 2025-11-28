'use client';

import styles from './page.module.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { clearAssociateCaches, readAssociate, readContestEmail, type AssociateCache } from '@/lib/identity';
import { JodyAssistant } from '@/components/JodyAssistant';

export default function AscensionPage() {
  const router = useRouter();
  const qp = useSearchParams();
  const [reduced, setReduced] = useState(false);
  const [doorsVisible, setDoorsVisible] = useState(false);
  const [audioPlayed, setAudioPlayed] = useState(false);
  const [contestEmail, setContestEmail] = useState<string | null>(null);
  const [associate, setAssociate] = useState<AssociateCache | null>(null);
  const [joinModal, setJoinModal] = useState<{ name: string; code: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  const [awardingPurchase, setAwardingPurchase] = useState(false);

  const name = useMemo(() => {
    if (associate?.name) {
      const parts = associate.name.trim().split(' ');
      if (parts.length) return parts[0];
      return associate.name;
    }
    if (typeof window === 'undefined') return 'Explorer';
    return localStorage.getItem('first_name') || 'Explorer';
  }, [associate?.name]);

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
    const syncIdentity = () => {
      const email = readContestEmail();
      const stored = readAssociate();
      if (stored && email && stored.email !== email) {
        clearAssociateCaches({ keepContestEmail: true });
        setAssociate(null);
        setContestEmail(email);
        return;
      }
      if (stored && !email) {
        clearAssociateCaches();
        setAssociate(null);
        setContestEmail(null);
        return;
      }
      setAssociate(stored);
      setContestEmail(email);
    };
    syncIdentity();
    window.addEventListener('storage', syncIdentity);
    return () => window.removeEventListener('storage', syncIdentity);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (qp.get('purchase') !== 'success') return;
    if (!contestEmail) return;
    if (awardingPurchase) return;

    const storageKey = `purchase_bonus_${contestEmail}`;
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

    const email = contestEmail;

    (async () => {
      try {
        await fetch('/api/points/award', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Email': email,
          },
          body: JSON.stringify({
            kind: 'book_purchase',
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
        router.replace(`${url.pathname}${url.search}${url.hash}`);
        setAwardingPurchase(false);
      }
    })();
  }, [qp, awardingPurchase, router, contestEmail]);
 
  useEffect(() => {
    if (qp.get('joined') !== '1') return;
    if (associate?.code) {
      setJoinModal({
        name: associate.name || 'Explorer',
        code: associate.code,
      });
    }
  }, [qp, associate]);

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

  // Play Jody's voice on mount (for ascension page)
  useEffect(() => {
    // Small cinematic delay so the page can settle
    const timer = setTimeout(() => {
      audioRef.current?.play().catch((err) => {
        console.warn('Ascension audio playback failed (maybe autoplay blocked):', err);
      });
    }, 600);

    return () => clearTimeout(timer);
  }, []);


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

  const handleChangeAccount = useCallback(() => {
    clearAssociateCaches();
    router.replace('/contest');
  }, [router]);

  return (
    <div className={styles.root}>
      <button
        type="button"
        onClick={handleChangeAccount}
        style={{
          position: 'absolute',
          top: 18,
          right: 18,
          padding: '6px 14px',
          borderRadius: 999,
          border: '1px solid rgba(148, 163, 184, 0.6)',
          background: 'rgba(15, 23, 42, 0.55)',
          color: '#e2e8f0',
          fontWeight: 600,
          letterSpacing: '0.04em',
          cursor: 'pointer',
          zIndex: 110,
        }}
      >
        Change account{contestEmail ? ` (${contestEmail})` : ''}
      </button>
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
            <button
              type="button"
              className={styles.doorLink}
              aria-label="See My Score"
              onClick={(e) => {
                e.preventDefault();
                try { localStorage.setItem('hasAscended','true'); } catch {}
                (e.currentTarget as HTMLButtonElement).blur();
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
            <button
              type="button"
              className={styles.doorLink}
              aria-label="Explore Badges"
              onClick={(e) => {
                e.preventDefault();
                try { localStorage.setItem('hasAscended','true'); } catch {}
                (e.currentTarget as HTMLButtonElement).blur();
                handleSelect('badges');
              }}
            />
          </div>
        </div>
      </div>

      {/* Flash overlay */}
      <div ref={flashRef} className={styles.flash} />
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

      {/* Jody Assistant */}
      <JodyAssistant
        variant="ascension"
        autoShowDelayMs={4000} // still fine to pass; will be ignored when disableBubble is true
        disableBubble={true}
      />

      {/* Jody's voice audio */}
      <audio
        ref={audioRef}
        src="/audio/jody-ascend-init.mp3"
        preload="auto"
      />
    </div>
  );
}