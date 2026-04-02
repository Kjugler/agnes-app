'use client';

import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import CheckoutWiring from './CheckoutWiring'; // ← invisible helper that wires the Buy button
import CurrentScoreButton from './CurrentScoreButton';
import { BuyBookButton } from '@/components/BuyBookButton';
import { ContestEntryForm } from '@/components/ContestEntryForm';
import HelpButton from '@/components/HelpButton';
import {
  clearAssociateCaches,
  readAssociate,
  readContestEmail,
  writeAssociate,
  writeContestEmail,
  clearIdentityStorage,
  type AssociateCache,
} from '@/lib/identity';
import RequestAccessModal from '@/components/auth/RequestAccessModal';
import BetaContestRules from '@/components/BetaContestRules';
import { extractDailyContestRibbonLine, type SignalRibbonEvent } from '@/lib/signalRibbonFeed';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

const BANNER_MOTIVATIONAL = [
  'Join the game. It takes less than 30 seconds.',
  'Solve the mystery. Earn points. Climb the leaderboard.',
  'Top players qualify for the 6-Day, 7-Night Family Vacation drawing.',
  'Every signal earns points. Every point moves you closer.',
  "You're already here. Join the game.",
  "It's fun. Everyone is doing it.",
];

export default function ContestClient() {
  const qp = useSearchParams();
  const router = useRouter();
  
  // Detect "just did something that earns points" signals:
  // - return from Stripe: ?session_id=...
  // - explicit flag: ?justPurchased=1
  // IMPORTANT: Declare these IMMEDIATELY after useSearchParams() to avoid TDZ errors
  // These must be declared before ANY other hooks (useState, useEffect, useMemo, useCallback) that reference them
  const sessionId = qp.get('session_id');
  const justPurchased = qp.get('justPurchased') === '1';
  
  const [current, setCurrent] = useState(0);
  const [tapsyText, setTapsyText] = useState('Tap here to read a sample chapter!');
  const [showScoreButton, setShowScoreButton] = useState(false);
  const [contestEmail, setContestEmail] = useState<string | null>(null);
  const [associate, setAssociate] = useState<AssociateCache | null>(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [hasJoinedContest, setHasJoinedContest] = useState(false);
  const [profileFirstName, setProfileFirstName] = useState<string | null>(null);
  /** Start true so CTA shows "Checking..." until first status resolve (avoids wrong "Enter" flash). */
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusLoaded, setStatusLoaded] = useState(false);
  /** Last principal email we successfully applied from GET /api/associate/status — skips duplicate fetch when setContestEmail syncs the same value. */
  const associateStatusForEmailRef = useRef<string | null>(null);
  const [showEntryFormForCheckout, setShowEntryFormForCheckout] = useState(false);
  const [showIdentityBanner, setShowIdentityBanner] = useState(false);
  const [showYouTubeOverlay, setShowYouTubeOverlay] = useState(true);
  const [showRequestAccessModal, setShowRequestAccessModal] = useState(false);
  const [liveStats, setLiveStats] = useState<{
    playersExploring: number;
    currentLeaderName: string | null;
    currentLeaderPoints: number;
    friendsSavedCents: number;
    associateRewardsCents: number;
    booksClaimed: number;
  } | null>(null);
  const [liveStatsHighlight, setLiveStatsHighlight] = useState<Set<string>>(new Set());
  const [bannerIndex, setBannerIndex] = useState(0);
  /** Same source as Signal Room / Protocol ribbons: GET /api/signal/events (daily summary prepended server-side). */
  const [dailyContestRibbonLine, setDailyContestRibbonLine] = useState<string | null>(null);
  const [showTerminalUnlockPanel, setShowTerminalUnlockPanel] = useState(false);
  const [terminalDiscoveryBannerActive, setTerminalDiscoveryBannerActive] = useState(false);
  const [terminalDiscoveryJustAwarded, setTerminalDiscoveryJustAwarded] = useState<boolean | null>(null);
  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  // ---- EARLY DERIVED VALUES (NO useMemo/useEffect/useCallback above this block) ----
  // All query-param-derived flags and computed booleans must be declared here
  // to avoid Temporal Dead Zone (TDZ) errors when referenced in useMemo/useEffect/useCallback
  
  // Query param derived values (already declared above, but keeping for clarity)
  // const sessionId = qp.get('session_id');
  // const justPurchased = qp.get('justPurchased') === '1';
  
  // Additional query params that might be used
  const referralCode = qp.get('ref') ?? '';
  const embed = qp.get('embed') === '1';
  
  // Computed booleans derived from state (must be declared before useMemo/useEffect/useCallback)
  // These are safe to compute here because they're simple boolean expressions
  // Default to false until state is loaded. contestJoined from API is authoritative; contestEmail may lag on first load.
  const userHasJoinedContest = statusLoaded && hasJoinedContest;
  const hasAssociate = statusLoaded && hasProfile && Boolean(contestEmail);
  
  // Additional computed flags (if any)
  // const isReturning = Boolean(associate?.id);
  // const hasLedger = Boolean(associate?.code);

  // ---- MEMOS / EFFECTS / CALLBACKS (all hooks that use the above values go here) ----
  
  // SPEC 3: Terminal discovery - when v=terminal, award bonus and show unlock panel
  useEffect(() => {
    const v = qp.get('v') || qp.get('variant');
    if (v !== 'terminal') return;

    setShowTerminalUnlockPanel(true);

    // Mark terminal discovery complete so returning users get protocol/contest by default (not forced back to terminal)
    try {
      document.cookie = 'terminal_discovery_complete=1; path=/; max-age=' + (60 * 60 * 24 * 365) + '; SameSite=Lax';
    } catch {
      /* ignore */
    }

    fetch('/api/contest/terminal-discovery', {
      method: 'POST',
      credentials: 'include',
    })
      .then((res) => res.json())
      .then((data) => {
        setTerminalDiscoveryJustAwarded(data?.awarded ?? false);
        if (data?.awarded) {
          setTerminalDiscoveryBannerActive(true);
          setTimeout(() => setTerminalDiscoveryBannerActive(false), 2500);
          window.dispatchEvent(new CustomEvent('contest:points-updated'));
        }
      })
      .catch(() => {});
  }, [qp]);

  // Handle fresh=1 param: clear identity storage before rendering
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const params = new URLSearchParams(window.location.search);
    if (params.get('fresh') === '1') {
      console.log('[contest] fresh=1 detected, clearing identity storage');
      clearIdentityStorage();
      associateStatusForEmailRef.current = null;

      // Clear state to ensure clean start
      setContestEmail(null);
      setAssociate(null);
      setShowIdentityBanner(false);
      
      // DO NOT force entry form - let user see video and buttons naturally
      // They can click "Enter the Contest" when ready
      
      // Remove fresh=1 from URL so refresh doesn't keep nuking state
      params.delete('fresh');
      const newQs = params.toString();
      const newUrl = `${window.location.pathname}${newQs ? `?${newQs}` : ''}`;
      window.history.replaceState({}, '', newUrl);
      return; // Don't show identity banner if fresh=1 was used
    }
    
    // No longer showing identity banner - proceed directly with greeting
  }, [qp]);

  // Handle email query param from IBM Terminal redirect - PRIORITY: set immediately
  // Use both useSearchParams() AND direct URL reading for reliability
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Try useSearchParams first (preferred)
    let emailFromQuery = qp.get('email');
    
    // Fallback: read directly from URL if useSearchParams isn't ready yet
    if (!emailFromQuery) {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        emailFromQuery = urlParams.get('email');
      } catch (err) {
        console.warn('[contest] Failed to parse URL search params', err);
      }
    }
    
    if (emailFromQuery) {
      const normalizedEmail = emailFromQuery.trim().toLowerCase();
      console.log('[contest] Found email in query param, setting immediately:', normalizedEmail);
      
      // Set email IMMEDIATELY (optimistic update) so UI updates right away - this prevents "No contest email detected"
      writeContestEmail(normalizedEmail);
      setContestEmail(normalizedEmail);
      
      // Remove query param from URL immediately (clean URL) - don't wait for API
      try {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('email');
        window.history.replaceState({}, '', newUrl.toString());
      } catch (err) {
        console.warn('[contest] Failed to clean URL', err);
      }
      
      // Call login API to set cookie and create/load user (non-blocking, fire-and-forget)
      // Skip heavy attribution for performance
      // Don't await or block on this - let it happen in background
      fetch('/api/contest/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, skipAttribution: true }),
        credentials: 'include',
      })
        .then((res) => {
          if (!res.ok) {
            console.error('[contest] Login API returned non-OK status:', res.status, res.statusText);
            return res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
          }
          return res.json();
        })
        .then((data) => {
          if (data?.ok) {
            console.log('[contest] Login successful, cookie set');
            // Sync email from cookie (which is now set) to ensure consistency
            const email = readContestEmail();
            if (email) {
              setContestEmail(email);
            }
          } else {
            console.error('[contest] Login failed', data);
            // Keep the email set even if login API fails (user can still proceed)
          }
        })
        .catch((err) => {
          console.error('[contest] Login error', err);
          // Keep the email set even if login API fails (user can still proceed)
        });
    }
  }, [qp]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Only sync if we don't already have an email set (from query param handler above)
    // This prevents race conditions and unnecessary re-renders
    if (contestEmail) {
      // Email already set from query param, just sync associate
      const stored = readAssociate();
      if (stored && stored.email !== contestEmail) {
        // Email mismatch - clear associate cache but keep contest email
        clearAssociateCaches({ keepContestEmail: true });
        setAssociate(null);
      } else {
        setAssociate(stored);
      }
      return;
    }
    
    // Initial sync - read email from cookie/storage (only if not already set from query param)
    const sync = () => {
      let email = readContestEmail(); // This now reads from cookie first
      
      // Fallback: if no email in storage, check query string (safety net)
      // Use both useSearchParams() AND direct URL reading for reliability
      if (!email) {
        let emailFromQuery = qp.get('email');
        
        // Fallback: read directly from URL if useSearchParams isn't ready yet
        if (!emailFromQuery) {
          try {
            const urlParams = new URLSearchParams(window.location.search);
            emailFromQuery = urlParams.get('email');
          } catch (err) {
            console.warn('[contest] Sync fallback: Failed to parse URL search params', err);
          }
        }
        
        if (emailFromQuery) {
          const normalizedEmail = emailFromQuery.trim().toLowerCase();
          console.log('[contest] Sync fallback: Found email in query string, storing:', normalizedEmail);
          writeContestEmail(normalizedEmail);
          email = normalizedEmail;
          setContestEmail(email);
          
          // Call login API to set cookie (non-blocking)
          // Skip heavy attribution for performance
          fetch('/api/contest/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: normalizedEmail, skipAttribution: true }),
            credentials: 'include',
          })
            .then((res) => res.json())
            .then((data) => {
              if (data?.ok) {
                console.log('[contest] Sync fallback: Email stored and cookie set');
              } else {
                console.warn('[contest] Sync fallback: Login API returned error:', data);
              }
            })
            .catch((err) => {
              console.warn('[contest] Sync fallback: Error setting cookie:', err);
            });
          return; // Exit early since we set email above
        }
      }
      
      const stored = readAssociate();
      
      console.log('[contest] Sync called', { email, hasStored: !!stored, storedEmail: stored?.email });
      
      if (stored && email && stored.email !== email) {
        // Email mismatch - clear associate cache but keep contest email
        clearAssociateCaches({ keepContestEmail: true });
        setAssociate(null);
        setContestEmail(email);
        return;
      }
      if (stored && !email) {
        // No email but has stored associate - clear everything
        clearAssociateCaches();
        setAssociate(null);
        setContestEmail(null);
        return;
      }
      // Set email and associate
      if (email) {
        setContestEmail(email);
      }
      setAssociate(stored);
    };
    
    // Sync immediately (but only once, not multiple times)
    sync();
    
    // Listen for storage changes (localStorage) - but only if email not already set
    const handleStorageChange = () => {
      if (!contestEmail) {
        sync();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [qp, contestEmail]); // Include contestEmail to prevent unnecessary syncs

  useEffect(() => {
    let cancelled = false;
    const loadStatus = async () => {
      // Fetch immediately on mount – API uses cookies; no need to wait for contestEmail state.
      // This ensures "already entered" state is resolved on first load, before sync effect sets contestEmail.
      if (
        contestEmail &&
        associateStatusForEmailRef.current &&
        associateStatusForEmailRef.current === contestEmail
      ) {
        // Status already applied for this identity; avoid a second full reload when
        // setContestEmail(prev => prev || data.email) fires after the first successful response.
        return;
      }

      setStatusLoading(true);
      setStatusLoaded(false);

      try {
        // Add timeout to prevent hanging - 5 second max wait
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const res = await fetch('/api/associate/status', {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
          credentials: 'include',
        });
        clearTimeout(timeoutId);
        
        if (!res.ok) {
          throw new Error(`status_failed_${res.status}`);
        }
        const data = await res.json();
        if (cancelled) return;

        // D: Self-heal - if not authenticated OR missing principal → show RequestAccessModal
        if (!data?.ok || !data?.id || !data?.email) {
          console.log('[contest] Not authenticated or missing principal - showing RequestAccessModal', {
            ok: data?.ok,
            id: data?.id,
            email: data?.email,
          });
          associateStatusForEmailRef.current = null;
          setShowRequestAccessModal(true);
          setStatusLoading(false);
          setStatusLoaded(true);
          return;
        }

        associateStatusForEmailRef.current = data.email;

        // R4: Use contestJoined from ledger (single source of truth)
        // Prefer contestJoined field, fallback to hasJoinedContest for backward compatibility
        const nextHasProfile = Boolean(data?.hasProfile);
        const nextHasJoinedContest = Boolean(data?.contestJoined ?? data?.hasJoinedContest);
        setHasProfile(nextHasProfile);
        setHasJoinedContest(nextHasJoinedContest);
        setProfileFirstName(data?.firstName || null);

        // Sync contestEmail from API when we have it but state may not be set yet (first-load race)
        if (data?.email) {
          setContestEmail((prev) => prev || data.email);
        }

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
      } catch (err: any) {
        console.warn('[contest] status load failed', err);
        associateStatusForEmailRef.current = null;
        // Don't fail silently - if it's a timeout or network error, mark as loaded anyway
        // so UI doesn't hang waiting
        if (err?.name === 'AbortError') {
          console.warn('[contest] Status load timed out after 5s, continuing anyway');
        }
        if (!cancelled) {
          setHasProfile(false);
          setHasJoinedContest(false);
          setProfileFirstName(null);
          // Keep existing associate if we have one (don't clear on error)
          // Only clear if we don't have one already
          const existingAssociate = readAssociate();
          if (!existingAssociate) {
            setAssociate(null);
          }
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

  // Live stats for Rock Concert Mode (read-only)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/contest/live-stats', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data?.ok) return;
        setLiveStats({
          playersExploring: data.playersExploring ?? 0,
          currentLeaderName: data.currentLeaderName ?? null,
          currentLeaderPoints: data.currentLeaderPoints ?? 0,
          friendsSavedCents: data.friendsSavedCents ?? 0,
          associateRewardsCents: data.associateRewardsCents ?? 0,
          booksClaimed: data.booksClaimed ?? 0,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Ribbon parity with Signal Room: same merged SignalEvent feed (includes daily contest line when present).
  useEffect(() => {
    let cancelled = false;
    fetch('/api/signal/events', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.ok || !Array.isArray(d.events)) return;
        const line = extractDailyContestRibbonLine(d.events as SignalRibbonEvent[]);
        setDailyContestRibbonLine(line);
      })
      .catch(() => {});
    const t = setInterval(() => {
      fetch('/api/signal/events', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => {
          if (!d?.ok || !Array.isArray(d.events)) return;
          setDailyContestRibbonLine(extractDailyContestRibbonLine(d.events as SignalRibbonEvent[]));
        })
        .catch(() => {});
    }, 60000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Poll live stats every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/api/contest/live-stats', { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => {
          if (!data?.ok) return;
          setLiveStats((prev) => {
            if (!prev) return {
              playersExploring: data.playersExploring ?? 0,
              currentLeaderName: data.currentLeaderName ?? null,
              currentLeaderPoints: data.currentLeaderPoints ?? 0,
              friendsSavedCents: data.friendsSavedCents ?? 0,
              associateRewardsCents: data.associateRewardsCents ?? 0,
              booksClaimed: data.booksClaimed ?? 0,
            };
            const next = {
              playersExploring: data.playersExploring ?? 0,
              currentLeaderName: data.currentLeaderName ?? null,
              currentLeaderPoints: data.currentLeaderPoints ?? 0,
              friendsSavedCents: data.friendsSavedCents ?? 0,
              associateRewardsCents: data.associateRewardsCents ?? 0,
              booksClaimed: data.booksClaimed ?? 0,
            };
            const toHighlight: string[] = [];
            if (prev.playersExploring === 0 && next.playersExploring > 0) toHighlight.push('playersExploring');
            if (prev.currentLeaderPoints === 0 && next.currentLeaderPoints > 0) toHighlight.push('currentLeaderPoints');
            if (prev.friendsSavedCents === 0 && next.friendsSavedCents > 0) toHighlight.push('friendsSavedCents');
            if (prev.associateRewardsCents === 0 && next.associateRewardsCents > 0) toHighlight.push('associateRewardsCents');
            if (prev.booksClaimed === 0 && next.booksClaimed > 0) toHighlight.push('booksClaimed');
            if (toHighlight.length > 0) {
              setLiveStatsHighlight((p) => new Set([...p, ...toHighlight]));
              setTimeout(() => {
                setLiveStatsHighlight((p) => {
                  const n = new Set(p);
                  toHighlight.forEach((k) => n.delete(k));
                  return n;
                });
              }, 600);
            }
            return next;
          });
        })
        .catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // R6: Listen for contest:points-updated event to refresh join status immediately
  useEffect(() => {
    const handlePointsUpdated = () => {
      console.log('[contest] Points updated event received - refreshing status');
      // Re-fetch associate/status to get updated contestJoined
      if (contestEmail) {
        setStatusLoading(true);
        fetch('/api/associate/status', {
          method: 'GET',
          cache: 'no-store',
        })
          .then((res) => res.json())
          .then((data) => {
            const nextHasJoinedContest = Boolean(data?.contestJoined ?? data?.hasJoinedContest);
            setHasJoinedContest(nextHasJoinedContest);
            setStatusLoaded(true);
            setStatusLoading(false);
          })
          .catch((err) => {
            console.warn('[contest] Failed to refresh status after points update', err);
            setStatusLoading(false);
          });
      }
    };

    window.addEventListener('contest:points-updated', handlePointsUpdated);
    return () => {
      window.removeEventListener('contest:points-updated', handlePointsUpdated);
    };
  }, [contestEmail]);

  // Fast path: verify-session returns contestJoined when Purchase exists (no cookies needed)
  useEffect(() => {
    if (!sessionId || !justPurchased) return;
    let cancelled = false;
    fetch(`/api/checkout/verify-session?session_id=${encodeURIComponent(sessionId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.ok && data?.contestJoined === true) {
          setHasJoinedContest(true);
        }
      })
      .catch((err) => { if (!cancelled) console.warn('[contest] verify-session fast path failed', err); });
    return () => { cancelled = true; };
  }, [sessionId, justPurchased]);

  // Part B: Refresh loop - prefer verify-session when sessionId present (faster than associate/status)
  useEffect(() => {
    if ((!justPurchased && !sessionId) || !contestEmail) return;

    let cancelled = false;
    const delays = [0, 800, 1800]; // Fewer attempts: 0ms, 800ms, 1.8s
    const timers: NodeJS.Timeout[] = [];

    const checkContestReady = async (): Promise<boolean> => {
      if (sessionId) {
        try {
          const res = await fetch(`/api/checkout/verify-session?session_id=${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
          const data = await res.json();
          if (data?.ok && data?.contestJoined === true) {
            setHasJoinedContest(true);
            setStatusLoaded(true);
            setStatusLoading(false);
            return true;
          }
        } catch (err) {
          console.warn('[contest] verify-session check failed', err);
        }
      }
      try {
        const res = await fetch('/api/associate/status', { method: 'GET', cache: 'no-store', credentials: 'include' });
        if (!res.ok) return false;
        const data = await res.json();
        const next = Boolean(data?.contestJoined ?? data?.hasJoinedContest);
        setHasJoinedContest(next);
        setStatusLoaded(true);
        setStatusLoading(false);
        return next;
      } catch (err) {
        console.warn('[contest] associate/status check failed', err);
        return false;
      }
    };

    const runRefreshLoop = async () => {
      for (let i = 0; i < delays.length; i++) {
        if (cancelled) return;
        if (i > 0) {
          await new Promise<void>((r) => { timers.push(setTimeout(r, delays[i] - delays[i - 1])); });
        }
        if (cancelled) return;
        const isJoined = await checkContestReady();
        if (isJoined) break;
      }
      if (!cancelled) {
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('justPurchased');
          url.searchParams.delete('session_id');
          window.history.replaceState({}, '', url.toString());
        } catch (err) {
          console.warn('[contest] Failed to clean up query params', err);
        }
      }
    };

    runRefreshLoop();
    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
    };
  }, [justPurchased, sessionId, contestEmail]);

  // Refresh status when page becomes visible (fallback for non-purchase scenarios)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && contestEmail && statusLoaded && !justPurchased && !sessionId) {
        console.log('[contest] Page became visible - refreshing status');
        // Re-fetch associate/status to get updated contestJoined
        setStatusLoading(true);
        fetch('/api/associate/status', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'include',
        })
          .then((res) => res.json())
          .then((data) => {
            const nextHasJoinedContest = Boolean(data?.contestJoined ?? data?.hasJoinedContest);
            setHasJoinedContest(nextHasJoinedContest);
            setStatusLoaded(true);
            setStatusLoading(false);
          })
          .catch((err) => {
            console.warn('[contest] Failed to refresh status on visibility change', err);
            setStatusLoading(false);
          });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [contestEmail, statusLoaded, justPurchased, sessionId]);

  // Detect “just did something that earns points” signals:
  // - return from Stripe: ?session_id=...
  // - explicit flag: ?justPurchased=1
  // YouTube IFrame API setup for video looping
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Load YouTube IFrame API script
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    const initializePlayer = () => {
      if (!window.YT || !window.YT.Player) {
        console.log('[Contest Video] YouTube API not ready yet');
        return;
      }
      
      const containerId = 'contest-video-player';
      const container = document.getElementById(containerId);
      
      if (!container) {
        console.log('[Contest Video] Container not found, retrying...');
        setTimeout(initializePlayer, 500);
        return;
      }

      // Initialize video player
      if (!playerRef.current) {
        console.log('[Contest Video] Initializing YouTube player');
        try {
          playerRef.current = new window.YT.Player(containerId, {
            videoId: '_DEmdMYdjXk',
            playerVars: {
              autoplay: 1,
              mute: 1, // Start muted for autoplay compatibility, then unmute after playing
              controls: 1,
              rel: 0, // Don't show related videos
              modestbranding: 1,
              enablejsapi: 1,
              loop: 1, // Enable looping
              playlist: '_DEmdMYdjXk', // Required for loop to work
            },
            events: {
              onReady: (event: any) => {
                console.log('[Contest Video] Video ready, starting playback');
                const player = event.target;
                
                // Start playing (should autoplay since mute: 1)
                const startPlayback = () => {
                  try {
                    player.playVideo();
                    console.log('[Contest Video] Play command sent');
                    
                    // Wait a moment, then check if playing and unmute
                    setTimeout(() => {
                      const state = player.getPlayerState();
                      console.log('[Contest Video] Player state:', state);
                      
                      if (state === window.YT.PlayerState.PLAYING) {
                        // Video is playing - attempt to unmute (no overlay on contest page)
                        try {
                          player.unMute();
                          console.log('[Contest Video] Video playing, unmute attempted');
                        } catch (e) {
                          console.log('[Contest Video] Could not unmute:', e);
                          // No overlay - just log
                        }
                      } else {
                        // Not playing yet, try again
                        console.log('[Contest Video] Video not playing yet, retrying...');
                        setTimeout(() => {
                          try {
                            player.playVideo();
                            setTimeout(() => {
                              try {
                                player.unMute();
                              } catch (e) {
                                console.log('[Contest Video] Could not unmute on retry:', e);
                              }
                            }, 1000);
                          } catch (e) {
                            console.log('[Contest Video] Retry play failed:', e);
                          }
                        }, 500);
                      }
                    }, 500);
                  } catch (e) {
                    console.error('[Contest Video] Error starting playback:', e);
                  }
                };
                
                // Start playback immediately
                startPlayback();
              },
              onStateChange: (event: any) => {
                const state = event.data;
                console.log('[Contest Video] State changed:', state);
                
                // When video ends (state 0), restart it
                if (state === window.YT.PlayerState.ENDED) {
                  console.log('[Contest Video] Video ended, restarting');
                  setTimeout(() => {
                    if (playerRef.current) {
                      try {
                        playerRef.current.seekTo(0, true); // Restart from beginning
                        playerRef.current.playVideo();
                        playerRef.current.unMute(); // Ensure unmuted
                        console.log('[Contest Video] Restarted video');
                      } catch (e) {
                        console.error('[Contest Video] Error restarting:', e);
                      }
                    }
                  }, 500);
                } else if (state === window.YT.PlayerState.PLAYING) {
                  // Video is playing - attempt to unmute (no overlay on contest page)
                  try {
                    event.target.unMute();
                    console.log('[Contest Video] Video playing, unmute attempted');
                  } catch (e) {
                    console.log('[Contest Video] Could not unmute during playback:', e);
                    // No overlay - just log
                  }
                } else if (state === window.YT.PlayerState.PAUSED) {
                  // If paused, try to resume (shouldn't happen with autoplay, but just in case)
                  console.log('[Contest Video] Video paused, attempting to resume');
                  setTimeout(() => {
                    try {
                      event.target.playVideo();
                      event.target.unMute();
                    } catch (e) {
                      console.log('[Contest Video] Could not resume:', e);
                    }
                  }, 1000);
                }
              },
              onError: (event: any) => {
                console.error('[Contest Video] YouTube Player Error:', event.data);
              },
            },
          });
        } catch (error) {
          console.error('[Contest Video] Error initializing player:', error);
        }
      }
    };

    // Wait for YouTube API to be ready
    if (window.YT && window.YT.Player) {
      // API already loaded, initialize immediately
      setTimeout(initializePlayer, 100);
    } else {
      // Wait for API to load
      window.onYouTubeIframeAPIReady = () => {
        console.log('[Contest Video] YouTube API ready');
        setTimeout(initializePlayer, 100);
      };
    }

    return () => {
      // Cleanup
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
          playerRef.current = null;
        } catch (e) {
          console.warn('Error destroying video player:', e);
        }
      }
    };
  }, []); // Empty deps - run once on mount

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
        microPrompt: 'Explore the story',
        text: 'Tap here to read a sample chapter!',
        href: '/sample-chapters',
        type: 'link' as const,
      },
      {
        id: 'contestBtn',
        label: userHasJoinedContest ? 'See Your Progress' : 'Officially Enter (500 pts)',
        microPrompt: userHasJoinedContest ? 'View your progress' : 'Start earning points',
        text: userHasJoinedContest ? 'View your contest score and progress' : 'You can win this for your family!',
        href: userHasJoinedContest ? '/contest/score' : '/contest/signup?from=/contest',
        type: 'link' as const,
      },
      {
        id: 'pointsBtn',
        label: 'Send Signal',
        microPrompt: 'Send your first signal',
        text: 'Tap here to win points.',
        href: '/signal-room',
        type: 'link' as const,
      },
      {
        id: 'buyBtn',
        label: 'Buy the Book',
        microPrompt: 'Own the book',
        text: 'The adventure’s great—and you’re already living it.',
        type: 'button' as const,
      },
    ],
    [userHasJoinedContest],
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

  // Dynamic banner messages: motivational + live metrics (only when > 0)
  const bannerMessages = useMemo(() => {
    const msgs = [...BANNER_MOTIVATIONAL];
    if (liveStats) {
      if (liveStats.currentLeaderPoints > 0 && liveStats.currentLeaderName) {
        msgs.push(`⚡ Current leader: ${liveStats.currentLeaderName} — ${liveStats.currentLeaderPoints.toLocaleString()} pts`);
      }
      if (liveStats.playersExploring > 0) {
        msgs.push(`⚡ ${liveStats.playersExploring} players exploring the system`);
      }
      if (liveStats.friendsSavedCents > 0) {
        msgs.push(`⚡ Friends have saved $${(liveStats.friendsSavedCents / 100).toFixed(0)} through shared links`);
      }
      if (liveStats.associateRewardsCents > 0) {
        msgs.push(`⚡ Associate publishers have earned $${(liveStats.associateRewardsCents / 100).toFixed(0)} in rewards`);
      }
      if (liveStats.booksClaimed > 0) {
        msgs.push(`⚡ ${liveStats.booksClaimed} books claimed through the system`);
      }
    }
    return msgs;
  }, [liveStats]);

  // Banner rotation: 2.5s per message, smooth fade
  useEffect(() => {
    if (bannerMessages.length === 0) return;
    const interval = setInterval(() => {
      setBannerIndex((prev) => (prev + 1) % bannerMessages.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [bannerMessages.length]);

  const handleChangeAccount = useCallback(async () => {
    associateStatusForEmailRef.current = null;
    try {
      // Call logout API to clear cookies
      await fetch('/api/contest/logout', {
        method: 'POST',
        credentials: 'include',
      }).catch(() => {
        // Continue even if logout API fails
      });
      
      // Clear localStorage
      clearAssociateCaches();
      
      // Redirect to IBM Terminal entry (preserves origin - ngrok stays ngrok)
      window.location.href = '/terminal';
    } catch (err) {
      console.error('[contest] Change account error', err);
      // Fallback: just clear and reload
      clearAssociateCaches();
      router.replace('/contest');
    }
  }, [router]);

  const handleContestEntry = (href: string) => {
    // Check for identity using multiple sources
    const storedEmail = readContestEmail();
    const storedUserId = typeof window !== 'undefined' ? localStorage.getItem('contest_user_id') : null;
    const storedUserCode = typeof window !== 'undefined' ? localStorage.getItem('contest_user_code') : null;
    const hasIdentity = !!(contestEmail || storedEmail || storedUserId || storedUserCode);
    
    // If user has joined the contest, go to score page
    if (hasIdentity && statusLoaded && userHasJoinedContest) {
      router.push('/contest/score');
      return;
    }
    
    // All other cases: navigate to dedicated entry route (replaces hub; no inline form)
    // - Has identity but not joined: /contest/signup?from=/contest
    // - New user: same route — dedicated page, no hub media carryover
    router.push(href);
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

  const handleContestEntryCompletedFromBuy = useCallback(() => {
    setShowEntryFormForCheckout(false);
    // User returns to Contest Hub; they can click Buy again when ready
  }, []);

  const handleCloseTerminalUnlock = useCallback(() => {
    setShowTerminalUnlockPanel(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('v');
    url.searchParams.delete('variant');
    window.history.replaceState({}, '', url.pathname + (url.search || ''));
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
      {/* SPEC 3: Terminal discovery unlock panel */}
      {showTerminalUnlockPanel && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
        >
          <div
            style={{
              backgroundColor: 'rgba(0, 20, 30, 0.95)',
              border: '2px solid #00ffe0',
              borderRadius: 12,
              padding: '2rem',
              maxWidth: 420,
              textAlign: 'center',
              boxShadow: '0 0 24px rgba(0, 255, 224, 0.3)',
            }}
          >
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#00ffe0', marginBottom: '1rem' }}>
              ⚡ TERMINAL ACCESS DETECTED
            </div>
            <p style={{ color: '#d1d5db', marginBottom: '0.75rem', lineHeight: 1.5 }}>
              You discovered a hidden system entry point.
            </p>
            <p style={{ color: '#00ffe0', fontWeight: 600, marginBottom: '0.75rem' }}>
              {terminalDiscoveryJustAwarded === true
                ? '+250 bonus points awarded.'
                : terminalDiscoveryJustAwarded === false
                ? 'You already received this bonus.'
                : '+250 bonus points awarded.'}
            </p>
            <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Keep exploring. Not everything in the system is obvious.
            </p>
            <button
              type="button"
              onClick={handleCloseTerminalUnlock}
              style={{
                padding: '0.75rem 2rem',
                backgroundColor: '#00ffe0',
                color: '#000',
                fontWeight: 600,
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: '1rem',
              }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* VIDEO SEGMENT */}
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
        {/* YouTube overlay blur for bottom-left channel name/avatar */}
        {showYouTubeOverlay && (
          <div
            style={{
              position: 'absolute',
              bottom: '60px', // Above YouTube controls
              left: '0',
              width: '200px',
              height: '60px',
              pointerEvents: 'none',
              background: 'rgba(0, 0, 0, 0.3)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              borderRadius: '0 8px 0 0',
              zIndex: 10,
              transition: 'opacity 0.5s ease-out',
            }}
          />
        )}
      </div>

      {/* Greeting: Welcome back or Welcome based on profile existence */}
      {contestEmail && (
        <div
          style={{
            textAlign: 'center',
            marginTop: '1rem',
            marginBottom: '1rem',
          }}
        >
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            {hasProfile ? 'Welcome back' : 'Welcome'}, {(() => {
              // If profile exists, use profile firstName
              if (profileFirstName) {
                return profileFirstName;
              }
              // Else guess from email local part
              const emailLocal = contestEmail.split('@')[0];
              if (emailLocal) {
                // Extract name from email (e.g., "egg.benedict" -> "Egg" or "Egg Benedict")
                const parts = emailLocal.split(/[._-]/);
                if (parts.length > 1) {
                  // Multiple parts: capitalize each and join
                  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
                } else {
                  // Single part: capitalize first letter
                  return emailLocal.charAt(0).toUpperCase() + emailLocal.slice(1);
                }
              }
              return 'Explorer';
            })()}.
          </h2>
          <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#00ffe0', marginBottom: '0.5rem', textShadow: '0 0 8px rgba(0, 255, 224, 0.5)' }}>
            WIN A 6-DAY • 7-NIGHT FAMILY VACATION
          </p>
          <p style={{ fontSize: '1rem', color: '#9ca3af' }}>
            You're in. Let's play.
          </p>
          {process.env.NEXT_PUBLIC_STRESS_TEST_MODE === '1' && (
            <p style={{ fontSize: '0.8rem', color: 'rgba(156, 163, 175, 0.8)', marginTop: '0.25rem' }}>
              Public Stress Test Active — simulation only
            </p>
          )}
        </div>
      )}

      {/* LIVE CONTEST STATUS PANEL */}
      {liveStats && (
        <div
          style={{
            marginTop: '1rem',
            marginBottom: '0.5rem',
            padding: '1rem 1.25rem',
            backgroundColor: 'rgba(0, 255, 224, 0.05)',
            border: '1px solid rgba(0, 255, 224, 0.25)',
            borderRadius: '0.5rem',
            maxWidth: '600px',
            marginLeft: 'auto',
            marginRight: 'auto',
            textAlign: 'left',
          }}
        >
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#00ffe0', marginBottom: '0.75rem' }}>
            ⚡ LIVE CONTEST STATUS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.9rem', color: '#d1d5db' }}>
            {liveStats.playersExploring > 0 && (
              <div
                style={{
                  transition: 'all 0.3s ease',
                  ...(liveStatsHighlight.has('playersExploring')
                    ? { color: '#00ffe0', textShadow: '0 0 8px rgba(0, 255, 224, 0.6)', animation: 'liveStatPulse 0.6s ease' }
                    : {}),
                }}
              >
                {liveStats.playersExploring} players exploring the system
              </div>
            )}
            {liveStats.currentLeaderPoints > 0 && liveStats.currentLeaderName && (
              <div
                style={{
                  transition: 'all 0.3s ease',
                  ...(liveStatsHighlight.has('currentLeaderPoints')
                    ? { color: '#00ffe0', textShadow: '0 0 8px rgba(0, 255, 224, 0.6)', animation: 'liveStatPulse 0.6s ease' }
                    : {}),
                }}
              >
                Current leader: {liveStats.currentLeaderName} — {liveStats.currentLeaderPoints.toLocaleString()} pts
              </div>
            )}
            {liveStats.friendsSavedCents > 0 && (
              <div
                style={{
                  transition: 'all 0.3s ease',
                  ...(liveStatsHighlight.has('friendsSavedCents')
                    ? { color: '#00ffe0', textShadow: '0 0 8px rgba(0, 255, 224, 0.6)', animation: 'liveStatPulse 0.6s ease' }
                    : {}),
                }}
              >
                Friends saved so far: ${(liveStats.friendsSavedCents / 100).toFixed(0)}
              </div>
            )}
            {liveStats.associateRewardsCents > 0 && (
              <div
                style={{
                  transition: 'all 0.3s ease',
                  ...(liveStatsHighlight.has('associateRewardsCents')
                    ? { color: '#00ffe0', textShadow: '0 0 8px rgba(0, 255, 224, 0.6)', animation: 'liveStatPulse 0.6s ease' }
                    : {}),
                }}
              >
                Associate rewards earned: ${(liveStats.associateRewardsCents / 100).toFixed(0)}
              </div>
            )}
            {liveStats.booksClaimed > 0 && (
              <div
                style={{
                  transition: 'all 0.3s ease',
                  ...(liveStatsHighlight.has('booksClaimed')
                    ? { color: '#00ffe0', textShadow: '0 0 8px rgba(0, 255, 224, 0.6)', animation: 'liveStatPulse 0.6s ease' }
                    : {}),
                }}
              >
                Books claimed: {liveStats.booksClaimed}
              </div>
            )}
          </div>
        </div>
      )}

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
        <div 
          style={{ 
            marginTop: '1rem', 
            padding: '1rem 1.5rem',
            color: '#00ffe0',
            fontSize: '1rem',
            textAlign: 'center',
            backgroundColor: 'rgba(0, 255, 224, 0.05)',
            border: '1px solid rgba(0, 255, 224, 0.2)',
            borderRadius: '0.5rem',
            maxWidth: '600px',
            marginLeft: 'auto',
            marginRight: 'auto',
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(0, 255, 224, 0.1)';
            e.currentTarget.style.borderColor = 'rgba(0, 255, 224, 0.4)';
            e.currentTarget.style.boxShadow = '0 0 12px rgba(0, 255, 224, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(0, 255, 224, 0.05)';
            e.currentTarget.style.borderColor = 'rgba(0, 255, 224, 0.2)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem', color: '#00ffe0', textShadow: '0 0 8px rgba(0, 255, 224, 0.5)' }}>
            Welcome, friend.
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#00ffe0', marginBottom: '0.5rem', textShadow: '0 0 6px rgba(0, 255, 224, 0.4)' }}>
            WIN A 6-DAY • 7-NIGHT FAMILY VACATION
          </div>
          <div style={{ fontSize: '0.9rem', color: '#d1d5db', lineHeight: '1.5' }}>
            You&apos;re new here — enjoy your stay. When you&apos;re ready, you can enter the contest anytime.
          </div>
        </div>
      )}

      {/* MENU BUTTONS */}
      {/* E1: Mobile layout - wrap buttons in portrait, ensure all visible */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        gap: '12px', // E1: Consistent gap
        marginTop: '1.2rem',
        flexWrap: 'wrap', // E1: Wrap on mobile portrait
        padding: '0 1rem', // E1: Padding for mobile
        maxWidth: '100%', // E1: Prevent overflow
        width: '100%', // E1: Full width container
      }}>
        {buttons.map((btn, index) => (
          <div key={btn.id} style={{ 
            position: 'relative', 
            textAlign: 'center',
            flex: '1 1 auto', // E1: Allow buttons to grow/shrink
            minWidth: '160px', // E1: Minimum width for readability
            maxWidth: '100%', // E1: Don't exceed container
          }}>
            <div
              style={{
                fontSize: '0.75rem',
                color: '#9ca3af',
                marginBottom: '0.35rem',
                minHeight: '1.2em',
              }}
            >
              {btn.microPrompt}
            </div>
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
                disabled={statusLoading}
                onClick={() => {
                  if (!btn.href) {
                    alert("That entry link isn't available yet.");
                    return;
                  }
                  handleContestEntry(btn.href);
                }}
                style={{
                  padding: '1rem',
                  backgroundColor: index === current ? 'green' : '#111',
                  border: '2px solid green',
                  color: index === current ? 'black' : 'white',
                  fontSize: '1rem',
                  cursor: statusLoading ? 'not-allowed' : 'pointer',
                  animation: index === current ? 'pulse 1s infinite' : 'none',
                  transition: 'all 0.3s',
                  minWidth: '160px', // E1: Smaller min width for mobile
                  width: '100%', // E1: Full width on mobile
                  maxWidth: '100%', // E1: Don't exceed container
                  opacity: statusLoading ? 0.6 : 1,
                }}
              >
                {statusLoading ? 'Checking...' : btn.label}
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
                  minWidth: '160px', // E1: Smaller min width for mobile
                  width: '100%', // E1: Full width on mobile
                  maxWidth: '100%', // E1: Don't exceed container
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
                  minWidth: '160px', // E1: Smaller min width for mobile
                  width: '100%', // E1: Full width on mobile
                  maxWidth: '100%', // E1: Don't exceed container
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

      {/* DYNAMIC RUNNING BANNER: daily contest (fixed line) + motivation + live metrics */}
      {(dailyContestRibbonLine || bannerMessages.length > 0) && (
        <div
          style={{
            backgroundColor: 'rgba(0, 255, 224, 0.12)',
            borderTop: '1px solid rgba(0, 255, 224, 0.3)',
            color: '#00ffe0',
            position: 'fixed',
            bottom: 0,
            width: '100%',
            padding: dailyContestRibbonLine ? '0.35rem 1rem 0.5rem' : '0.6rem 1rem',
            fontWeight: 600,
            zIndex: 1000,
            textAlign: 'center',
            minHeight: 44,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: dailyContestRibbonLine ? 6 : 0,
        }}
      >
        {dailyContestRibbonLine && (
          <p
            style={{
              margin: 0,
              fontSize: '0.82rem',
              lineHeight: 1.35,
              color: '#b5fff4',
              fontWeight: 600,
              maxWidth: 960,
            }}
          >
            {dailyContestRibbonLine}
          </p>
        )}
        {bannerMessages.length > 0 && (
          <p
            key={bannerIndex}
            style={{
              margin: 0,
              fontSize: '0.95rem',
              animation: 'contestBannerFade 0.5s ease',
            }}
          >
            {terminalDiscoveryBannerActive
              ? '⚡ Hidden terminal discovered — bonus points awarded'
              : bannerMessages[bannerIndex]}
          </p>
        )}
      </div>
      )}

      {/* ANIMATIONS */}
      <style jsx global>{`
        @keyframes contestBannerFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes liveStatPulse {
          0% { opacity: 1; box-shadow: 0 0 0 rgba(0, 255, 224, 0); }
          50% { opacity: 1; box-shadow: 0 0 12px rgba(0, 255, 224, 0.5); }
          100% { opacity: 1; box-shadow: 0 0 0 rgba(0, 255, 224, 0); }
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

      {/* SPEC 4: Beta Contest Rules footer during public stress test */}
      {process.env.NEXT_PUBLIC_STRESS_TEST_MODE === '1' && (
        <div style={{
          marginTop: '2rem',
          marginBottom: '1rem',
          padding: '0 1.5rem',
          maxWidth: '600px',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}>
          <BetaContestRules variant="compact" />
        </div>
      )}

      {/* Invisible behavior: wires Buy button to checkout */}
      <CheckoutWiring />
      <HelpButton />

      {/* D: Self-heal - RequestAccessModal for unauthenticated users */}
      <RequestAccessModal
        isOpen={showRequestAccessModal}
        onSuccess={() => {
          // D: After login, refetch associate/status
          console.log('[contest] RequestAccessModal success - refetching status');
          setShowRequestAccessModal(false);
          setStatusLoading(true);
          fetch('/api/associate/status', {
            method: 'GET',
            cache: 'no-store',
          })
            .then((res) => res.json())
            .then((data) => {
              const nextHasProfile = Boolean(data?.hasProfile);
              const nextHasJoinedContest = Boolean(data?.contestJoined ?? data?.hasJoinedContest);
              setHasProfile(nextHasProfile);
              setHasJoinedContest(nextHasJoinedContest);
              setProfileFirstName(data?.firstName || null);
              
              if (data?.id && data?.email) {
                const payload: AssociateCache = {
                  id: data.id,
                  email: data.email,
                  name: data?.name || data.email,
                  code: data?.code || '',
                };
                writeAssociate(payload);
                setAssociate(payload);
              }
              
              setStatusLoading(false);
              setStatusLoaded(true);
            })
            .catch((err) => {
              console.error('[contest] Failed to refetch status after login', err);
              setStatusLoading(false);
              setStatusLoaded(true);
            });
        }}
        redirectTo="/contest"
      />
    </div>
  );
}