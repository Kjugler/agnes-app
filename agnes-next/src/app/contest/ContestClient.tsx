'use client';

import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import CheckoutWiring from './CheckoutWiring';
import CurrentScoreButton from './CurrentScoreButton';
import { BuyBookButton } from '@/components/BuyBookButton';
import { ContestEntryForm } from '@/components/ContestEntryForm';
import { startCheckout } from '@/lib/checkout';
import HelpButton from '@/components/HelpButton';
import {
  clearAssociateCaches,
  readAssociate,
  readContestEmail,
  writeAssociate,
  writeContestEmail,
  type AssociateCache,
} from '@/lib/identity';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export default function ContestClient() {
  const qp = useSearchParams();
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const [tapsyText, setTapsyText] = useState('Tap here to read a sample chapter!');
  const [showScoreButton, setShowScoreButton] = useState(false);
  const [contestEmail, setContestEmail] = useState<string | null>(null);
  const [associate, setAssociate] = useState<AssociateCache | null>(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [profileFirstName, setProfileFirstName] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [showEntryFormForCheckout, setShowEntryFormForCheckout] = useState(false);
  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const styleId = 'contest-ticker-animation';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes ticker {
        0% { transform: translateX(0); }
        100% { transform: translateX(-100%); }
      }
      .ticker-text {
        animation: ticker 20s linear infinite !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      const existing = document.getElementById(styleId);
      if (existing) existing.remove();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const emailFromQuery = qp.get('email');
    if (emailFromQuery) {
      const normalizedEmail = emailFromQuery.trim().toLowerCase();
      writeContestEmail(normalizedEmail);
      setContestEmail(normalizedEmail);
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('email');
      window.history.replaceState({}, '', newUrl.toString());
      fetch('/api/contest/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
        credentials: 'include',
      })
        .then((res) => {
          if (!res.ok) return res.json().catch(() => ({ ok: false }));
          return res.json();
        })
        .then((data) => {
          if (data?.ok) {
            const email = readContestEmail();
            if (email) setContestEmail(email);
          }
        })
        .catch(() => {});
    }
  }, [qp]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (contestEmail) {
      const stored = readAssociate();
      if (stored && stored.email !== contestEmail) {
        clearAssociateCaches({ keepContestEmail: true });
        setAssociate(null);
      } else {
        setAssociate(stored);
      }
      return;
    }
    const sync = () => {
      let email = readContestEmail();
      if (!email) {
        const emailFromQuery = qp.get('email');
        if (emailFromQuery) {
          const normalizedEmail = emailFromQuery.trim().toLowerCase();
          writeContestEmail(normalizedEmail);
          email = normalizedEmail;
          setContestEmail(email);
          fetch('/api/contest/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: normalizedEmail }),
            credentials: 'include',
          })
            .then((res) => res.json())
            .then((data) => {
              if (data?.ok) return;
            })
            .catch(() => {});
          return;
        }
      }
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
      if (email) setContestEmail(email);
      setAssociate(stored);
    };
    sync();
    const handleStorageChange = () => {
      if (!contestEmail) sync();
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [qp, contestEmail]);

  useEffect(() => {
    let cancelled = false;
    const loadStatus = async () => {
      if (!contestEmail) {
        setHasProfile(false);
        setProfileFirstName(null);
        setAssociate(null);
        setStatusLoaded(false);
        setStatusLoading(false);
        return;
      }
      setStatusLoading(true);
      setStatusLoaded(false);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch('/api/associate/status', {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`status_failed_${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const nextHasProfile = Boolean(data?.hasProfile);
        setHasProfile(nextHasProfile);
        setProfileFirstName(data?.firstName || null);
        if (data?.firstName) {
          try {
            window.localStorage.setItem('first_name', data.firstName);
          } catch {
            /* ignore */
          }
        }
        if (nextHasProfile && data?.id && data?.email) {
          const payload: AssociateCache = {
            id: data.id,
            email: data.email,
            name: data?.name || data.email,
            code: data?.code || '',
          };
          writeAssociate(payload);
          setAssociate(payload);
        } else if (!nextHasProfile) {
          setAssociate(null);
        }
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'AbortError') return;
        if (!cancelled) {
          setHasProfile(false);
          setProfileFirstName(null);
          const existingAssociate = readAssociate();
          if (!existingAssociate) setAssociate(null);
        }
      } finally {
        if (!cancelled) {
          setStatusLoading(false);
          setStatusLoaded(true);
        }
      }
    };
    const timer = setTimeout(loadStatus, 100);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setStatusLoading(false);
    };
  }, [contestEmail]);

  const sessionId = qp.get('session_id');
  const justPurchased = qp.get('justPurchased') === '1';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }
    const initializePlayer = () => {
      if (!(window as { YT?: { Player?: new (id: string, opts: unknown) => unknown } }).YT?.Player) return;
      const containerId = 'contest-video-player';
      const container = document.getElementById(containerId);
      if (!container) {
        setTimeout(initializePlayer, 500);
        return;
      }
      if (!playerRef.current) {
        try {
          const YT = (window as { YT: { Player: new (id: string, opts: unknown) => unknown } }).YT;
          playerRef.current = new YT.Player(containerId, {
            videoId: '_DEmdMYdjXk',
            playerVars: {
              autoplay: 1,
              mute: 1,
              controls: 1,
              rel: 0,
              modestbranding: 1,
              enablejsapi: 1,
              loop: 1,
              playlist: '_DEmdMYdjXk',
            },
            events: {
              onReady: (event: { target: { playVideo: () => void; unMute: () => void } }) => {
                const player = event.target;
                const startPlayback = () => {
                  try {
                    player.playVideo();
                    setTimeout(() => {
                      try {
                        player.unMute();
                      } catch {
                        /* ignore */
                      }
                    }, 500);
                  } catch {
                    /* ignore */
                  }
                };
                startPlayback();
              },
              onStateChange: (event: { data: number; target: { unMute: () => void; playVideo: () => void } }) => {
                const state = event.data;
                const YTState = (window as { YT?: { PlayerState?: { ENDED?: number; PLAYING?: number; PAUSED?: number } } }).YT?.PlayerState;
                if (YTState && state === YTState.ENDED && playerRef.current) {
                  setTimeout(() => {
                    try {
                      (playerRef.current as { seekTo: (n: number, b: boolean) => void; playVideo: () => void; unMute: () => void }).seekTo(0, true);
                      (playerRef.current as { playVideo: () => void }).playVideo();
                      (playerRef.current as { unMute: () => void }).unMute();
                    } catch {
                      /* ignore */
                    }
                  }, 500);
                } else if (YTState && state === YTState.PLAYING) {
                  try {
                    event.target.unMute();
                  } catch {
                    /* ignore */
                  }
                } else if (YTState && state === YTState.PAUSED) {
                  setTimeout(() => {
                    try {
                      event.target.playVideo();
                      event.target.unMute();
                    } catch {
                      /* ignore */
                    }
                  }, 1000);
                }
              },
              onError: () => {},
            },
          });
        } catch {
          /* ignore */
        }
      }
    };
    if ((window as { YT?: { Player?: unknown } }).YT?.Player) {
      setTimeout(initializePlayer, 100);
    } else {
      (window as { onYouTubeIframeAPIReady?: () => void }).onYouTubeIframeAPIReady = () => {
        setTimeout(initializePlayer, 100);
      };
    }
    return () => {
      if (playerRef.current) {
        try {
          (playerRef.current as { destroy: () => void }).destroy();
          playerRef.current = null;
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  useEffect(() => {
    const key = 'contest:has-points';
    const already = typeof window !== 'undefined' ? window.localStorage.getItem(key) === '1' : false;
    const nowQualified = Boolean(sessionId || justPurchased);
    if (nowQualified) {
      try {
        window.localStorage.setItem(key, '1');
      } catch {
        /* ignore */
      }
      setShowScoreButton(true);
    } else {
      setShowScoreButton(already);
    }
  }, [sessionId, justPurchased]);

  const buttons = useMemo(
    () => [
      { id: 'sampleBtn', label: 'Read Sample Chapters', text: 'Tap here to read a sample chapter!', href: '/sample-chapters', type: 'link' as const },
      { id: 'contestBtn', label: 'Enter the Contest', text: 'You can win this for your family!', href: '/contest/signup?from=/contest', type: 'link' as const },
      { id: 'pointsBtn', label: 'Send Signal', text: 'Tap here to win points.', href: '/signal-room', type: 'link' as const },
      { id: 'buyBtn', label: 'Buy the Book', text: "The adventure's great—and you're already living it.", type: 'button' as const },
    ],
    []
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const next = (current + 1) % buttons.length;
      setCurrent(next);
      setTapsyText(buttons[next].text);
    }, 5000);
    return () => clearInterval(interval);
  }, [current, buttons]);

  const hasAssociate = useMemo(() => statusLoaded && hasProfile && Boolean(contestEmail), [statusLoaded, hasProfile, contestEmail]);

  const handleChangeAccount = useCallback(async () => {
    try {
      await fetch('/api/contest/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
      clearAssociateCaches();
      const viteUrl = process.env.NEXT_PUBLIC_TERMINAL_URL || 'http://localhost:5173';
      window.location.href = viteUrl;
    } catch {
      clearAssociateCaches();
      router.replace('/contest');
    }
  }, [router]);

  const handleContestEntry = (href: string) => {
    if (!contestEmail || !statusLoaded) return;
    if (hasAssociate) router.push('/contest/score');
    else router.push(href);
  };

  const handleRequireContestEntry = useCallback(() => {
    setShowEntryFormForCheckout(true);
    setTimeout(() => {
      const formElement = document.querySelector('[data-contest-entry-form]');
      formElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }, []);

  const handleContestEntryCompletedFromBuy = useCallback(async () => {
    try {
      const path = typeof window !== 'undefined' ? window.location.pathname : '/contest';
      await startCheckout({
        source: 'contest',
        path,
        successPath: '/contest/thank-you',
        cancelPath: '/contest',
      });
    } catch (err: unknown) {
      alert((err as { message?: string })?.message || 'Could not start checkout.');
    }
  }, []);

  return (
    <div
      style={{
        backgroundColor: 'black',
        color: 'white',
        fontFamily: 'Arial, sans-serif',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'center',
        paddingBottom: '4rem',
      }}
    >
      <div style={{ width: '100%', height: '65vh', position: 'relative', overflow: 'hidden' }}>
        <div
          id="contest-video-player"
          ref={videoRef}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center top',
            position: 'absolute',
            top: 0,
            left: 0,
          }}
        />
      </div>

      <div style={{ textAlign: 'center', marginTop: '2rem', fontSize: '1.2rem' }}>{tapsyText}</div>

      {contestEmail ? (
        <div style={{ marginTop: '0.75rem', color: '#9ca3af', fontSize: '0.95rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {hasAssociate ? (
            <>
              Signed in as <strong>{contestEmail}</strong>
              {' · '}
              Welcome back
              {profileFirstName ? `, ${profileFirstName}` : '!'}
            </>
          ) : (
            <>
              Signed in as <strong>{contestEmail}</strong>
            </>
          )}
          <button
            type="button"
            onClick={handleChangeAccount}
            style={{
              background: 'transparent',
              border: '1px solid rgba(148, 163, 184, 0.6)',
              color: '#e5e7eb',
              padding: '0.35rem 1rem',
              borderRadius: 999,
              cursor: 'pointer',
            }}
          >
            Change account
          </button>
        </div>
      ) : (
        <div style={{ marginTop: '0.75rem', color: '#f87171', fontSize: '0.95rem' }}>
          No contest email detected. Restart the flow to enter with your address.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1.2rem' }}>
        {buttons.map((btn, index) => (
          <div key={btn.id} style={{ position: 'relative', textAlign: 'center' }}>
            {index === current && (
              <>
                <div style={{ position: 'absolute', top: '-40px', left: '50%', transform: 'translateX(-50%)', fontSize: '2rem', animation: 'bounce 1s infinite' }}>👉</div>
                <div style={{ fontSize: '0.8rem', color: '#00ff00', marginBottom: '0.3rem' }}>{btn.text}</div>
              </>
            )}
            {btn.id === 'contestBtn' ? (
              <button
                type="button"
                disabled={statusLoading || !contestEmail}
                onClick={() => handleContestEntry(btn.href ?? '/contest')}
                style={{
                  padding: '1rem',
                  backgroundColor: index === current ? 'green' : '#111',
                  border: '2px solid green',
                  color: index === current ? 'black' : 'white',
                  fontSize: '1rem',
                  cursor: statusLoading || !contestEmail ? 'not-allowed' : 'pointer',
                  animation: index === current ? 'pulse 1s infinite' : 'none',
                  transition: 'all 0.3s',
                  minWidth: '200px',
                  opacity: statusLoading || !contestEmail ? 0.6 : 1,
                }}
              >
                {statusLoading ? 'Checking...' : hasAssociate ? 'See Your Progress' : btn.label}
              </button>
            ) : btn.type === 'button' ? (
              <BuyBookButton
                source="contest"
                successPath="/contest/thank-you"
                cancelPath="/contest"
                onRequireContestEntry={handleRequireContestEntry}
                style={{
                  padding: '1rem',
                  backgroundColor: index === current ? 'green' : '#111',
                  border: '2px solid green',
                  color: index === current ? 'black' : 'white',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  animation: index === current ? 'pulse 1s infinite' : 'none',
                  transition: 'all 0.3s',
                }}
              >
                {btn.label}
              </BuyBookButton>
            ) : (
              <Link
                href={btn.href}
                prefetch={false}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '1rem',
                  backgroundColor: index === current ? 'green' : '#111',
                  border: '2px solid green',
                  color: index === current ? 'black' : 'white',
                  fontSize: '1rem',
                  textDecoration: 'none',
                  cursor: 'pointer',
                  animation: index === current ? 'pulse 1s infinite' : 'none',
                  transition: 'all 0.3s',
                }}
              >
                {btn.label}
              </Link>
            )}
          </div>
        ))}
      </div>

      {showScoreButton && (
        <div style={{ marginTop: '0.75rem' }}>
          <CurrentScoreButton />
        </div>
      )}

      {showEntryFormForCheckout && (
        <div data-contest-entry-form style={{ marginTop: '2rem', width: '100%', display: 'flex', justifyContent: 'center', padding: '0 1.5rem' }}>
          <ContestEntryForm suppressAscensionRedirect={true} onCompleted={handleContestEntryCompletedFromBuy} />
        </div>
      )}

      <div
        style={{
          backgroundColor: 'red',
          color: 'white',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          position: 'fixed',
          bottom: 0,
          width: '100%',
          padding: '0.5rem',
          fontWeight: 'bold',
          zIndex: 1000,
        }}
      >
        <span className="ticker-text" style={{ display: 'inline-block', paddingLeft: '100%', animation: 'ticker 20s linear infinite' }}>
          Agnes Protocol tops banned book list – again • Jody Vernon breaks silence in viral interview • New points leader: Billy Bronski – 1,340 pts • Tapsy declares: &quot;This book changes everything&quot; • Enter to win the 6-day dream vacation NOW!
        </span>
      </div>

      <style jsx global>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-100%); }
        }
        .ticker-text { animation: ticker 20s linear infinite !important; }
        @keyframes pulse {
          0% { box-shadow: 0 0 5px lime; }
          50% { box-shadow: 0 0 15px lime; }
          100% { box-shadow: 0 0 5px lime; }
        }
        @keyframes bounce {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(-5px); }
        }
      `}</style>

      <CheckoutWiring />
      <HelpButton />
    </div>
  );
}
