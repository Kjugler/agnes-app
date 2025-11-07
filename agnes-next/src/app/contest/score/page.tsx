'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { confettiCelebrate, confettiSprinkle } from '@/lib/confetti';

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
    const spot = hovered ? Math.max(0.18, mistTarget - 0.08) : mistTarget;
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
  const total = Number(data?.totalPoints || 0);
  
  // Rank tiers: 0, 500, 1000, 2000, 5000
  const RANKS = [0, 500, 1000, 2000, 5000];
  const rankInfo = useMemo(() => {
    let current = RANKS[0];
    let next = RANKS[1];
    
    for (let i = 0; i < RANKS.length - 1; i++) {
      if (total >= RANKS[i] && total < RANKS[i + 1]) {
        current = RANKS[i];
        next = RANKS[i + 1];
        break;
      }
    }
    
    // If at max tier or above
    if (total >= RANKS[RANKS.length - 1]) {
      current = RANKS[RANKS.length - 1];
      next = RANKS[RANKS.length - 1];
    }
    
    const pct = next > current 
      ? Math.min(100, Math.max(0, ((total - current) / (next - current)) * 100))
      : 100;
    
    return { current, next, pct };
  }, [total]);
  
  const rabbitPct = typeof window !== 'undefined'
    ? Number(localStorage.getItem('rabbit_pct') ?? '0')
    : 0;

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
    <main ref={rootRef} style={{ position: 'relative', minHeight: '100vh' }}>
      {/* confetti layer overlay */}
      <div
        id="confetti-layer"
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 30,
        }}
      />

      {/* dreamy backdrop */}
      <div style={{ position: 'fixed', inset: 0, zIndex: -10 }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: "url('/images/score-bg.jpg')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backdropFilter: 'blur(4px)',
            background: `linear-gradient(to bottom, rgba(255,255,255,${mist}), rgba(255,255,255,${
              mist * 0.7
            }))`,
            transition: 'opacity .3s ease',
          }}
        />
      </div>

      {/* SUCCESS BANNERS (absolute, top, no layout shift) */}
      {!dismiss && (sid || shared) && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            top: 16,
            zIndex: 40,
            width: 'min(92vw, 1100px)',
          }}
        >
          <div
            style={{
              borderRadius: 12,
              background: 'rgba(16,185,129,0.12)',
              border: '1px solid rgba(16,185,129,0.35)',
              color: '#065f46',
              padding: '12px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
             <div style={{ fontWeight: 700 }}>
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
            <button
              onClick={() => setDismiss(true)}
              aria-label="Dismiss"
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* CAPTION STAGE (centered, top third - where roller coaster/water slides are) */}
      <div
        style={{
          pointerEvents: 'none',
          position: 'absolute',
          left: 0,
          right: 0,
          top: '8vh',  // Positioned in top third to show upper deck
          display: 'flex',
          justifyContent: 'center',
          zIndex: 40,
        }}
      >
        <div style={{ 
          textAlign: 'center', 
          padding: '0 24px',
          maxWidth: '960px',
        }}>
          <div
            style={{
              fontSize: 'clamp(36px, 8vw, 64px)',
              fontWeight: 900,
              letterSpacing: '-0.02em',
              color: 'rgba(0,0,0,0.85)',
              textShadow: '0 2px 8px rgba(0,0,0,0.1)',
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
      </div>

      {/* BOTTOM THIRD: Button Grid + Progress Bars (positioned in bottom third) */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        minHeight: '33vh',  // Bottom third of viewport
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',  // Start from top of bottom section
        paddingTop: '40px',
        paddingBottom: '40px',
      }}>
        {/* Compact Points Pill */}
        <div style={{
          maxWidth: '1152px',
          margin: '0 auto',
          width: '100%',
          padding: '0 24px',
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'flex-end',
          zIndex: 20,
        }}>
          <div style={{
            borderRadius: 999,
            background: 'rgba(0,0,0,0.8)',
            color: '#fff',
            padding: '8px 16px',
            fontSize: 'clamp(14px, 2vw, 16px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}>
            Total Points:{' '}
            <span style={{ fontWeight: 700, fontSize: 'clamp(18px, 2.5vw, 20px)' }}>
              {total}
            </span>
          </div>
        </div>

        {/* Button Grid - positioned in bottom third */}
        <div style={{
          maxWidth: '1152px',
          margin: '0 auto',
          width: '100%',
          padding: '0 24px',
          marginBottom: '32px',  // Space before progress bars
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            columnGap: '32px',
            rowGap: '48px',
          }}>
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
        </div>

        {/* Progress Bars (slim, no cards) - at very bottom */}
        <div style={{
          maxWidth: '1152px',
          margin: '0 auto',
          width: '100%',
          padding: '0 24px',
          marginBottom: '20px',
        }}>
          <div style={{ marginBottom: '16px' }}>
            <div style={{
              fontSize: 16,
              fontWeight: 600,
              color: 'rgba(0,0,0,0.7)',
              marginBottom: '4px',
            }}>
              Progress to next rank ({rankInfo.current} → {rankInfo.next})
            </div>
            <div style={{
              height: 12,
              borderRadius: 999,
              background: '#e5e7eb',
              overflow: 'hidden',
            }}>
              <div
                style={{
                  height: '100%',
                  borderRadius: 999,
                  background: '#22c55e',
                  width: `${rankInfo.pct}%`,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
          <div
            onMouseEnter={() => onButtonEnter('rabbit')}
            onMouseLeave={onButtonLeave}
            onFocus={() => onButtonEnter('rabbit')}
            onBlur={onButtonLeave}
            tabIndex={0}
            style={{ cursor: 'pointer', marginBottom: '16px' }}
          >
            <div style={{
              fontSize: 16,
              fontWeight: 600,
              color: 'rgba(0,0,0,0.7)',
              marginBottom: '4px',
            }}>
              Rabbit challenge
            </div>
            <div style={{
              height: 12,
              borderRadius: 999,
              background: '#e5e7eb',
              overflow: 'hidden',
            }}>
              <div
                style={{
                  height: '100%',
                  borderRadius: 999,
                  background: '#22c55e',
                  width: `${rabbitPct}%`,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
