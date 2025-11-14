'use client';

import '@/styles/score.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { confettiCelebrate, confettiSprinkle } from '@/lib/confetti';
import { useScore } from '@/hooks/useScore';
import { clearAssociateCaches, readAssociate, readContestEmail, type AssociateCache } from '@/lib/identity';
import { getNextVariant, type SharePlatform } from '@/lib/shareAssets';
import { getNextTarget } from '@/lib/shareTarget';
import { buildShareCaption } from '@/lib/shareCaption';
import { buildShareUrl, buildPlatformShareUrl, hasSocialHandle, platformToHandleField } from '@/lib/shareHelpers';
import SocialHandleModal from './SocialHandleModal';

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
  createdNow?: boolean;
};

export default function ScorePage() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const qp = useSearchParams();
  const router = useRouter();
  const [contestEmail, setContestEmail] = useState<string | null>(null);
  const [associate, setAssociate] = useState<AssociateCache | null>(null);
  const [associateHandles, setAssociateHandles] = useState<{
    x?: string | null;
    instagram?: string | null;
    tiktok?: string | null;
    truth?: string | null;
  } | null>(null);
  const [socialHandleModal, setSocialHandleModal] = useState<{
    isOpen: boolean;
    platform: SharePlatform;
    platformName: string;
    pendingAction?: () => Promise<void>;
  }>({
    isOpen: false,
    platform: 'fb',
    platformName: 'Facebook',
  });
  const [reducedMotion] = useState(
    typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

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
  const [stageText, setStageText] = useState<ReactNode>('');
  const [stageVisible, setStageVisible] = useState(false);
  const [stageSequence, setStageSequence] = useState<'greetings' | 'info' | 'idle' | 'hover' | 'rabbit'>('greetings');
  const [greetingIndex, setGreetingIndex] = useState(0);

  const infoLines = [
    "Everything is up from here—have fun using the site and you'll earn points toward a family vacation and BIG money!",
    'Games, social media, inviting friends—everything you do earns points!',
  ];

  // Button hover captions
  const hoverCaptions: Record<string, ReactNode> = {
    buy: 'You bought the book! +500 pts. After you read it, play trivia and earn +250 more.',
    x: 'Nice one—+100 pts today. You can earn +100 again tomorrow by sharing again.',
    ig: 'Nice one—+100 pts today. You can earn +100 again tomorrow by sharing again.',
    fb: '+100 pts today. Share again tomorrow for another +100.',
    truth: '+100 pts today. Share again tomorrow for another +100.',
    tt: '+100 pts today. Share again tomorrow for another +100.',
    contest: 'Game on! Enter the contest for +250 pts and a shot at the cruise.',
    refer: 'Invite friends: they save $3.90; you earn $2 each. It adds up fast.',
    subscribe: 'Stay in the loop—+50 pts when you join the weekly digest.',
    rabbit: 'Catch the Rabbit and earn +500 points.',
  };

  // success banners
  const sid = qp.get('sid');
  const shared = qp.get('shared');
  const [dismiss, setDismiss] = useState(false);

  const {
    totalPoints,
    rabbitTarget,
    rabbitSeq,
    nextRankThreshold,
    refresh: refreshScore,
    apply: applyScore,
  } = useScore(contestEmail);

  // points fetch
  const [data, setData] = useState<PointsPayload | null>(null);
  const refreshPoints = useCallback(async () => {
    if (!contestEmail) {
      setData({ totalPoints: 0 });
      return;
    }
    try {
      const res = await fetch('/api/points/me', {
        method: 'GET',
        headers: {
          'X-User-Email': contestEmail,
        },
      });
      if (!res.ok) throw new Error('points_fetch_failed');
      const j: any = await res.json();
      setData({
        totalPoints: j.total || 0,
        firstName: j.firstName || null,
        createdNow: j.createdNow ?? true, // Default to true (first-time) if not provided
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
    } catch (err) {
      console.warn('[score] refreshPoints failed', err);
      setData({ totalPoints: 0 });
    }
  }, [contestEmail]);

  useEffect(() => {
    refreshPoints();
  }, [refreshPoints]);

  // Fetch associate handles for social share checks
  useEffect(() => {
    if (!contestEmail) return;
    
    const fetchHandles = async () => {
      try {
        const res = await fetch('/api/associate/status', {
          headers: { 'X-User-Email': contestEmail },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.handles) {
            setAssociateHandles(data.handles);
          }
        }
      } catch (err) {
        console.warn('[score] failed to fetch handles', err);
      }
    };
    
    fetchHandles();
  }, [contestEmail]);

  // Reset greeting when data loads to ensure correct first-time vs returning message
  useEffect(() => {
    if (data !== null && stageSequence === 'greetings') {
      setGreetingIndex(0);
    }
  }, [data, stageSequence]);

  // Save social handle via associate upsert
  const saveSocialHandle = useCallback(
    async (platform: SharePlatform, handle: string) => {
      if (!contestEmail) return;
      
      try {
        // Get current associate data to preserve firstName/lastName
        const statusRes = await fetch('/api/associate/status', {
          headers: { 'X-User-Email': contestEmail },
        });
        if (!statusRes.ok) throw new Error('Failed to fetch associate data');
        
        const statusData = await statusRes.json();
        const handles: Record<string, string | null> = {
          ...(statusData.handles || {}),
        };
        
        // Map platform to handle field
        const handleField = platformToHandleField[platform];
        if (handleField && handleField !== 'facebook') {
          handles[handleField] = handle;
        }
        
        // Update via associate upsert
        const upsertRes = await fetch('/api/associate/upsert', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Email': contestEmail,
          },
          body: JSON.stringify({
            firstName: statusData.firstName || '',
            lastName: statusData.lastName || '',
            email: contestEmail,
            handles: {
              x: handles.x || null,
              instagram: handles.instagram || null,
              tiktok: handles.tiktok || null,
              truth: handles.truth || null,
            },
          }),
        });
        
        if (!upsertRes.ok) throw new Error('Failed to save handle');
        
        // Update local state
        setAssociateHandles(handles as any);
      } catch (err) {
        console.error('[score] save handle error', err);
        throw err;
      }
    },
    [contestEmail]
  );

  const awardShare = useCallback(
    async (action: string, targetVariant?: 'challenge' | 'terminal') => {
      if (!contestEmail) {
        alert('Please enter the contest first so we know who to credit.');
        return false;
      }
      try {
        const body: any = { action, source: 'contest_score' };
        if (targetVariant) {
          body.targetVariant = targetVariant;
        }
        
        const res = await fetch('/api/points/award', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Email': contestEmail,
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          console.warn('[score] award failed', body);
          return false;
        }
        await refreshPoints();
        await refreshScore();
        return true;
      } catch (err) {
        console.error('[score] award error', err);
        return false;
      }
    },
    [contestEmail, refreshPoints, refreshScore],
  );

  const handleChangeAccount = useCallback(() => {
    clearAssociateCaches();
    router.replace('/contest');
  }, [router]);

  // Compute firstName after data is available
  const firstName = useMemo(() => {
    if (associate?.name) {
      const chunk = associate.name.trim().split(' ')[0];
      if (chunk) return chunk;
    }
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('first_name');
      if (stored) return stored;
    }
    return data?.firstName || 'Friend';
  }, [associate?.name, data?.firstName]);

  // Dynamic greeting based on first-time vs returning visitor
  const greetingLines = useMemo(() => {
    if (data?.createdNow === false) {
      // Returning visitor - multi-line motivational message
      return [
        `${firstName} — you're back!`,
        "Now let's go win that vacation for your family.",
        'And make you some serious money!',
      ];
    }
    // First-time visitor - keep existing greeting unchanged
    return [
      `${firstName}—way to go!`,
      'You made it.',
      "You're in a good spot—You can win this.",
    ];
  }, [firstName, data?.createdNow]);

  // Greeting sequence (ONCE, 2.2s per line)
  // Wait for data to load before starting greeting to ensure correct first-time vs returning message
  useEffect(() => {
    if (stageSequence !== 'greetings') return;
    // Don't start greeting until we know if user is first-time or returning
    if (data === null) return;
    
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
  }, [stageSequence, greetingIndex, reducedMotion, greetingLines, data]);

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
    if (stageSequence === 'rabbit') return;
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
    if (stageSequence === 'rabbit') return;
    setHovered(null);
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setStageVisible(false);
      setTimeout(() => {
        if (stageSequence === 'hover') setStageSequence('idle');
      }, 300);
    }, 300);
  };
  // A1: Check for social handle before sharing
  const checkAndPromptHandle = useCallback(
    async (platform: SharePlatform, platformName: string, proceedWithShare: () => Promise<void>) => {
      // Facebook doesn't require a handle
      if (platform === 'fb') {
        await proceedWithShare();
        return;
      }
      
      // Check if handle exists
      if (hasSocialHandle(associateHandles, platform)) {
        await proceedWithShare();
        return;
      }
      
      // Show modal to collect handle
      setSocialHandleModal({
        isOpen: true,
        platform,
        platformName,
        pendingAction: async () => {
          await proceedWithShare();
        },
      });
    },
    [associateHandles]
  );

  const handleShareClick = async (
    platform: 'x' | 'ig' | 'fb' | 'truth' | 'tiktok',
    e: React.MouseEvent<HTMLAnchorElement>
  ) => {
    e.preventDefault();

    const email = contestEmail;
    if (!email) {
      alert('Please enter the contest first so we know who to credit.');
      return;
    }

    // Get referral code
    const referralCode = associate?.code ||
      (typeof document !== 'undefined'
        ? (document.cookie.split('; ').find((r) => r.startsWith('ref='))?.split('=')[1] || '')
        : '') ||
      '';

    if (!referralCode) {
      alert('Unable to get your referral code. Please try again.');
      return;
    }

    const baseUrl =
      (typeof window !== 'undefined' && window.location.origin) ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      '';

    // Map platform names
    const platformNames: Record<SharePlatform, string> = {
      fb: 'Facebook',
      ig: 'Instagram',
      x: 'X',
      tt: 'TikTok',
      truth: 'Truth Social',
    };

    // Normalize platform name (tiktok -> tt)
    const normalizedPlatform: SharePlatform = platform === 'tiktok' ? 'tt' : platform;

    // A3: Get next variant (rotates, never repeats last)
    const variant = getNextVariant(normalizedPlatform);

    // A4: Get next target (50/50 toggle)
    const target = getNextTarget();

    // Build share URL
    const shareUrl = buildShareUrl(normalizedPlatform, variant, referralCode, target, baseUrl);

    // Build caption with firstName if available
    const firstName = data?.firstName || null;
    const caption = buildShareCaption({
      firstName,
      refCode: referralCode,
      shareUrl,
      includeSecretCode: target === 'terminal', // A2: Include secret code for terminal
    });

    // Navigate to share landing page (guided flow)
    const performShare = async () => {
      try {
        // Navigate to share landing page (same window)
        router.push(shareUrl);
      } catch (err) {
        console.error('[share] handler failed', err);
        alert('Failed to open share page. Please try again.');
      }
    };

    // A1: Check handle and proceed
    await checkAndPromptHandle(normalizedPlatform, platformNames[normalizedPlatform], performShare);
  };

  // Handle social handle modal save
  const handleSaveSocialHandle = useCallback(
    async (handle: string) => {
      try {
        await saveSocialHandle(socialHandleModal.platform, handle);
        setSocialHandleModal({ ...socialHandleModal, isOpen: false });
        
        // Resume pending share action
        if (socialHandleModal.pendingAction) {
          await socialHandleModal.pendingAction();
        }
      } catch (err) {
        console.error('[score] save handle failed', err);
        alert('Failed to save handle. Please try again.');
      }
    },
    [socialHandleModal, saveSocialHandle]
  );


  const computedNextBand = nextRankThreshold ?? 500;
  const prevBand = Math.max(0, computedNextBand - 500);
  const bandSize = Math.max(1, computedNextBand - prevBand);
  const rankPct = clamp(0, (totalPoints - prevBand) / bandSize, 1);

  const target = rabbitTarget && rabbitTarget > 0 ? rabbitTarget : totalPoints + 500;
  const rabbitPct = clamp(0, totalPoints / target, 1);

  const rankInfo = useMemo(() => ({
    current: prevBand,
    next: computedNextBand,
    pct: rankPct * 100,
  }), [prevBand, computedNextBand, rankPct]);

  const topFog = Math.min(mist, 0.85);
  const midFog = Math.max(mist - 0.35, 0);
  const wrapClassName = hovered ? 'score-wrap is-hovered' : 'score-wrap';

  const rankMeterRef = useRef<HTMLDivElement | null>(null);
  const rabbitMeterRef = useRef<HTMLDivElement | null>(null);
  const celebratedSeqRef = useRef<number | null>(null);
  const catchingRef = useRef(false);
  const celebrationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => () => {
    if (celebrationTimeoutRef.current) {
      clearTimeout(celebrationTimeoutRef.current);
    }
  }, []);

  const triggerRabbitCelebration = useCallback(() => {
    setStageSequence('rabbit');
    setStageText(
      <span>
        <span style={{ color: '#dc2626', fontWeight: 800 }}>Congratulations, {firstName}!</span>
        <br />
        <span>You caught the rabbit and earned </span>
        <span style={{ color: '#2563eb', fontWeight: 800 }}>+500 pts.</span>
        <br />
        <span>Catch him again for 500 more!</span>
      </span>
    );
    setStageVisible(true);

    if (!reducedMotion && typeof window !== 'undefined') {
      const rankRect = rankMeterRef.current?.getBoundingClientRect();
      const rabbitRect = rabbitMeterRef.current?.getBoundingClientRect();
      if (rankRect && rabbitRect && window.innerWidth > 0 && window.innerHeight > 0) {
        const rankCenterX = rankRect.left + rankRect.width / 2;
        const rabbitCenterX = rabbitRect.left + rabbitRect.width / 2;
        const rankCenterY = rankRect.top + rankRect.height / 2;
        const rabbitCenterY = rabbitRect.top + rabbitRect.height / 2;
        const centerX = ((rankCenterX + rabbitCenterX) / 2) / window.innerWidth;
        const centerY = ((rankCenterY + rabbitCenterY) / 2) / window.innerHeight;
        void confettiCelebrate({ center: { x: centerX, y: centerY } });
      } else {
        void confettiCelebrate();
      }
    }

    const duration = reducedMotion ? 3000 : 6000;
    if (celebrationTimeoutRef.current) clearTimeout(celebrationTimeoutRef.current);
    celebrationTimeoutRef.current = setTimeout(() => {
      setStageVisible(false);
      setTimeout(() => {
        setStageSequence((prev) => (prev === 'rabbit' ? 'idle' : prev));
      }, 400);
      celebrationTimeoutRef.current = null;
    }, duration);
  }, [firstName, reducedMotion]);

  useEffect(() => {
    if (!contestEmail) return;
    if (!rabbitTarget || !rabbitSeq) return;
    if (totalPoints < rabbitTarget) return;
    if (catchingRef.current) return;
    if (celebratedSeqRef.current && celebratedSeqRef.current >= rabbitSeq) return;

    let cancelled = false;
    catchingRef.current = true;
    celebratedSeqRef.current = rabbitSeq;

    (async () => {
      try {
        const res = await fetch('/api/rabbit/catch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Email': contestEmail,
          },
          body: JSON.stringify({ rabbitSeqClient: rabbitSeq }),
        });
        const json = await res.json().catch(() => null);
        if (cancelled || !json) return;
        if (json.caught) {
          celebratedSeqRef.current = json.rabbitSeq ?? rabbitSeq + 1;
          applyScore({
            points: json.points,
            rabbitTarget: json.rabbitTarget,
            rabbitSeq: json.rabbitSeq,
            nextRankThreshold: json.nextRankThreshold,
          });
          triggerRabbitCelebration();
          await refreshScore();
        } else if (json.stale) {
          await refreshScore();
        }
      } catch (err) {
        console.warn('[score] rabbit catch failed', err);
      } finally {
        if (!cancelled) {
          catchingRef.current = false;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contestEmail, rabbitTarget, rabbitSeq, totalPoints, applyScore, refreshScore, triggerRabbitCelebration]);

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
        {contestEmail && (
          <button
            type="button"
            onClick={handleChangeAccount}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              padding: '6px 14px',
              borderRadius: 999,
              border: '1px solid rgba(148, 163, 184, 0.6)',
              background: 'rgba(15, 23, 42, 0.55)',
              color: '#e2e8f0',
              fontSize: 12,
              letterSpacing: '0.04em',
              cursor: 'pointer',
              zIndex: 45,
            }}
          >
            Change account ({contestEmail})
          </button>
        )}
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
        <div className="meter" data-key="rank" ref={rankMeterRef}>
          <div className="label">Rank</div>
          <div className="track">
            <div className="fill" style={{ height: `${Math.round(rankPct * 100)}%` }} />
          </div>
          <div className="value">{prevBand} → {computedNextBand}</div>
        </div>
        <div
          className="meter"
          data-key="rabbit"
          ref={rabbitMeterRef}
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
      
      {/* Social Handle Modal */}
      <SocialHandleModal
        isOpen={socialHandleModal.isOpen}
        platform={socialHandleModal.platform}
        platformName={socialHandleModal.platformName}
        onSave={handleSaveSocialHandle}
        onCancel={() => setSocialHandleModal({ ...socialHandleModal, isOpen: false })}
      />
    </div>
  );
}
