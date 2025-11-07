"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { withUtm, shareTargets, baseUrl, withParams, buildShareMessage } from "@/lib/share";
import { getAssociate } from "@/lib/profile";
import ShareGuardModal from "@/components/ShareGuardModal";
import type { Associate } from "@/types/contest";

type PointsResponse = {
  total: number;
  firstName: string | null;
  earned: { purchase_book: boolean };
};

export default function BadgePage() {
  const searchParams = useSearchParams();
  const sid = searchParams.get("sid");

  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState<number>(0);
  const [earnedPurchase, setEarnedPurchase] = useState<boolean>(false);
  const [confirmed, setConfirmed] = useState<boolean>(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [associate, setAssociate] = useState<Associate | null>(null);
  const [shareModal, setShareModal] = useState<{ platform: 'facebook' | 'x' | 'instagram' | 'tiktok' | 'truth'; pendingAction: () => void } | null>(null);
  const [sharedToast, setSharedToast] = useState<string | null>(null);

  // Determine referral code from localStorage or URL
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const codeFromUrl = searchParams.get('code') || searchParams.get('ref');
    const codeFromStorage = localStorage.getItem('ap_code');
    setReferralCode(codeFromUrl || codeFromStorage || null);
  }, [searchParams]);

  // Load associate profile
  useEffect(() => {
    getAssociate().then(setAssociate).catch(() => {});
  }, []);

  // Handle post-share return (?shared=platform)
  useEffect(() => {
    const shared = searchParams.get('shared');
    if (shared) {
      const platform = shared.toLowerCase();
      const platformLabels: Record<string, string> = {
        facebook: 'Facebook',
        x: 'X',
        instagram: 'Instagram',
        tiktok: 'TikTok',
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

      setSharedToast(alreadyAwarded 
        ? `Thanks for sharing on ${label}! You've already earned points today.`
        : `Thanks for sharing on ${label}! +100 if you hadn't already today.`
      );

      // Clear toast after 5 seconds
      setTimeout(() => setSharedToast(null), 5000);
    }
  }, [searchParams]);

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

  // Helper to initiate share after guard check
  const initiateShare = (platform: 'facebook' | 'x' | 'instagram' | 'tiktok' | 'truth', shareUrl: string) => {
    // Navigate in same tab to avoid popup blocking
    window.location.href = shareUrl;
  };

  const actions = useMemo(
    () => [
      {
        label: "Bought the Book",
        pts: 500,
        href: undefined as string | undefined,
        earned: earnedPurchase,
      },
      { label: "Joined the Contest", pts: 250, href: "/contest", earned: false },
      { label: "Shared to X", pts: 100, href: "/share/x", earned: false },
      { label: "Shared to Instagram", pts: 100, href: "/share/ig", earned: false },
      { label: "Referred a Friend", pts: 200, href: "/contest/referral", earned: false },
      { label: "Weekly Digest Opt-in", pts: 50, href: "/subscribe", earned: false },
    ],
    [earnedPurchase]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/points/me", { cache: "no-store" });
        if (!res.ok) throw new Error("failed");
        const data: PointsResponse = await res.json();
        if (cancelled) return;
        setTotal(data.total);
        setEarnedPurchase(Boolean(data.earned?.purchase_book));
        if (sid) setConfirmed(true);
        // Keep localStorage in sync for fallback scenarios
        try {
          localStorage.setItem("points_total", String(data.total ?? 0));
          localStorage.setItem(
            "earned_purchase_book",
            String(Boolean(data.earned?.purchase_book))
          );
        } catch {}
      } catch {
        // Fallback to localStorage
        let localTotal = 0;
        let localEarnedPurchase = false;
        try {
          const stored = Number(localStorage.getItem("points_total") ?? "0");
          localTotal = Number.isFinite(stored) ? stored : 0;
          localEarnedPurchase = localStorage.getItem("earned_purchase_book") === "true";
        } catch {}

        if (sid) {
          // Confirmed purchase via return URL; award points locally
          localTotal += 500;
          localEarnedPurchase = true;
          setConfirmed(true);
          try {
            localStorage.setItem("points_total", String(localTotal));
            localStorage.setItem("earned_purchase_book", "true");
          } catch {}
        }
        if (!cancelled) {
          setTotal(localTotal);
          setEarnedPurchase(localEarnedPurchase);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [sid]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Your Badge</h1>

      {confirmed && (
        <div className="mt-4 rounded-md border border-green-300 bg-green-50 px-4 py-3 text-green-800">
          Thanks! Your purchase was confirmed and points were added.
        </div>
      )}

      <div className="mt-6 rounded-lg border bg-white p-5 shadow-sm">
        <div className="text-sm text-gray-600">Total Points</div>
        <div className="mt-1 text-4xl font-bold">
          {loading ? <span className="animate-pulse text-gray-400">…</span> : total}
        </div>
      </div>

      <div className="mt-8 space-y-2">
        {actions.map((a, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between rounded-md border bg-white px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <div
                className={
                  "h-2.5 w-2.5 rounded-full " +
                  (a.earned ? "bg-green-500" : "bg-gray-300")
                }
                aria-hidden
              />
              <div className="font-medium">{a.label}</div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">{a.pts} pts</div>
              {a.href ? (
                <a
                  href={a.href}
                  className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Do it
                </a>
              ) : (
                <span className="text-sm text-gray-400">—</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-lg border bg-white p-6">
        <div className="text-lg font-semibold">You're almost in first place.</div>
        <p className="mt-2 text-gray-700">
          There's a hidden challenge worth 1,000+ bonus points. Catch the rabbit.
        </p>
        <a
          href="/contest/rabbit"
          className="mt-4 inline-flex rounded-md bg-black px-4 py-2 text-white hover:opacity-90"
        >
          Catch the Rabbit
        </a>
      </div>

      {/* Shared Toast */}
      {sharedToast && (
        <div className="fixed top-4 right-4 z-50 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-green-800 shadow-lg max-w-md">
          {sharedToast}
        </div>
      )}

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

      {/* Share Section */}
      <div className="mt-8 rounded-lg border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Share Your Badge</h2>
        {referralCode && (
          <p className="text-sm text-gray-600 mb-4">
            Your code: <strong>{referralCode}</strong> (15% off)
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          {typeof navigator !== "undefined" && navigator.share ? (
            <button
              onClick={async () => {
                try {
                  const shareUrl = withParams("/", {
                    ref: referralCode || '',
                    code: referralCode || '',
                    utm_source: 'native',
                    utm_medium: 'share',
                    utm_campaign: 'ap_referral',
                  });
                  const shareMessage = buildShareMessage({ code: referralCode || undefined });
                  await navigator.share({
                    title: "The Agnes Protocol — The End of Truth Begins Here",
                    text: shareMessage,
                    url: shareUrl,
                  });
                } catch (err) {
                  // User cancelled or error
                }
              }}
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Share
            </button>
          ) : null}
          <button
            onClick={async () => {
              const shareUrl = shareTargets.facebook(
                withParams("/", {
                  ref: referralCode || '',
                  code: referralCode || '',
                  utm_source: 'facebook',
                  utm_medium: 'social',
                  utm_campaign: 'ap_referral',
                })
              );
              const returnUrl = `${baseUrl()}/badge?shared=facebook`;
              const finalUrl = shareUrl.includes('?') 
                ? `${shareUrl}&redirect_uri=${encodeURIComponent(returnUrl)}`
                : `${shareUrl}?redirect_uri=${encodeURIComponent(returnUrl)}`;
              
              if (!hasHandle('facebook')) {
                setShareModal({
                  platform: 'facebook',
                  pendingAction: () => initiateShare('facebook', finalUrl),
                });
              } else {
                initiateShare('facebook', finalUrl);
              }
            }}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Share to Facebook
          </button>
          <button
            onClick={async () => {
              const shareUrl = shareTargets.x(
                withParams("/", {
                  ref: referralCode || '',
                  code: referralCode || '',
                  utm_source: 'twitter',
                  utm_medium: 'social',
                  utm_campaign: 'ap_referral',
                }),
                buildShareMessage({ code: referralCode || undefined })
              );
              const returnUrl = `${baseUrl()}/badge?shared=x`;
              const finalUrl = shareUrl.includes('?') 
                ? `${shareUrl}&redirect_uri=${encodeURIComponent(returnUrl)}`
                : `${shareUrl}?redirect_uri=${encodeURIComponent(returnUrl)}`;
              
              if (!hasHandle('x')) {
                setShareModal({
                  platform: 'x',
                  pendingAction: () => initiateShare('x', finalUrl),
                });
              } else {
                initiateShare('x', finalUrl);
              }
            }}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Share to X
          </button>
          <button
            onClick={async () => {
              const ORIGIN = typeof window !== "undefined" ? window.location.origin : baseUrl();
              
              const shareAction = async () => {
                const captions = [
                  "The Agnes Protocol — The End of Truth Begins Here. #WhereIsJodyVernon",
                  "This story will get under your skin. #AgnesProtocol",
                  "Big tech. Dark money. One con man who might save us all. #TheAgnesProtocol",
                ];
                
                // Rotate caption index (like score page)
                let capIdx = 0;
                try {
                  const stored = Number(localStorage.getItem("badge_ig_cap_idx") || "0");
                  const nextCapIdx = (stored + 1) % captions.length;
                  localStorage.setItem("badge_ig_cap_idx", String(nextCapIdx));
                  capIdx = stored % captions.length;
                } catch {}
                
                // Rotate video index (for helper page param)
                let iParam = 1;
                try {
                  const vIdx = Number(localStorage.getItem("badge_ig_vid_idx") || "0");
                  const nextVIdx = (vIdx + 1) % 3;
                  localStorage.setItem("badge_ig_vid_idx", String(nextVIdx));
                  iParam = (vIdx % 3) + 1;
                } catch {}
                
                // Build caption with landing URL (using /s/fb for OG preview) and referral code
                const landingUrl = withParams(`${ORIGIN}/s/fb`, {
                  v: String((capIdx % 3) + 1),
                  utm_source: 'instagram',
                  utm_medium: 'social',
                  utm_campaign: 'ap_referral',
                  ref: referralCode || '',
                  code: referralCode || '',
                });
                const caption = buildShareMessage({ code: referralCode || undefined });
                
                // Copy caption
                try {
                  await navigator.clipboard.writeText(caption);
                } catch {}
                
                // Open helper page in same tab
                window.location.href = `${ORIGIN}/s/ig?i=${iParam}&return=${encodeURIComponent(`${baseUrl()}/badge?shared=instagram`)}`;
              };

              if (!hasHandle('instagram')) {
                setShareModal({
                  platform: 'instagram',
                  pendingAction: shareAction,
                });
              } else {
                await shareAction();
              }
            }}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Share to Instagram
          </button>
          <a
            href={shareTargets.linkedin(
              withParams("/", {
                ref: referralCode || '',
                code: referralCode || '',
                utm_source: 'linkedin',
                utm_medium: 'social',
                utm_campaign: 'ap_referral',
              })
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Share to LinkedIn
          </a>
          <button
            onClick={async () => {
              const ORIGIN = typeof window !== "undefined" ? window.location.origin : baseUrl();
              
              const shareAction = async () => {
                const captions = [
                  "The Agnes Protocol — The End of Truth Begins Here. #WhereIsJodyVernon",
                  "This story will get under your skin. #AgnesProtocol",
                  "Big tech. Dark money. One con man who might save us all. #TheAgnesProtocol",
                ];
                
                // Rotate caption index (like score page)
                let capIdx = 0;
                try {
                  const stored = Number(localStorage.getItem("badge_tt_cap_idx") || "0");
                  const nextCapIdx = (stored + 1) % captions.length;
                  localStorage.setItem("badge_tt_cap_idx", String(nextCapIdx));
                  capIdx = stored % captions.length;
                } catch {}
                
                // Rotate video index (for helper page param)
                let iParam = 1;
                try {
                  const vIdx = Number(localStorage.getItem("badge_tt_vid_idx") || "0");
                  const nextVIdx = (vIdx + 1) % 3;
                  localStorage.setItem("badge_tt_vid_idx", String(nextVIdx));
                  iParam = (vIdx % 3) + 1;
                } catch {}
                
                // Build caption with landing URL (using /s/fb for OG preview) and referral code
                const landingUrl = withParams(`${ORIGIN}/s/fb`, {
                  v: String((capIdx % 3) + 1),
                  utm_source: 'tiktok',
                  utm_medium: 'social',
                  utm_campaign: 'ap_referral',
                  ref: referralCode || '',
                  code: referralCode || '',
                });
                const caption = buildShareMessage({ code: referralCode || undefined });
                
                // Copy caption
                try {
                  await navigator.clipboard.writeText(caption);
                } catch {}
                
                // Open helper page in same tab
                window.location.href = `${ORIGIN}/s/tt?i=${iParam}&return=${encodeURIComponent(`${baseUrl()}/badge?shared=tiktok`)}`;
              };

              if (!hasHandle('tiktok')) {
                setShareModal({
                  platform: 'tiktok',
                  pendingAction: shareAction,
                });
              } else {
                await shareAction();
              }
            }}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Share to TikTok
          </button>
        </div>
        <p className="mt-4 text-xs text-gray-500">
          You'll be asked to log in to the platform if you aren't already.
        </p>
      </div>
    </div>
  );
}


