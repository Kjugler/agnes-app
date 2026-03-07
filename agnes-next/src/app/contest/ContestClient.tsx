'use client';

import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import CheckoutWiring from './CheckoutWiring'; // ← invisible helper that wires the Buy button
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
  clearIdentityStorage,
  type AssociateCache,
} from '@/lib/identity';
import RequestAccessModal from '@/components/auth/RequestAccessModal';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

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
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [showEntryFormForCheckout, setShowEntryFormForCheckout] = useState(false);
  const [showIdentityBanner, setShowIdentityBanner] = useState(false);
  const [showYouTubeOverlay, setShowYouTubeOverlay] = useState(true);
  const [showRequestAccessModal, setShowRequestAccessModal] = useState(false);
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
  // Default to false until state is loaded to prevent TDZ
  const userHasJoinedContest = statusLoaded && hasJoinedContest && Boolean(contestEmail);
  const hasAssociate = statusLoaded && hasProfile && Boolean(contestEmail);
  
  // Additional computed flags (if any)
  // const isReturning = Boolean(associate?.id);
  // const hasLedger = Boolean(associate?.code);

  // ---- MEMOS / EFFECTS / CALLBACKS (all hooks that use the above values go here) ----
  
  // Handle fresh=1 param: clear identity storage before rendering
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const params = new URLSearchParams(window.location.search);
    if (params.get('fresh') === '1') {
      console.log('[contest] fresh=1 detected, clearing identity storage');
      clearIdentityStorage();
      
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

  // Inject ticker animation CSS as fallback (ensures animation works)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const styleId = 'contest-ticker-animation';
    if (document.getElementById(styleId)) return; // Already injected
    
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
      if (!contestEmail) {
        setHasProfile(false);
        setHasJoinedContest(false);
        setProfileFirstName(null);
        setAssociate(null);
        setStatusLoaded(false);
        setStatusLoading(false);
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
          setShowRequestAccessModal(true);
          setStatusLoading(false);
          setStatusLoaded(true);
          return;
        }

        // R4: Use contestJoined from ledger (single source of truth)
        // Prefer contestJoined field, fallback to hasJoinedContest for backward compatibility
        const nextHasProfile = Boolean(data?.hasProfile);
        const nextHasJoinedContest = Boolean(data?.contestJoined ?? data?.hasJoinedContest);
        setHasProfile(nextHasProfile);
        setHasJoinedContest(nextHasJoinedContest);
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
      } catch (err: any) {
        console.warn('[contest] status load failed', err);
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
    
    // Small delay to let email query param handler run first
    const timer = setTimeout(() => {
      loadStatus();
    }, 100);
    
    return () => {
      cancelled = true;
      clearTimeout(timer);
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

  // Part B: Deterministic refresh loop for post-purchase state update
  useEffect(() => {
    // Only run if we have purchase indicators AND email is loaded
    if ((!justPurchased && !sessionId) || !contestEmail) return;

    let cancelled = false;
    const delays = [0, 1200, 2500, 4500]; // Attempt 0 immediately, then 1.2s, 2.5s, 4.5s
    const timers: NodeJS.Timeout[] = [];

    const refreshAssociateStatus = async (): Promise<boolean> => {
      try {
        const res = await fetch('/api/associate/status', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'include', // Part C: Ensure cookies are included for origin stability
        });

        if (!res.ok) {
          console.warn('[contest] Refresh status failed', { status: res.status });
          return false;
        }

        const data = await res.json();
        const nextHasJoinedContest = Boolean(data?.contestJoined ?? data?.hasJoinedContest);

        setHasJoinedContest(nextHasJoinedContest);
        setStatusLoaded(true);
        setStatusLoading(false);

        return nextHasJoinedContest; // Return true if joined, false otherwise
      } catch (err) {
        console.warn('[contest] Refresh status error', err);
        return false;
      }
    };

    const runRefreshLoop = async () => {
      for (let i = 0; i < delays.length; i++) {
        if (cancelled) return;

        // Wait for the delay (cumulative from start, except first attempt)
        if (i > 0) {
          const delayMs = delays[i] - delays[i - 1];
          await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
              resolve();
            }, delayMs);
            timers.push(timer);
          });
        }

        if (cancelled) return;

        // Attempt refresh
        console.log('[contest] Refresh attempt', { attempt: i + 1, delay: delays[i] });
        const isJoined = await refreshAssociateStatus();

        // Stop early if contestJoined === true
        if (isJoined) {
          console.log('[contest] Refresh loop stopped early - contestJoined is true', {
            attempt: i + 1,
            totalAttempts: delays.length,
            elapsedMs: delays[i],
          });
          break;
        }
      }

      // Clean up query params after loop completes (without navigation)
      if (!cancelled) {
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('justPurchased');
          url.searchParams.delete('session_id');
          window.history.replaceState({}, '', url.toString());
          console.log('[contest] Cleaned up purchase query params');
        } catch (err) {
          console.warn('[contest] Failed to clean up query params', err);
        }
      }
    };

    console.log('[contest] Starting deterministic refresh loop', {
      justPurchased,
      sessionId,
      contestEmail,
    });

    runRefreshLoop();

    return () => {
      cancelled = true;
      timers.forEach((timer) => clearTimeout(timer));
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
        text: 'Tap here to read a sample chapter!',
        href: '/sample-chapters',
        type: 'link' as const,
      },
      {
        id: 'contestBtn',
        label: userHasJoinedContest ? 'See Your Progress' : 'Officially Enter (500 pts)',
        text: userHasJoinedContest ? 'View your contest score and progress' : 'You can win this for your family!',
        href: userHasJoinedContest ? '/contest/score' : '/contest/signup?from=/contest',
        type: 'link' as const,
      },
      {
        id: 'pointsBtn',
        label: 'Send Signal',
        text: 'Tap here to win points.',
        href: '/signal-room',
        type: 'link' as const,
      },
      {
        id: 'buyBtn',
        label: 'Buy the Book',
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

  const handleChangeAccount = useCallback(async () => {
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
    
    console.log('[contest] EnterContest click', { 
      hasIdentity, 
      contestEmail, 
      storedEmail, 
      storedUserId, 
      storedUserCode 
    });
    
    // If user has joined the contest, go to score page
    if (hasIdentity && statusLoaded && userHasJoinedContest) {
      router.push('/contest/score');
      return;
    }
    
    // If user has identity but hasn't joined yet, route normally
    if (hasIdentity && statusLoaded) {
      router.push(href);
      return;
    }
    
    // New user → show entry form
    setShowEntryFormForCheckout(true);
    // Scroll form into view
    setTimeout(() => {
      const formElement = document.querySelector('[data-contest-entry-form]');
      if (formElement) {
        formElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
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
          <p style={{ fontSize: '1rem', color: '#9ca3af' }}>
            You're in. Let's play.
          </p>
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
          className="ticker-text"
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
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-100%);
          }
        }
        
        .ticker-text {
          animation: ticker 20s linear infinite !important;
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