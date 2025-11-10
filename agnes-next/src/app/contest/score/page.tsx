'use client';

import '@/styles/score.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { confettiCelebrate, confettiSprinkle } from '@/lib/confetti';
import { useScore } from '@/hooks/useScore';

function clamp(min: number, v: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

type PointsPayload = {
  totalPoints?: number;
  earned?: { purchase_book?: boolean } | null;
  recent?: { type: string; at: string }[];
  referrals?: number;
  earnings_week_usd?: number;
  firstName?: string | null;
};

export default function ScorePage() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const qp = useSearchParams();
  const [reducedMotion] = useState(
    typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  // mist with +0.05 base boost
  const [mist, setMist] = useState(0.6);
  const [hovered, setHovered] = useState<string | null>(null);
  const mistTarget = useMemo(() => {
    if (typeof window === 'undefined') return 0.6; // SSR fallback
    const v = Number(localStorage.getItem('score_visits') ?? '0') + 1;
    localStorage.setItem('score_visits', String(v));
    const base = clamp(0.25, 0.65 - (v - 1) * 0.05, 0.65);
    return base + 0.05; // +0.05 boost as requested
  }, []);
  useEffect(() => setMist(mistTarget), [mistTarget]);
  useEffect(() => {
    const spot = hovered ? 0.05 : mistTarget;
    const id = setTimeout(() => setMist(spot), 150);
    return () => clearTimeout(id);
  }, [hovered, mistTarget]);

  // confetti (first visit only, big celebration)
  useEffect(() => {
    if (reducedMotion) return;
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('score_confetti_done')) return;
    const id = setTimeout(() => {
      confettiCelebrate();
      localStorage.setItem('score_confetti_done', '1');
    }, 250);
    return () => clearTimeout(id);
  }, [reducedMotion]);

  // CAPTION STAGE state
  const [stageText, setStageText] = useState<string>('');
  const [stageVisible, setStageVisible] = useState(false);
  const [stageSequence, setStageSequence] = useState<'greetings' | 'info' | 'idle' | 'hover'>('greetings');
  const [greetingIndex, setGreetingIndex] = useState(0);

  const infoLines = [
    "Everything is up from here—have fun using the site and you'll earn points toward a family vacation and BIG money!",
    'Games, social media, inviting friends—everything you do earns points!',
  ];

  // Button hover captions
  const hoverCaptions: Record<string, string> = {
    buy: 'You bought the book! +500 pts. After you read it, play trivia and earn +250 more.',
    x: 'Nice one—+100 pts today. You can earn +100 again tomorrow by sharing again.',
    ig: 'Nice one—+100 pts today. You can earn +100 again tomorrow by sharing again.',
    fb: '+100 pts today. Share again tomorrow for another +100.',
    truth: '+100 pts today. Share again tomorrow for another +100.',
    tt: '+100 pts today. Share again tomorrow for another +100.',
    contest: 'Game on! Enter the contest for +250 pts and a shot at the cruise.',
    refer: 'Invite friends: they save $3.90; you earn $2 each. It adds up fast.',
    subscribe: 'Stay in the loop—+50 pts when you join the weekly digest.',
    rabbit: 'Catch the Rabbit and earn 1,000 points.',
  };

  // success banners
  const sid = qp.get('sid');
  const shared = qp.get('shared');
  const [dismiss, setDismiss] = useState(false);

  // points fetch
  const [data, setData] = useState<PointsPayload | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/points/me', { method: 'GET', credentials: 'include' })
      .then(r => r.json())
      .then((j: any) => {
        if (!cancelled) {
          // Transform to match existing interface
          setData({
            totalPoints: j.total || 0,
            firstName: j.firstName || null,
            earned: {
              purchase_book: j.earned?.purchase_book || false,
            },
            recent: j.recent?.map((r: any) => ({
              type: r.label,
              at: r.ts,
            })) || [],
            referrals: j.referrals?.friends_purchased_count || 0,
            earnings_week_usd: j.referrals?.earnings_week_usd || 0,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setData({ totalPoints: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Compute firstName after data is available
  const firstName = useMemo(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('first_name');
      if (stored) return stored;
    }
    return data?.firstName || 'Friend';
  }, [data?.firstName]);

  const greetingLines = [
    `${firstName}—way to go!`,
    'You made it.',
    "You're in a good spot—You can win this.",
  ];

  // Greeting sequence (ONCE, 2.2s per line)
  useEffect(() => {
    if (stageSequence !== 'greetings') return;
    const duration = reducedMotion ? 1500 : 2200;
    const fadeDuration = reducedMotion ? 200 : 400;

    let timeoutId: NodeJS.Timeout;
    const showLine = (idx: number) => {
      setStageText(greetingLines[idx]);
      setStageVisible(true);
      timeoutId = setTimeout(() => {
        setStageVisible(false);
        setTimeout(() => {
          if (idx < greetingLines.length - 1) {
            setGreetingIndex(idx + 1);
          } else {
            setStageSequence('info');
            setGreetingIndex(0);
          }
        }, fadeDuration);
      }, duration);
    };

    showLine(greetingIndex);
    return () => clearTimeout(timeoutId);
  }, [stageSequence, greetingIndex, reducedMotion, greetingLines]);

  // INFO sequence (INFO1 → INFO2 → idle)
  useEffect(() => {
    if (stageSequence !== 'info') return;
    const duration = reducedMotion ? 2000 : 2500;
    const fadeDuration = reducedMotion ? 200 : 400;

    setStageText(infoLines[0]);
    setStageVisible(true);
    const timeout1 = setTimeout(() => {
      setStageVisible(false);
      setTimeout(() => {
        setStageText(infoLines[1]);
        setStageVisible(true);
        const timeout2 = setTimeout(() => {
          setStageVisible(false);
          setTimeout(() => {
            setStageSequence('idle');
          }, fadeDuration);
        }, duration);
        return () => clearTimeout(timeout2);
      }, fadeDuration);
    }, duration);
    return () => clearTimeout(timeout1);
  }, [stageSequence, reducedMotion]);

  // Hover caption management with confetti sprinkle
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onButtonEnter = (key: string) => {
    setHovered(key);
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setStageSequence('hover');
    setStageText(hoverCaptions[key] || '');
    setStageVisible(true);
    // Sprinkle confetti on hover (only if not reduced motion)
    if (!reducedMotion) {
      confettiSprinkle();
    }
  };
  const onButtonLeave = () => {
    setHovered(null);
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setStageVisible(false);
      setTimeout(() => {
        if (stageSequence === 'hover') setStageSequence('idle');
      }, 300);
    }, 300);
  };
  const handleShareClick = async (
    platform: 'x' | 'ig' | 'fb' | 'truth' | 'tiktok',
    e: React.MouseEvent<HTMLAnchorElement>
  ) => {
    e.preventDefault();

    // Identify user email (for awarding)
    let email: string | null = null;
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const mockEmail = urlParams.get('mockEmail');
      const mockEmailCookie = document.cookie
        .split('; ')
        .find((row) => row.startsWith('mockEmail='))
        ?.split('=')[1];
      email = mockEmail || mockEmailCookie || null;
    }

    // Referral code (optional) from cookie
    const referralCode =
      typeof document !== 'undefined'
        ? (document.cookie.split('; ').find((r) => r.startsWith('ref='))?.split('=')[1] || '')
        : '';

    const ORIGIN =
      (typeof window !== 'undefined' && window.location.origin) ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      '';

    // Instagram: open helper page, rotate videos/captions, copy caption, award points
    if (platform === 'ig') {
      const captions = [
        'The Agnes Protocol — The End of Truth Begins Here. #WhereIsJodyVernon',
        'This story will get under your skin. #AgnesProtocol',
        'Big tech. Dark money. One con man who might save us all. #TheAgnesProtocol',
      ];

      // Rotate caption index
      try {
        const capIdx = Number(localStorage.getItem('ig_cap_idx') || '0');
        const nextCapIdx = (capIdx + 1) % captions.length;
        localStorage.setItem('ig_cap_idx', String(nextCapIdx));
        const captionIdx = capIdx % captions.length;

        // Rotate video index (for helper page param)
        const vIdx = Number(localStorage.getItem('ig_vid_idx') || '0');
        const nextVIdx = (vIdx + 1) % 3;
        localStorage.setItem('ig_vid_idx', String(nextVIdx));
        const iParam = (vIdx % 3) + 1;

        // Build caption with landing URL
        const caption = `${captions[captionIdx]}\n${ORIGIN}/s/fb?v=${((captionIdx % 3) + 1)}&utm_source=instagram`;

        // Copy caption
        try {
          await navigator.clipboard.writeText(caption);
        } catch {}

        // Open helper page
        window.open(`${ORIGIN}/s/ig?i=${iParam}`, '_blank', 'noopener,noreferrer');

        // Award points
        if (email) {
          try {
            await fetch(`/api/points/award?mockEmail=${encodeURIComponent(email)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'share_ig' }),
            });
            // Refresh points
            const res = await fetch('/api/points/me', { method: 'GET', credentials: 'include' });
            const j = await res.json();
            setData({
              totalPoints: j.total || 0,
              firstName: j.firstName || null,
              earned: { purchase_book: j.earned?.purchase_book || false },
              recent: j.recent?.map((r: any) => ({ type: r.label, at: r.ts })) || [],
              referrals: j.referrals?.friends_purchased_count || 0,
              earnings_week_usd: j.referrals?.earnings_week_usd || 0,
            });
          } catch (err) {
            console.error('[share][ig] award failed', err);
          }
        }

        // Success banner
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          url.searchParams.set('shared', 'ig');
          window.history.pushState({}, '', url.toString());
        }
      } catch (err) {
        console.error('[share][ig] handler failed', err);
      }
      return;
    }

    // TikTok: open helper page, rotate videos/captions, copy caption, award points
    if (platform === 'tiktok') {
      const captions = [
        'The Agnes Protocol — The End of Truth Begins Here. #WhereIsJodyVernon',
        'This story will get under your skin. #AgnesProtocol',
        'Big tech. Dark money. One con man who might save us all. #TheAgnesProtocol',
      ];

      // Rotate caption index
      try {
        const capIdx = Number(localStorage.getItem('tt_cap_idx') || '0');
        const nextCapIdx = (capIdx + 1) % captions.length;
        localStorage.setItem('tt_cap_idx', String(nextCapIdx));
        const captionIdx = capIdx % captions.length;

        // Rotate video index (for helper page param)
        const vIdx = Number(localStorage.getItem('tt_vid_idx') || '0');
        const nextVIdx = (vIdx + 1) % 3;
        localStorage.setItem('tt_vid_idx', String(nextVIdx));
        const iParam = (vIdx % 3) + 1;

        // Build caption with landing URL
        const landingUrl = `${ORIGIN}/s/fb?v=${((captionIdx % 3) + 1)}&utm_source=tiktok${referralCode ? `&ref=${encodeURIComponent(referralCode)}` : ''}`;
        const caption = `${captions[captionIdx]}\n${landingUrl}`;

        // Copy caption
        try {
          await navigator.clipboard.writeText(caption);
        } catch {}

        // Open helper page
        window.open(`${ORIGIN}/s/tt?i=${iParam}`, '_blank', 'noopener,noreferrer');

        // Award points
        if (email) {
          try {
            await fetch(`/api/points/award?mockEmail=${encodeURIComponent(email)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'share_tiktok' }),
            });
            // Refresh points
            const res = await fetch('/api/points/me', { method: 'GET', credentials: 'include' });
            const j = await res.json();
            setData({
              totalPoints: j.total || 0,
              firstName: j.firstName || null,
              earned: { purchase_book: j.earned?.purchase_book || false },
              recent: j.recent?.map((r: any) => ({ type: r.label, at: r.ts })) || [],
              referrals: j.referrals?.friends_purchased_count || 0,
              earnings_week_usd: j.referrals?.earnings_week_usd || 0,
            });
          } catch (err) {
            console.error('[share][tiktok] award failed', err);
          }
        }

        // Success banner
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          url.searchParams.set('shared', 'tt');
          window.history.pushState({}, '', url.toString());
        }
      } catch (err) {
        console.error('[share][tiktok] handler failed', err);
      }
      return;
    }

    // Facebook: rotate videos/captions, build landing URL, copy caption, open share dialog
    if (platform === 'fb') {
      // Helper: rotate index 0..(max-1) using localStorage
      const nextIndex = (key: string, max: number) => {
        try {
          const n = Number(localStorage.getItem(key) || '0');
          const nx = (isNaN(n) ? 0 : n + 1) % max;
          localStorage.setItem(key, String(nx));
          return n % max; // return current index before increment
        } catch {
          return 0;
        }
      };

      // Rotate video index (1..3)
      const vidIdx = nextIndex('fb_vid_idx', 3);
      const v = vidIdx + 1;

      // Rotate captions
      const captions = [
        'The Agnes Protocol — The End of Truth Begins Here. #WhereIsJodyVernon',
        'This story will get under your skin. The Agnes Protocol — coming to light. #AgnesProtocol',
        'Big tech. Dark money. One con man who might save us all. #TheAgnesProtocol',
      ];
      const capIdx = nextIndex('fb_cap_idx', captions.length);
      
      // Build landing URL with video parameter
      const qp = new URLSearchParams({ v: String(v), utm_source: 'facebook' });
      if (referralCode) qp.set('ref', referralCode);
      const landing = `${ORIGIN}/s/fb?${qp.toString()}`;
      
      // Build caption with landing URL
      const caption = `${captions[capIdx]}\n${landing}`;

      // Copy caption to clipboard
      try {
        await navigator.clipboard.writeText(caption);
      } catch {}

      // Open Facebook Share Dialog
      const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(landing)}`;
      const w = window.open(fbUrl, '_blank', 'noopener,noreferrer');
      if (!w) {
        // Popup blocked fallback
        alert('Pop-up blocked. Caption copied—paste in Facebook:\n\n' + caption);
      }

      // Award points
      if (email) {
        try {
          await fetch(`/api/points/award?mockEmail=${encodeURIComponent(email)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'share_fb' }),
          });
          // Refresh points
          const res = await fetch('/api/points/me', { method: 'GET', credentials: 'include' });
          const j = await res.json();
          setData({
            totalPoints: j.total || 0,
            firstName: j.firstName || null,
            earned: { purchase_book: j.earned?.purchase_book || false },
            recent: j.recent?.map((r: any) => ({ type: r.label, at: r.ts })) || [],
            referrals: j.referrals?.friends_purchased_count || 0,
            earnings_week_usd: j.referrals?.earnings_week_usd || 0,
          });
        } catch (err) {
          console.error('[share][fb] award failed', err);
        }
      }

      // Success banner
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('shared', 'fb');
        window.history.pushState({}, '', url.toString());
      }
      return;
    }

    // Truth Social: use /s/fb landing (for OG preview), rotate videos/captions, copy caption
    if (platform === 'truth') {
      // Helper: rotate index 0..(max-1) using localStorage
      const nextIndex = (key: string, max: number) => {
        try {
          const n = Number(localStorage.getItem(key) || '0');
          const nx = (isNaN(n) ? 0 : n + 1) % max;
          localStorage.setItem(key, String(nx));
          return n % max; // return current index before increment
        } catch {
          return 0;
        }
      };

      // Build landing URL using /s/fb (so OG preview works)
      const vidIdx = nextIndex('truth_vid_idx', 3); // 0..2 → fb1, fb2, fb3
      const v = vidIdx + 1;
      const qp = new URLSearchParams({ v: String(v), utm_source: 'truth' });
      if (referralCode) qp.set('ref', referralCode);
      const landing = `${ORIGIN}/s/fb?${qp.toString()}`;

      // Rotate captions
      const captions = [
        'The Agnes Protocol — The End of Truth Begins Here. #WhereIsJodyVernon',
        'This story will get under your skin. The Agnes Protocol — coming to light. #AgnesProtocol',
        'Big tech. Dark money. One con man who might save us all. #TheAgnesProtocol',
      ];
      const capIdx = nextIndex('truth_cap_idx', captions.length);
      const caption = `${captions[capIdx]}\n${landing}`;

      // Copy caption to clipboard
      try {
        await navigator.clipboard.writeText(caption);
      } catch {}

      // Open Truth Social composer
      const truthUrl = `https://truthsocial.com/compose?text=${encodeURIComponent(caption)}`;
      const w = window.open(truthUrl, '_blank', 'noopener,noreferrer');
      if (!w) {
        // Popup blocked fallback
        alert('Pop-up blocked. Caption copied—paste in Truth Social:\n\n' + caption);
      }

      // Award points
      if (email) {
        try {
          await fetch(`/api/points/award?mockEmail=${encodeURIComponent(email)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'share_truth' }),
          });
          // Refresh points
          const res = await fetch('/api/points/me', { method: 'GET', credentials: 'include' });
          const j = await res.json();
          setData({
            totalPoints: j.total || 0,
            firstName: j.firstName || null,
            earned: { purchase_book: j.earned?.purchase_book || false },
            recent: j.recent?.map((r: any) => ({ type: r.label, at: r.ts })) || [],
            referrals: j.referrals?.friends_purchased_count || 0,
            earnings_week_usd: j.referrals?.earnings_week_usd || 0,
          });
        } catch (err) {
          console.error('[share][truth] award failed', err);
        }
      }

      // Success banner
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('shared', 'truth');
        window.history.pushState({}, '', url.toString());
      }
      return;
    }

    // X (Twitter): use /s/fb landing (for OG preview), rotate videos/captions, copy caption
    if (platform === 'x') {
      // Helper: rotate index 0..(max-1) using localStorage
      const nextIndex = (key: string, max: number) => {
        try {
          const n = Number(localStorage.getItem(key) || '0');
          const nx = (isNaN(n) ? 0 : n + 1) % max;
          localStorage.setItem(key, String(nx));
          return n % max; // return current index before increment
        } catch {
          return 0;
        }
      };

      // Build landing URL using /s/fb (so OG preview works)
      const vidIdx = nextIndex('x_vid_idx', 3); // 0..2 → fb1, fb2, fb3
      const v = vidIdx + 1;
      const qp = new URLSearchParams({ v: String(v), utm_source: 'twitter' });
      if (referralCode) qp.set('ref', referralCode);
      const landing = `${ORIGIN}/s/fb?${qp.toString()}`;

      // Rotate captions
      const captions = [
        'The Agnes Protocol — The End of Truth Begins Here. #WhereIsJodyVernon',
        'This story will get under your skin. #AgnesProtocol',
        'Big tech. Dark money. One con man who might save us all. #TheAgnesProtocol',
      ];
      const capIdx = nextIndex('x_cap_idx', captions.length);
      const caption = `${captions[capIdx]}\n${landing}`;

      // Copy caption to clipboard
      try {
        await navigator.clipboard.writeText(caption);
      } catch {}

      // Open X composer with prefilled text and URL
      const xUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(caption)}`;
      const w = window.open(xUrl, '_blank', 'noopener,noreferrer');
      if (!w) {
        // Popup blocked fallback
        alert('Pop-up blocked. Caption copied—paste in X:\n\n' + caption);
      }

      // Award points
      if (email) {
        try {
          await fetch(`/api/points/award?mockEmail=${encodeURIComponent(email)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'share_x' }),
          });
          // Refresh points
          const res = await fetch('/api/points/me', { method: 'GET', credentials: 'include' });
          const j = await res.json();
          setData({
            totalPoints: j.total || 0,
            firstName: j.firstName || null,
            earned: { purchase_book: j.earned?.purchase_book || false },
            recent: j.recent?.map((r: any) => ({ type: r.label, at: r.ts })) || [],
            referrals: j.referrals?.friends_purchased_count || 0,
            earnings_week_usd: j.referrals?.earnings_week_usd || 0,
          });
        } catch (err) {
          console.error('[share][x] award failed', err);
        }
      }

      // Success banner
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('shared', 'x');
        window.history.pushState({}, '', url.toString());
      }
      return;
    }
  };

  // totals and progress
  const { totalPoints, rabbitTarget } = useScore();

  const prevBand = Math.floor(totalPoints / 500) * 500;
  const nextBand = prevBand + 500;
  const rankPct = clamp(0, (totalPoints - prevBand) / 500, 1);
 
  const target = rabbitTarget ?? totalPoints + 500;
  const rabbitPct = clamp(0, totalPoints / target, 1);

  const rankInfo = useMemo(() => ({
    current: prevBand,
    next: nextBand,
    pct: rankPct * 100,
  }), [prevBand, nextBand, rankPct]);

  const topFog = Math.min(mist, 0.85);
  const midFog = Math.max(mist - 0.35, 0);
  const wrapClassName = hovered ? 'score-wrap is-hovered' : 'score-wrap';

  // Button component
  const ActionButton = ({
    label,
    sub,
    href,
    hoverKey,
    showTick,
    colorBase,
    colorHover,
    onClick,
  }: {
    label: string;
    sub?: string;
    href: string;
    hoverKey: string;
    showTick?: boolean;
    colorBase: string;
    colorHover: string;
    onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  }) => {
    const isHovered = hovered === hoverKey;
    return (
      <a
        href={href}
        onClick={onClick}
        onMouseEnter={() => onButtonEnter(hoverKey)}
        onMouseLeave={onButtonLeave}
        onFocus={() => onButtonEnter(hoverKey)}
        onBlur={onButtonLeave}
        style={{
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '96px',
          borderRadius: 16,
          padding: '0 24px',
          color: '#fff',
          background: isHovered ? colorHover : colorBase,
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          transition: 'all 0.2s ease',
          transform: isHovered ? (reducedMotion ? 'scale(1.005)' : 'scale(1.02)') : 'scale(1)',
          outline: 'none',
          textDecoration: 'none',
          cursor: 'pointer',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 'clamp(18px, 2vw, 24px)',
          fontWeight: 800,
        }}>
          {label}
          {showTick && (
            <span
              aria-hidden
              style={{
                display: 'inline-block',
                fontSize: 12,
                padding: '2px 6px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.3)',
                color: '#fff',
                fontWeight: 700,
              }}
            >
              ✓
            </span>
          )}
        </div>
        {sub && (
          <div style={{
            fontSize: 14,
            lineHeight: 1,
            color: 'rgba(255,255,255,0.9)',
            marginTop: 4,
          }}>
            {sub}
          </div>
        )}
      </a>
    );
  };

  return (
    <div ref={rootRef} className={wrapClassName}>
      <div id="confetti-layer" className="score-confetti" />

      <section className="score-stage">
        <div
          className="ship-mist"
          style={{
            background: `linear-gradient(to bottom, rgba(255,255,255,${topFog}), rgba(255,255,255,${midFog}) 55%, rgba(255,255,255,0) 100%)`,
          }}
        />

        {!dismiss && (sid || shared) && (
          <div className="score-banner">
            <div className="score-banner-inner">
              <div className="score-banner-text">
                {sid
                  ? 'Great job purchasing the book. +500 pts! Now read it and play trivia to earn even more.'
                  : shared === 'x'
                  ? "Thanks for sharing on X! +100 if you hadn't already today."
                  : shared === 'ig'
                  ? "Thanks for sharing on Instagram! +100 if you hadn't already today."
                  : shared === 'fb'
                  ? "Thanks for sharing on Facebook! +100 if you hadn't already today."
                  : shared === 'truth'
                  ? "Thanks for sharing on Truth Social! +100 if you hadn't already today."
                  : shared === 'tt'
                  ? "Thanks for sharing on TikTok! +100 if you hadn't already today."
                  : 'Nice one—+100 pts! You can earn +100 again tomorrow by sharing again.'}
              </div>
              <button onClick={() => setDismiss(true)} aria-label="Dismiss" className="score-banner-dismiss">
                ✕
              </button>
            </div>
          </div>
        )}

        <div className="caption-wrap">
          <div
            className="caption-text"
            style={{
              opacity: stageVisible ? 1 : 0,
              transform: stageVisible
                ? 'translateY(0)'
                : reducedMotion
                  ? 'translateY(0)'
                  : 'translateY(10px)',
              transition: reducedMotion
                ? `opacity ${reducedMotion ? '200ms' : '400ms'} ease`
                : `opacity ${reducedMotion ? '200ms' : '400ms'} ease, transform ${reducedMotion ? '200ms' : '400ms'} ease`,
            }}
          >
            {stageText}
          </div>
        </div>
      </section>

      <section className="buttons-grid">
        <div className="points-pill">
          Total Points{' '}
          <span>{totalPoints}</span>
        </div>
        <div className="buttons-grid-inner">
          <ActionButton
            label="Buy the Book"
            sub="500 pts"
            href="/buy"
            hoverKey="buy"
            showTick={!!data?.earned?.purchase_book}
            colorBase="#059669"
            colorHover="#047857"
          />
          <ActionButton
            label="Share to X"
            sub="100 pts"
            href="#"
            hoverKey="x"
            onClick={(e: any) => handleShareClick('x', e)}
            colorBase="#000000"
            colorHover="#262626"
          />
          <ActionButton
            label="Share to Instagram"
            sub="100 pts"
            href="/share/ig?source=score"
            hoverKey="ig"
            onClick={(e: any) => handleShareClick('ig', e)}
            colorBase="#c026d3"
            colorHover="#a21caf"
          />
          <ActionButton
            label="Share to Facebook"
            sub="100 pts"
            href="#"
            hoverKey="fb"
            onClick={(e: any) => handleShareClick('fb', e)}
            colorBase="#1877f2"
            colorHover="#1565c0"
          />
          <ActionButton
            label="Share to Truth"
            sub="100 pts"
            href="#"
            hoverKey="truth"
            onClick={(e: any) => handleShareClick('truth', e)}
            colorBase="#6366f1"
            colorHover="#4f46e5"
          />
          <ActionButton
            label="Join the Contest"
            sub="250 pts"
            href="/contest"
            hoverKey="contest"
            colorBase="#4f46e5"
            colorHover="#4338ca"
          />
          <ActionButton
            label="Refer a Friend"
            sub="$2 each"
            href="/contest/referral"
            hoverKey="refer"
            colorBase="#ea580c"
            colorHover="#c2410c"
          />
          <ActionButton
            label="Weekly Digest Opt‑in"
            sub="50 pts"
            href="/subscribe"
            hoverKey="subscribe"
            colorBase="#e11d48"
            colorHover="#be123c"
          />
          <ActionButton
            label="Share to TikTok"
            sub="100 pts"
            href="#"
            hoverKey="tt"
            onClick={(e: any) => handleShareClick('tiktok', e)}
            colorBase="#1a1a1a"
            colorHover="#2d2d2d"
          />
        </div>
      </section>

      <aside className="score-sidebar">
        <div className="meter" data-key="rank">
          <div className="label">Rank</div>
          <div className="track">
            <div className="fill" style={{ height: `${Math.round(rankPct * 100)}%` }} />
          </div>
          <div className="value">{prevBand} → {nextBand}</div>
        </div>
        <div
          className="meter"
          data-key="rabbit"
          onMouseEnter={() => onButtonEnter('rabbit')}
          onMouseLeave={onButtonLeave}
          onFocus={() => onButtonEnter('rabbit')}
          onBlur={onButtonLeave}
          tabIndex={0}
        >
          <div className="label">Rabbit</div>
          <div className="track">
            <div className="fill" style={{ height: `${Math.round(rabbitPct * 100)}%` }} />
          </div>
          <div className="value">{Math.round(rabbitPct * 100)}%</div>
        </div>
      </aside>
    </div>
  );
}
