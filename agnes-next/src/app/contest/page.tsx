'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import CheckoutWiring from './CheckoutWiring'; // GåÉ invisible helper that wires the Buy button
import CurrentScoreButton from './CurrentScoreButton';

export default function ContestPage() {
  const qp = useSearchParams();
  const [current, setCurrent] = useState(0);
  const [tapsyText, setTapsyText] = useState('Tap here to read a sample chapter!');
  const [showScoreButton, setShowScoreButton] = useState(false);

  // Detect GÇ£just did something that earns pointsGÇ¥ signals:
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

  const buttons = useMemo(() => ([
    {
      id: 'sampleBtn',
      label: 'Read Sample Chapters',
      text: 'Tap here to read a sample chapter!',
      link: '/sample-chapters',
    },
    {
      id: 'contestBtn',
      label: 'Enter the Contest',
      text: 'You can win this for your family!',
      link: '/contest',
    },
    {
      id: 'pointsBtn',
      label: 'Earn Points',
      text: 'Tap here to win points.',
      link: '/earn-points',
    },
    {
      id: 'buyBtn',
      label: 'Buy the Book',
      text: 'The adventureGÇÖs greatGÇöand youGÇÖre already living it.',
      // keep your existing link to preserve structure; our wiring will intercept
      link: 'https://buy.stripe.com/test_7sY9ATfsHgPK47i3vq',
    },
  ]), []);

  useEffect(() => {
    const interval = setInterval(() => {
      const next = (current + 1) % buttons.length;
      setCurrent(next);
      setTapsyText(buttons[next].text);
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, buttons]);

  // unchanged for everything except Buy:
  const handleClick = (btn: (typeof buttons)[number]) => {
    if (btn.id === 'buyBtn') return; // let CheckoutWiring take over
    window.location.href = btn.link;
  };

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
                  =ƒæë
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
            <button
              {...(btn.id === 'buyBtn' ? { 'data-checkout': 'contest' } : {})}
              onClick={() => handleClick(btn)}
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
            </button>
          </div>
        ))}
      </div>

      {/* GÇ£VIEW YOUR POINTSGÇ¥ GÇö animated component */}
      {showScoreButton && (
        <div style={{ marginTop: '0.75rem' }}>
          <CurrentScoreButton />
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
          Agnes Protocol tops banned book list GÇô again GÇó Jody Vernon breaks silence in viral
          interview GÇó New points leader: Billy Bronski GÇô 1,340 pts GÇó Tapsy declares: GÇ£This book
          changes everythingGÇ¥ GÇó Enter to win the 6-day dream vacation NOW!
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
