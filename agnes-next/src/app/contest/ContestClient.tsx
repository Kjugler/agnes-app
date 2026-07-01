'use client';

import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import CheckoutWiring from './CheckoutWiring'; // ← invisible helper that wires the Buy button
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
import SiteRibbonTicker from '@/components/SiteRibbonTicker';
import SiteFooter from '@/components/SiteFooter';
import { isContestEntryUxArchived } from '@/lib/funnelConfig';
import {
  HUB_THEME,
  hubContentWrapStyle,
  hubEyebrowStyle,
  hubMicroPromptStyle,
  hubNavCardStyle,
  hubPageShellStyle,
  hubPrimaryButtonStyle,
  hubSecondaryButtonStyle,
} from '@/lib/hubTheme';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

const HUB_RIBBON_COPY =
  'Read four free sample chapters • Meet Simon McQuade • The Agnes Protocol';

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
  
  const [contestEmail, setContestEmail] = useState<string | null>(null);
  const [associate, setAssociate] = useState<AssociateCache | null>(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [hasJoinedContest, setHasJoinedContest] = useState(false);
  const [profileFirstName, setProfileFirstName] = useState<string | null>(null);
  /** From associate/status — ISO string or null */
  const [contestJoinedAtIso, setContestJoinedAtIso] = useState<string | null>(null);
  const [hasPurchasedBook, setHasPurchasedBook] = useState(false);
  /** Start true so CTA shows "Checking..." until first status resolve (avoids wrong "Enter" flash). */
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusLoaded, setStatusLoaded] = useState(false);
  /** Last principal email we successfully applied from GET /api/associate/status — skips duplicate fetch when setContestEmail syncs the same value. */
  const associateStatusForEmailRef = useRef<string | null>(null);
  const [showEntryFormForCheckout, setShowEntryFormForCheckout] = useState(false);
  const [showIdentityBanner, setShowIdentityBanner] = useState(false);
  const [showYouTubeOverlay, setShowYouTubeOverlay] = useState(true);
  const [showRequestAccessModal, setShowRequestAccessModal] = useState(false);
  const [showTerminalUnlockPanel, setShowTerminalUnlockPanel] = useState(false);
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
  const terminalPass = qp.get('terminalPass') === '1';
  
  // Computed booleans derived from state (must be declared before useMemo/useEffect/useCallback)
  // These are safe to compute here because they're simple boolean expressions
  // Default to false until state is loaded. contestJoined from API is authoritative; contestEmail may lag on first load.
  const userHasJoinedContest = statusLoaded && hasJoinedContest;

  const isUserCommitted =
    Boolean(contestJoinedAtIso) || Boolean(hasPurchasedBook);

  /** Real first name only — no email heuristics, no Friend/Explorer/None */
  const greetingName = useMemo(() => {
    const n = (profileFirstName || '').trim();
    return n.length > 0 ? n : null;
  }, [profileFirstName]);

  // Additional computed flags (if any)
  // const isReturning = Boolean(associate?.id);
  // const hasLedger = Boolean(associate?.code);

  // ---- MEMOS / EFFECTS / CALLBACKS (all hooks that use the above values go here) ----
  
  useEffect(() => {
    if (!statusLoaded) return;
    console.log('USER STATE:', {
      committed: isUserCommitted,
      hasName: !!greetingName,
      contestJoinedAt: contestJoinedAtIso,
    });
  }, [statusLoaded, isUserCommitted, greetingName, contestJoinedAtIso]);

  // SPEC 3: Terminal discovery - when v=terminal, award bonus; modal only without terminalPass
  useEffect(() => {
    const v = qp.get('v') || qp.get('variant');
    if (v !== 'terminal') return;

    if (!terminalPass) {
      setShowTerminalUnlockPanel(true);
    }

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
        if (data?.awarded) {
          window.dispatchEvent(new CustomEvent('contest:points-updated'));
        }
      })
      .catch(() => {});

    if (terminalPass && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('terminalPass');
      window.history.replaceState({}, '', url.pathname + (url.search || ''));
    }
  }, [qp, terminalPass]);

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
      setContestJoinedAtIso(null);
      setHasPurchasedBook(false);

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

        // Explore-first: anonymous or missing principal — browse without email gate / modal
        if (!data?.ok || !data?.id || !data?.email) {
          console.log('[contest] No principal — hub without identity gate', {
            ok: data?.ok,
            id: data?.id,
            email: data?.email,
            reason: data?.reason,
          });
          associateStatusForEmailRef.current = null;
          setContestJoinedAtIso(null);
          setHasPurchasedBook(false);
          setShowRequestAccessModal(false);
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
        setContestJoinedAtIso(
          typeof data?.contestJoinedAt === 'string' ? data.contestJoinedAt : null
        );
        setHasPurchasedBook(Boolean(data?.hasPurchasedBook));

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
          setContestJoinedAtIso(null);
          setHasPurchasedBook(false);
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
            setContestJoinedAtIso(
              typeof data?.contestJoinedAt === 'string' ? data.contestJoinedAt : null
            );
            setHasPurchasedBook(Boolean(data?.hasPurchasedBook));
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
        label: 'Share the Experience',
        microPrompt: 'Share the story',
        text: 'Text, email, and social tools for readers.',
        href: '/contest/score',
        type: 'link' as const,
      },
      {
        id: 'pointsBtn',
        label: 'Send a Signal',
        microPrompt: 'Join the conversation',
        text: 'Share your thoughts with other readers.',
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
      {
        id: 'authorBtn',
        label: 'About the Author',
        microPrompt: 'Meet Simon McQuade',
        text: 'The person behind the pen name.',
        href: '/author',
        type: 'link' as const,
      },
    ],
    [],
  );

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
    if (isContestEntryUxArchived()) {
      const params = new URLSearchParams();
      const keysToPreserve = ['ref', 'src', 'v', 'origin', 'code', 'utm_source', 'utm_medium', 'utm_campaign'];
      keysToPreserve.forEach((key) => {
        const value = qp.get(key);
        if (value) params.set(key, value);
      });
      router.push(`/catalog${params.toString() ? `?${params.toString()}` : ''}`);
      return;
    }
    setShowEntryFormForCheckout(true);
    setTimeout(() => {
      const formElement = document.querySelector('[data-contest-entry-form]');
      if (formElement) {
        formElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }, [qp, router]);

  const handleContestEntryCompletedFromBuy = useCallback(() => {
    setShowEntryFormForCheckout(false);
    // User returns to Contest Hub; they can click Buy again when ready
  }, []);

  const handleCloseTerminalUnlock = useCallback(() => {
    setShowTerminalUnlockPanel(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('v');
    url.searchParams.delete('variant');
    url.searchParams.delete('terminalPass');
    window.history.replaceState({}, '', url.pathname + (url.search || ''));
  }, []);

  return (
    <div style={hubPageShellStyle()}>
      {/* SPEC 3: Terminal discovery unlock panel */}
      {showTerminalUnlockPanel && !terminalPass && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
        >
          <div
            style={{
              backgroundColor: HUB_THEME.surface,
              border: `2px solid ${HUB_THEME.accentCyan}`,
              borderRadius: 12,
              padding: '2rem',
              maxWidth: 420,
              textAlign: 'center',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.12)',
            }}
          >
            <div
              style={{
                fontSize: '1.1rem',
                fontWeight: 700,
                color: HUB_THEME.text,
                marginBottom: '1rem',
              }}
            >
              You found a side door into the story
            </div>
            <p style={{ color: HUB_THEME.text, marginBottom: '0.75rem', lineHeight: 1.5 }}>
              The Agnes Protocol has more layers than meet the eye.
            </p>
            <p
              style={{
                color: HUB_THEME.textMuted,
                fontSize: '0.9rem',
                marginBottom: '1.5rem',
                lineHeight: 1.5,
              }}
            >
              Keep reading sample chapters and exploring when you&apos;re ready.
            </p>
            <button
              type="button"
              onClick={handleCloseTerminalUnlock}
              style={{
                ...hubPrimaryButtonStyle(true),
                padding: '0.75rem 2rem',
                width: 'auto',
                minWidth: '140px',
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

      <div style={hubContentWrapStyle()}>
        {/* Greeting: committed users with a real first name only (no Friend/None/email guesses) */}
        {isUserCommitted && greetingName ? (
          <div
            style={{
              textAlign: 'center',
              marginTop: '2rem',
              marginBottom: '0.5rem',
            }}
          >
            <h2
              style={{
                fontSize: '1.5rem',
                fontWeight: 600,
                marginBottom: '0.5rem',
                color: HUB_THEME.text,
              }}
            >
              {hasProfile ? 'Welcome back' : 'Welcome'}, {greetingName}.
            </h2>
          </div>
        ) : null}

        <div style={{ textAlign: 'center', marginTop: isUserCommitted && greetingName ? '0.5rem' : '2rem' }}>
          <p style={hubEyebrowStyle()}>The Agnes Protocol</p>
          <p
            style={{
              fontSize: '1.15rem',
              color: HUB_THEME.textMuted,
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Explore the story, meet the author, and start reading.
          </p>
        </div>

        {contestEmail ? (
          <div
            style={{
              marginTop: '1.25rem',
              color: HUB_THEME.textMuted,
              fontSize: '0.95rem',
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'center',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <span>
              Signed in as <strong style={{ color: HUB_THEME.text }}>{contestEmail}</strong>
              {isUserCommitted && greetingName ? (
                <>
                  {' · '}
                  {hasProfile ? 'Welcome back' : 'Welcome'}, {greetingName}
                </>
              ) : null}
            </span>
            <button
              type="button"
              onClick={handleChangeAccount}
              style={{
                ...hubSecondaryButtonStyle(),
                padding: '0.35rem 1rem',
                fontSize: '0.85rem',
                minHeight: 'auto',
                width: 'auto',
                minWidth: 'auto',
              }}
            >
              Change account
            </button>
          </div>
        ) : null}

        {/* MENU BUTTONS */}
        {/* E1: Mobile layout - wrap buttons in portrait, ensure all visible */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '16px',
            marginTop: '2rem',
            flexWrap: 'wrap',
            maxWidth: '100%',
            width: '100%',
          }}
        >
          {buttons.map((btn) => {
            const sampleEmphasis = btn.id === 'sampleBtn';
            const isPrimary = btn.id === 'sampleBtn' || btn.id === 'buyBtn';
            return (
              <div key={btn.id} style={hubNavCardStyle(sampleEmphasis)}>
                <div style={hubMicroPromptStyle(sampleEmphasis)}>{btn.microPrompt}</div>
                {btn.type === 'button' ? (
                  <BuyBookButton
                    source="contest"
                    successPath="/contest/thank-you"
                    cancelPath="/contest"
                    onRequireContestEntry={handleRequireContestEntry}
                    style={{
                      ...hubPrimaryButtonStyle(true),
                      padding: '12px 22px',
                      fontSize: '15px',
                      textTransform: 'none',
                    }}
                  >
                    {btn.label}
                  </BuyBookButton>
                ) : (
                  <Link
                    href={btn.href}
                    prefetch={false}
                    style={
                      isPrimary
                        ? hubPrimaryButtonStyle(true)
                        : hubSecondaryButtonStyle()
                    }
                  >
                    {btn.label}
                  </Link>
                )}
              </div>
            );
          })}
        </div>

        {/* Contest Entry Form (shown when Buy button requires entry) */}
        {!isContestEntryUxArchived() && showEntryFormForCheckout && (
          <div
            data-contest-entry-form
            style={{
              marginTop: '2rem',
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <ContestEntryForm
              suppressAscensionRedirect={true}
              onCompleted={handleContestEntryCompletedFromBuy}
            />
          </div>
        )}

        <SiteFooter variant="light" />
      </div>

      <SiteRibbonTicker
        bookHubMode
        extraSegments={[HUB_RIBBON_COPY]}
      />

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
              setContestJoinedAtIso(
                typeof data?.contestJoinedAt === 'string' ? data.contestJoinedAt : null
              );
              setHasPurchasedBook(Boolean(data?.hasPurchasedBook));
              
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