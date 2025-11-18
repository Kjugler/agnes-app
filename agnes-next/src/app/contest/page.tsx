'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import CheckoutWiring from './CheckoutWiring'; // ← invisible helper that wires the Buy button
import CurrentScoreButton from './CurrentScoreButton';
import { BuyBookButton } from '@/components/BuyBookButton';
import { ContestEntryForm } from '@/components/ContestEntryForm';
import { startCheckout } from '@/lib/checkout';
import {
  clearAssociateCaches,
  readAssociate,
  readContestEmail,
  writeAssociate,
  type AssociateCache,
} from '@/lib/identity';

export default function ContestPage() {
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => {
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
      setContestEmail(email);
      setAssociate(stored);
    };
    sync();
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

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
        const res = await fetch('/api/associate/status', {
          method: 'GET',
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error(`status_failed_${res.status}`);
        }
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
      } catch (err) {
        console.warn('[contest] status load failed', err);
        if (!cancelled) {
          setHasProfile(false);
          setProfileFirstName(null);
          setAssociate(null);
        }
      } finally {
        if (!cancelled) {
          setStatusLoading(false);
          setStatusLoaded(true);
        }
      }
    };
    loadStatus();
    return () => {
      cancelled = true;
      setStatusLoading(false);
    };
  }, [contestEmail]);

  // Detect “just did something that earns points” signals:
  // - return from Stripe: ?session_id=...
  // - explicit flag: ?justPurchased=1
  const sessionId = qp.get('session_id');
  const justPurchased = qp.get('justPurchased') === '1';

  // Make visibility sticky for the session
  useEffect(() => {
    const key = 'contest:has-points';
    const already = typeof window !== 'undefined' ? window.localStorage.getItem(key) === '1' : false;
    const nowQualified = Boolean(sessionId || justPurchased);

    if (nowQualified) {
      try { window.localStorage.setItem(key, '1'); } catch {}
      setShowScoreButton(true);
    } else {
      setShowScoreButton(already);
    }
  }, [sessionId, justPurchased]);

  const buttons = useMemo(
    () => [
      {
        id: 'sampleBtn',
        label: 'Read Sample Chapters',
        text: 'Tap here to read a sample chapter!',
        href: '/sample-chapters',
        type: 'link' as const,
      },
      {
        id: 'contestBtn',
        label: 'Enter the Contest',
        text: 'You can win this for your family!',
        href: '/contest/signup?from=/contest',
        type: 'link' as const,
      },
      {
        id: 'pointsBtn',
        label: 'Earn Points',
        text: 'Tap here to win points.',
        href: '/contest/ascension',
        type: 'link' as const,
      },
      {
        id: 'buyBtn',
        label: 'Buy the Book',
        text: 'The adventure’s great—and you’re already living it.',
        type: 'button' as const,
      },
    ],
    [],
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const next = (current + 1) % buttons.length;
      setCurrent(next);
      setTapsyText(buttons[next].text);
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, buttons]);

  const hasAssociate = useMemo(() => {
    return statusLoaded && hasProfile && Boolean(contestEmail);
  }, [statusLoaded, hasProfile, contestEmail]);

  const handleChangeAccount = useCallback(() => {
    clearAssociateCaches();
    router.replace('/contest');
  }, [router]);

  const handleContestEntry = (href: string) => {
    if (!contestEmail) return;
    if (!statusLoaded) return;
    if (hasAssociate) {
      router.push('/contest/score');
    } else {
      router.push(href);
    }
  };

  const handleRequireContestEntry = useCallback(() => {
    setShowEntryFormForCheckout(true);
    // Optionally scroll into view
    setTimeout(() => {
      const formElement = document.querySelector('[data-contest-entry-form]');
      if (formElement) {
        formElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
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
    } catch (err: any) {
      alert(err?.message || 'Could not start checkout.');
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
        paddingBottom: '4rem', // leave room for ticker
      }}
    >
      {/* VIDEO SEGMENT */}
      <div style={{ width: '100%', height: '65vh', position: 'relative', overflow: 'hidden' }}>
        <iframe
          src="https://www.youtube.com/embed/_DEmdMYdjXk?autoplay=1&mute=1&controls=1&rel=0&modestbranding=1"
          frameBorder="0"
          allow="autoplay; encrypted-media"
          allowFullScreen
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

      {/* Tapsy COMMENT */}
      <div style={{ textAlign: 'center', marginTop: '2rem', fontSize: '1.2rem' }}>{tapsyText}</div>

      {contestEmail ? (
        <div
          style={{
            marginTop: '0.75rem',
            color: '#9ca3af',
            fontSize: '0.95rem',
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
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

      {/* MENU BUTTONS */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1.2rem' }}>
        {buttons.map((btn, index) => (
          <div key={btn.id} style={{ position: 'relative', textAlign: 'center' }}>
            {index === current && (
              <>
                <div
                  style={{
                    position: 'absolute',
                    top: '-40px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontSize: '2rem',
                    animation: 'bounce 1s infinite',
                  }}
                >
                  👉
                </div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: '#00ff00',
                    marginBottom: '0.3rem',
                  }}
                >
                  {btn.text}
                </div>
              </>
            )}
            {btn.id === 'contestBtn' ? (
              <button
                type="button"
                disabled={statusLoading || !contestEmail}
                onClick={() => handleContestEntry(btn.href)}
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
                {statusLoading
                  ? 'Checking...'
                  : hasAssociate
                    ? 'See Your Progress'
                    : btn.label}
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

      {/* “VIEW YOUR POINTS” — animated component */}
      {showScoreButton && (
        <div style={{ marginTop: '0.75rem' }}>
          <CurrentScoreButton />
        </div>
      )}

      {/* Contest Entry Form (shown when Buy button requires entry) */}
      {showEntryFormForCheckout && (
        <div
          data-contest-entry-form
          style={{
            marginTop: '2rem',
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            padding: '0 1.5rem',
          }}
        >
          <ContestEntryForm
            suppressAscensionRedirect={true}
            onCompleted={handleContestEntryCompletedFromBuy}
          />
        </div>
      )}

      {/* TICKER BANNER */}
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
        <span
          style={{
            display: 'inline-block',
            paddingLeft: '100%',
            animation: 'ticker 20s linear infinite',
          }}
        >
          Agnes Protocol tops banned book list – again • Jody Vernon breaks silence in viral
          interview • New points leader: Billy Bronski – 1,340 pts • Tapsy declares: “This book
          changes everything” • Enter to win the 6-day dream vacation NOW!
        </span>
      </div>

      {/* ANIMATIONS */}
      <style jsx global>{`
        @keyframes ticker {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-100%); }
        }
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

      {/* Invisible behavior: wires Buy button to checkout */}
      <CheckoutWiring />
    </div>
  );
}