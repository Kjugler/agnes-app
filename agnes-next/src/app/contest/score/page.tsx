/**
 * LAYOUT CONTRACT (do not replace with phone-frame variant):
 * - Score uses Caption Stage + Ship + Mist
 * - Caption stage occupies top third, scales with viewport, runs greetings → info → idle
 * - Buttons use grid auto-fit; no flex-wrap overlap
 * - Ship image is clear with subtle mist that reduces on hover (per mist state)
 */
'use client';

import '../../../styles/score.css';
import '@/styles/fit-guard.css';
import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { confettiCelebrate, confettiSprinkle } from '@/lib/confetti';
import { withParams, buildShareMessage, baseUrl } from '@/lib/share';
import { getAssociate } from '@/lib/profile';
import ShareGuardModal from '@/components/ShareGuardModal';
import type { Associate } from '@/types/contest';

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

function ScorePageContent() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const qp = useSearchParams();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [reducedMotion] = useState(
    typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [associate, setAssociate] = useState<Associate | null>(null);
  const [shareModal, setShareModal] = useState<{ platform: 'facebook' | 'x' | 'instagram' | 'tiktok' | 'truth'; pendingAction: () => void } | null>(null);
  const [previousPage, setPreviousPage] = useState<string>('/contest');

  // Hydration guard - prevent SSR/client mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Determine referral code from localStorage or URL
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const codeFromUrl = qp.get('code') || qp.get('ref');
    const codeFromStorage = localStorage.getItem('ap_code');
    setReferralCode(codeFromUrl || codeFromStorage || null);
  }, [qp]);

  // Track previous page for back navigation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Check if we have a stored previous page
    const stored = localStorage.getItem('score_previous_page');
    if (stored) {
      setPreviousPage(stored);
    } else {
      // Try to determine from referrer or default
      const referrer = document.referrer;
      if (referrer.includes('/the-protocol-challenge')) {
        setPreviousPage('/the-protocol-challenge');
        localStorage.setItem('score_previous_page', '/the-protocol-challenge');
      } else {
        setPreviousPage('/contest');
        localStorage.setItem('score_previous_page', '/contest');
      }
    }
  }, []);

  // Load associate profile
  useEffect(() => {
    getAssociate().then(setAssociate).catch(() => {});
  }, []);

  // Handle post-share return (?shared=platform)
  useEffect(() => {
    const shared = qp.get('shared');
    if (shared) {
      const platform = shared.toLowerCase();
      const platformLabels: Record<string, string> = {
        facebook: 'Facebook',
        x: 'X',
        ig: 'Instagram',
        instagram: 'Instagram',
        tiktok: 'TikTok',
        tt: 'TikTok',
        truth: 'Truth Social',
      };
      const label = platformLabels[platform] || platform;

      // Check if already awarded today
      const today = new Date().toISOString().split('T')[0];
      const key = `ap_shared_${platform}_${today}`;
      const alreadyAwarded = localStorage.getItem(key) === 'true';

      if (!alreadyAwarded) {
        // Award +100 points
        const currentTotal = Number(localStorage.getItem('points_total') || '0');
        localStorage.setItem('points_total', String(currentTotal + 100));
        localStorage.setItem(key, 'true');
      }

      // Show success banner (existing banner logic will handle this)
      // The existing banner code already handles ?shared=... so we just need to ensure points are awarded
    }
  }, [qp]);

  // Helper to check if we have a handle for a platform
  const hasHandle = (platform: 'facebook' | 'x' | 'instagram' | 'tiktok' | 'truth'): boolean => {
    if (!associate?.social) return false;
    const platformMap: Record<string, 'x' | 'instagram' | 'tiktok' | 'truth'> = {
      facebook: 'x', // Facebook doesn't use handles, but we check x
      x: 'x',
      instagram: 'instagram',
      tiktok: 'tiktok',
      truth: 'truth',
    };
    const key = platformMap[platform];
    if (!key) return false;
    return !!(associate.social[key]);
  };

  // mist - much lighter so ship is clearly visible, clears more on hover
  const [mist, setMist] = useState(0.1);
  const [hovered, setHovered] = useState<string | null>(null);
  const [heroHovered, setHeroHovered] = useState(false);
  const mistTarget = useMemo(() => {
    if (typeof window === 'undefined') return 0.1; // SSR fallback
    const v = Number(localStorage.getItem('score_visits') ?? '0') + 1;
    localStorage.setItem('score_visits', String(v));
    // Start much lighter (0.08-0.15 range) so ship is clearly visible
    const base = clamp(0.08, 0.15 - (v - 1) * 0.01, 0.15);
    return base;
  }, []);
  useEffect(() => setMist(mistTarget), [mistTarget]);
  useEffect(() => {
    // On hover, reduce mist significantly so ship becomes very clear
    const spot = heroHovered && !hovered ? Math.max(0.02, mistTarget - 0.1) : mistTarget;
    const id = setTimeout(() => setMist(spot), 150);
    return () => clearTimeout(id);
  }, [heroHovered, hovered, mistTarget]);

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
    setHeroHovered(false); // Clear hero hover when button is hovered
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

    // Map platform names
    const platformMap: Record<string, 'facebook' | 'x' | 'instagram' | 'tiktok' | 'truth'> = {
      fb: 'facebook',
      x: 'x',
      ig: 'instagram',
      tiktok: 'tiktok',
      truth: 'truth',
    };
    const mappedPlatform = platformMap[platform] || platform as any;

    // Check if we need to prompt for handle
    if (!hasHandle(mappedPlatform)) {
      setShareModal({
        platform: mappedPlatform,
        pendingAction: () => {
          // Continue with share after handle is saved
          executeShare(platform, e);
        },
      });
      return;
    }

    // Proceed with share
    executeShare(platform, e);
  };

  const executeShare = async (
    platform: 'x' | 'ig' | 'fb' | 'truth' | 'tiktok',
    e: React.MouseEvent<HTMLAnchorElement>
  ) => {

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

    // Get referral code from state (localStorage or URL)
    const code = referralCode ||
      (typeof window !== 'undefined' ? localStorage.getItem('ap_code') : null) ||
      (typeof document !== 'undefined'
        ? (document.cookie.split('; ').find((r) => r.startsWith('ref='))?.split('=')[1] || '')
        : '');

    const ORIGIN =
      (typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL) ||
      'http://localhost:3002';

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

        // Build caption with landing URL and referral code
        const landingUrl = withParams(`${ORIGIN}/s/fb`, {
          v: String((captionIdx % 3) + 1),
          utm_source: 'instagram',
          utm_medium: 'social',
          utm_campaign: 'ap_referral',
          ref: code || '',
          code: code || '',
        });
        const caption = buildShareMessage({ code: code || undefined });

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

      // Build caption with landing URL and referral code
      const landingUrl = withParams(`${ORIGIN}/s/fb`, {
        v: String((captionIdx % 3) + 1),
        utm_source: 'tiktok',
        utm_medium: 'social',
        utm_campaign: 'ap_referral',
        ref: code || '',
        code: code || '',
      });
      const caption = buildShareMessage({ code: code || undefined });

        // Copy caption
        try {
          await navigator.clipboard.writeText(caption);
        } catch {}

        // Open helper page in same tab
        window.location.href = `${ORIGIN}/s/tt?i=${iParam}&return=${encodeURIComponent(`${baseUrl()}/contest/score?shared=tiktok`)}`;

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
      
        // Build landing URL with video parameter and referral code
        const landing = withParams(`${ORIGIN}/s/fb`, {
          v: String(v),
          utm_source: 'facebook',
          utm_medium: 'social',
          utm_campaign: 'ap_referral',
          ref: code || '',
          code: code || '',
        });
        
        // Build caption with landing URL
        const caption = buildShareMessage({ code: code || undefined });

      // Copy caption to clipboard
      try {
        await navigator.clipboard.writeText(caption);
      } catch {}

      // Open Facebook Share Dialog in same tab
      const returnUrl = `${baseUrl()}/contest/score?shared=facebook`;
      const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(landing)}&redirect_uri=${encodeURIComponent(returnUrl)}`;
      window.location.href = fbUrl;

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

      // Build landing URL using /s/fb (so OG preview works) with referral code
      const vidIdx = nextIndex('truth_vid_idx', 3); // 0..2 → fb1, fb2, fb3
      const v = vidIdx + 1;
      const landing = withParams(`${ORIGIN}/s/fb`, {
        v: String(v),
        utm_source: 'truth',
        utm_medium: 'social',
        utm_campaign: 'ap_referral',
        ref: code || '',
        code: code || '',
      });

      // Build caption with referral code
      const caption = buildShareMessage({ code: code || undefined });

      // Copy caption to clipboard
      try {
        await navigator.clipboard.writeText(caption);
      } catch {}

      // Open Truth Social composer in same tab
      const returnUrl = `${baseUrl()}/contest/score?shared=truth`;
      const truthUrl = `https://truthsocial.com/compose?text=${encodeURIComponent(caption)}&redirect_uri=${encodeURIComponent(returnUrl)}`;
      window.location.href = truthUrl;

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

      // Build landing URL using /s/fb (so OG preview works) with referral code
      const vidIdx = nextIndex('x_vid_idx', 3); // 0..2 → fb1, fb2, fb3
      const v = vidIdx + 1;
      const landing = withParams(`${ORIGIN}/s/fb`, {
        v: String(v),
        utm_source: 'twitter',
        utm_medium: 'social',
        utm_campaign: 'ap_referral',
        ref: code || '',
        code: code || '',
      });

      // Build caption with referral code
      const caption = buildShareMessage({ code: code || undefined });

      // Copy caption to clipboard
      try {
        await navigator.clipboard.writeText(caption);
      } catch {}

      // Open X composer with prefilled text and URL in same tab
      const returnUrl = `${baseUrl()}/contest/score?shared=x`;
      const xUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(caption)}&redirect_uri=${encodeURIComponent(returnUrl)}`;
      window.location.href = xUrl;

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
    className,
    dataKey,
  }: {
    label: string;
    sub?: string;
    href: string;
    hoverKey: string;
    showTick?: boolean;
    colorBase: string;
    colorHover: string;
    onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
    className?: string;
    dataKey?: string;
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
        className={className || "btn-card"}
        data-key={dataKey || hoverKey}
        style={{
          background: `linear-gradient(135deg, ${colorBase}, ${colorHover})`,
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

  // Prevent hydration mismatch - show loading state until mounted
  if (!mounted) {
    return (
      <div className="score-wrap" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ color: '#fff', fontSize: '18px' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="score-wrap" data-has-test-banner>
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

      {/* SUCCESS BANNERS */}
      {!dismiss && (sid || shared) && (
        <div style={{
          position: 'fixed',
          top: 'env(safe-area-inset-top, 0)',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          marginTop: '1rem',
          maxWidth: '90vw',
        }}>
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

      {/* CAPTION STAGE - top third */}
      <section className={`caption-stage ${stageVisible ? 'show' : ''}`}>
        {stageText && <p>{stageText}</p>}
        {/* Go Back button - always visible, top-left of caption stage */}
        <button
          type="button"
          onClick={() => router.push('/contest')}
          style={{
            position: 'absolute',
            top: 'clamp(20px, 4vh, 40px)',
            left: 'clamp(20px, 4vw, 40px)',
            borderRadius: 12,
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            color: '#fff',
            padding: '14px 28px',
            fontSize: 'clamp(16px, 1.8vw, 18px)',
            fontWeight: 700,
            border: '2px solid rgba(255, 255, 255, 0.3)',
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(99, 102, 241, 0.6), 0 0 20px rgba(99, 102, 241, 0.4)',
            transition: 'all 0.2s ease',
            whiteSpace: 'nowrap',
            zIndex: 31,
            backdropFilter: 'blur(4px)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(99, 102, 241, 0.8), 0 0 30px rgba(99, 102, 241, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(99, 102, 241, 0.6), 0 0 20px rgba(99, 102, 241, 0.4)';
          }}
        >
          ← Go Back
        </button>
      </section>

      {/* Vertical Progress Bars Sidebar */}
      <div className="progress-sidebar">
        <div className="progress-bar-vertical">
          <div className="label">Rank Progress</div>
          <div className="bar-container">
            <div
              className="bar-fill bg-green-600"
              style={{ height: `${rankInfo.pct}%` }}
            />
          </div>
          <div style={{ fontSize: '10px', textAlign: 'center', marginTop: '8px', color: '#6b7280' }}>
            {rankInfo.current} → {rankInfo.next}
          </div>
        </div>
        <div
          className="progress-bar-vertical"
          onMouseEnter={() => onButtonEnter('rabbit')}
          onMouseLeave={onButtonLeave}
          onFocus={() => onButtonEnter('rabbit')}
          onBlur={onButtonLeave}
          tabIndex={0}
          style={{ cursor: 'pointer' }}
        >
          <div className="label">Rabbit</div>
          <div className="bar-container">
            <div
              className="bar-fill bg-gray-800"
              style={{ height: `${rabbitPct}%` }}
            />
          </div>
          <div style={{ fontSize: '10px', textAlign: 'center', marginTop: '8px', color: '#6b7280' }}>
            {Math.round(rabbitPct)}%
          </div>
        </div>
      </div>

      {/* SHIP AREA - bottom two-thirds with buttons */}
      <section
        className="ship-area"
        style={{ '--mist': String(mist) } as React.CSSProperties}
        onMouseEnter={() => setHeroHovered(true)}
        onMouseLeave={() => setHeroHovered(false)}
      >
        {/* Content wrapper */}
        <div className="relative z-10 max-w-6xl mx-auto px-4" style={{ paddingTop: 'clamp(15vh, 25vh, 35vh)', paddingBottom: '1rem', paddingRight: '140px', flex: '1', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>

          {/* Button Grid - responsive, well-spaced, scales with viewport */}
          <div
            className="buttons-grid"
            onMouseLeave={onButtonLeave}
          >
            {/* Row 1 buttons */}
            <ActionButton
              label="Buy the Book"
              sub="500 pts"
              href="/buy"
              hoverKey="buy"
              showTick={!!data?.earned?.purchase_book}
              colorBase="#059669"
              colorHover="#047857"
              className="btn-card btn-buy"
              dataKey="buy"
            />
            <ActionButton
              label="Share to X"
              sub="100 pts"
              href="#"
              hoverKey="x"
              onClick={(e: any) => handleShareClick('x', e)}
              colorBase="#000000"
              colorHover="#262626"
              className="btn-card btn-x"
              dataKey="x"
            />
            <ActionButton
              label="Share to Instagram"
              sub="100 pts"
              href="/share/ig?source=score"
              hoverKey="ig"
              onClick={(e: any) => handleShareClick('ig', e)}
              colorBase="#c026d3"
              colorHover="#a21caf"
              className="btn-card btn-ig"
              dataKey="ig"
            />
            <ActionButton
              label="Share to Facebook"
              sub="100 pts"
              href="#"
              hoverKey="fb"
              onClick={(e: any) => handleShareClick('fb', e)}
              colorBase="#1877f2"
              colorHover="#1565c0"
              className="btn-card btn-fb"
              dataKey="fb"
            />
            <ActionButton
              label="Share to Truth"
              sub="100 pts"
              href="#"
              hoverKey="truth"
              onClick={(e: any) => handleShareClick('truth', e)}
              colorBase="#6366f1"
              colorHover="#4f46e5"
              className="btn-card btn-truth"
              dataKey="truth"
            />
            {/* Row 2 buttons */}
            <ActionButton
              label="Join the Contest"
              sub="250 pts"
              href="/contest"
              hoverKey="contest"
              colorBase="#4f46e5"
              colorHover="#4338ca"
              className="btn-card btn-join"
              dataKey="contest"
            />
            <ActionButton
              label="Refer a Friend"
              sub="$2 each"
              href="/contest/referral"
              hoverKey="refer"
              colorBase="#ea580c"
              colorHover="#c2410c"
              className="btn-card btn-refer"
              dataKey="refer"
            />
            <ActionButton
              label="Weekly Digest Opt‑in"
              sub="50 pts"
              href="/subscribe"
              hoverKey="subscribe"
              colorBase="#e11d48"
              colorHover="#be123c"
              className="btn-card btn-digest"
              dataKey="subscribe"
            />
            <ActionButton
              label="Share to TikTok"
              sub="100 pts"
              href="#"
              hoverKey="tt"
              onClick={(e: any) => handleShareClick('tiktok', e)}
              colorBase="#1a1a1a"
              colorHover="#2d2d2d"
              className="btn-card btn-tt"
              dataKey="tt"
            />
            
            {/* RIGHT-SIDE PILL STACK — occupies the last column of row 2 */}
            <div className="pill-stack" role="group" aria-label="Status">
              {referralCode && (
                <div 
                  className="pill pill-code" 
                  aria-label="Your Code"
                  onClick={() => {
                    navigator.clipboard.writeText(referralCode).then(() => {
                      alert(`Code ${referralCode} copied to clipboard!`);
                    }).catch(() => {});
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <span className="code">{referralCode}</span>
                  <em>(15% off)</em>
                </div>
              )}
              <div 
                className="pill pill-total total-points-pill" 
                aria-label="Total Points"
              >
                <strong>Total</strong>
                <span>{total} pts</span>
              </div>
            </div>
          </div>
          
          {/* UX Copy */}
          <p className="mt-6 text-xs text-gray-400 text-center">
            You'll be asked to log in to the platform if you aren't already.
          </p>
        </div>
      </section>

      {/* Share Guard Modal */}
      {shareModal && (
        <ShareGuardModal
          platform={shareModal.platform}
          onDone={() => {
            // Reload associate and continue with share
            getAssociate().then((a) => {
              setAssociate(a);
              shareModal.pendingAction();
            });
            setShareModal(null);
          }}
          onCancel={() => setShareModal(null)}
        />
      )}
    </div>
  );
}

export default function ScorePage() {
  return (
    <Suspense fallback={
      <div className="score-wrap" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ color: '#fff', fontSize: '18px' }}>Loading...</div>
      </div>
    }>
      <ScorePageContent />
    </Suspense>
  );
}
