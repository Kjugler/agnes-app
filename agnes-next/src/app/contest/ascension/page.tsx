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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);

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
    </div>
  );
}