'use client';

import styles from './page.module.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { readAssociate, readContestEmail } from '@/lib/identity';
import { JodyAssistant } from '@/components/JodyAssistant';

export default function AscensionPage() {
  const router = useRouter();
  const qp = useSearchParams();
  const [reduced, setReduced] = useState(false);
  const [doorsVisible, setDoorsVisible] = useState(false);
  const [audioPlayed, setAudioPlayed] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [associate, setAssociate] = useState<{ name: string; email: string } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Load associate info on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = readAssociate();
    const email = readContestEmail();
    if (stored) {
      setAssociate({ name: stored.name, email: stored.email });
    } else if (email) {
      setAssociate({ name: email.split('@')[0], email });
    }
  }, []);

  const name = useMemo(() => {
    if (typeof window === 'undefined') return 'Explorer';
    
    // Priority 1: First name from associate cache (contest entry form)
    if (associate?.name) {
      const parts = associate.name.trim().split(' ');
      if (parts.length > 0 && parts[0]) {
        return parts[0];
      }
    }
    
    // Priority 2: Email address (extract name part before @)
    if (associate?.email) {
      const emailName = associate.email.split('@')[0];
      if (emailName) {
        // Capitalize first letter
        return emailName.charAt(0).toUpperCase() + emailName.slice(1);
      }
    }
    
    // Fallback
    return 'Explorer';
  }, [associate]);

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    
    // Show doors immediately (or after very short delay)
    const timer = setTimeout(() => {
      setDoorsVisible(true);
    }, 100);
    
    // Track page visibility for animation pause (but keep elements visible)
    const handleVisibilityChange = () => {
      const isVisible = !document.hidden;
      setIsPageVisible(isVisible);
      
      // Pause/resume animations via CSS when page is hidden/visible
      if (rootRef.current) {
        if (isVisible) {
          rootRef.current.style.setProperty('--animation-play-state', 'running');
        } else {
          rootRef.current.style.setProperty('--animation-play-state', 'paused');
        }
      }
    };
    
    // Set initial state
    setIsPageVisible(!document.hidden);
    if (rootRef.current) {
      rootRef.current.style.setProperty('--animation-play-state', 'running');
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Setup audio to loop continuously (runs once, doesn't remount)
  useEffect(() => {
    if (reduced) return;
    
    const audio = audioRef.current;
    if (!audio) return;
    
    // Set audio properties once
    audio.volume = 0.5;
    audio.loop = true;
    
    // Try to play on mount
    const tryPlay = async () => {
      try {
        await audio.play();
        console.log('🎵 Audio started and looping');
        setAudioPlayed(true);
      } catch (error) {
        console.log('🔇 Audio blocked, waiting for interaction:', error);
      }
    };
    
    // Try immediately if already loaded, otherwise wait for load
    if (audio.readyState >= 2) {
      tryPlay();
    } else {
      audio.addEventListener('loadeddata', tryPlay, { once: true });
    }
    
    // Fallback: listen for ANY interaction to start playback
    const handleInteraction = async () => {
      if (!audioPlayed) {
        try {
          await audio.play();
          setAudioPlayed(true);
        } catch (err) {
          // Ignore - will retry on next interaction
        }
      }
    };

    const events = ['click', 'touchstart', 'mousemove', 'keydown'];
    events.forEach(event => {
      window.addEventListener(event, handleInteraction, { once: true });
    });

    return () => {
      audio.removeEventListener('loadeddata', tryPlay);
      events.forEach(event => {
        window.removeEventListener(event, handleInteraction);
      });
    };
  }, [reduced]); // Only depend on reduced, not audioPlayed

  const handleSelect = (dest: 'score' | 'signal') => {
    try { localStorage.setItem('hasAscended', 'true'); } catch {}
    
    // Flash + route
    if (flashRef.current) {
      flashRef.current.classList.remove(styles.active);
      // force reflow
      // @ts-ignore
      void flashRef.current.offsetWidth;
      flashRef.current.classList.add(styles.active);
    }
    
    const route = dest === 'score' ? '/contest/score' : '/signal-room';
    setTimeout(() => router.push(route), 300);
  };

  return (
    <div ref={rootRef} className={styles.root}>
      {/* Single composite background image (clouds + silhouettes together) */}
      <img
        className={styles.backgroundImage}
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

      {/* DOORS - Always rendered, fade in smoothly */}
      <div className={styles.doors} style={{ opacity: doorsVisible ? 1 : 0.01, transition: 'opacity 1s ease-in' }}>
        {/* Door 1 */}
        <div className={styles.doorWrap}>
          <div className={styles.door} role="img" aria-label="Door to See My Score">
            <div className={styles.doorPanels} />
            {/* Door image overlay removed to prevent red bleedover */}
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
          <div className={styles.door} role="img" aria-label="Door to Signal Room">
            <div className={styles.doorPanels} />
            {/* Door image overlay removed to prevent red bleedover */}
            <span className={styles.knob} aria-hidden="true" />
            <div className={styles.doorLabel}>
              Send<br />Signal
            </div>
            <a
              className={styles.doorLink}
              href="/signal-room"
              aria-label="Go to Signal Room"
              onClick={(e) => {
                e.preventDefault();
                try { localStorage.setItem('hasAscended','true'); } catch {}
                e.currentTarget.blur();
                handleSelect('signal');
              }}
            />
          </div>
        </div>
      </div>

      {/* Flash overlay */}
      <div ref={flashRef} className={styles.flash} />

      {/* Jody Assistant */}
      <JodyAssistant
        variant="ascension"
        autoShowDelayMs={4000}
        disableBubble={true}
      />

      {/* Jody's voice audio - loops continuously */}
      <audio
        ref={audioRef}
        src="/audio/jody-ascend-init.mp3"
        preload="auto"
        loop
        onLoadedData={() => {
          // Auto-play when loaded (if allowed)
          if (audioRef.current && !audioPlayed && !reduced) {
            audioRef.current.play().catch(() => {
              // Autoplay blocked, will play on interaction
            });
          }
        }}
      />
    </div>
  );
}
