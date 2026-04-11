'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import type { SharePlatform, ShareVariant } from '@/lib/shareAssets';
import {
  getShareVariantMedia,
  parseSharePlatformParam,
  parseShareVariantParam,
} from '@/lib/shareAssets';
import { buildShareCaption } from '@/lib/shareCaption';
import type { ShareTarget } from '@/lib/shareTarget';
import { buildPlatformShareUrl, buildTrackingLink, buildFbPreviewUrl } from '@/lib/shareHelpers';
import { readContestEmail } from '@/lib/identity';
import { useDeviceProfile } from '@/hooks/useDeviceProfile';
import { ShareScaffold } from '@/components/share/ShareScaffold';
import { IGHelpPanel } from '@/components/IGHelpPanel';
import { JodyAssistant } from '@/components/JodyAssistant';
import HelpButton from '@/components/HelpButton';
import type { DeviceType } from '@/lib/device';
import { getSharePlan } from '@/lib/sharePlan';

const platformNames: Record<SharePlatform, string> = {
  fb: 'Facebook',
  ig: 'Instagram',
  x: 'X',
  tt: 'TikTok',
  truth: 'Truth Social',
};

type Props = { device?: DeviceType };

export default function ShareLandingClient({ device: serverDevice }: Props) {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const platform = parseSharePlatformParam(params.platform as string | string[] | undefined);
  const variant = parseShareVariantParam(params.variant as string | string[] | undefined);

  const refCode = searchParams.get('ref') || '';
  const target = (searchParams.get('target') as ShareTarget) || 'challenge';

  const { isMobile, isIOS, isAndroid, isInAppBrowser } = useDeviceProfile();
  // Server device takes precedence; fallback to client for hydration/legacy
  const device: DeviceType = serverDevice ?? (!isMobile ? 'desktop' : isIOS ? 'ios' : 'android');
  const [hasCopied, setHasCopied] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [videoDownloaded, setVideoDownloaded] = useState(false);
  const [backBonusAwarded, setBackBonusAwarded] = useState(false);
  const [preparingVideo, setPreparingVideo] = useState(false);
  const [ttFallbackMode, setTtFallbackMode] = useState(false);

  const [ttInitiating, setTtInitiating] = useState(false);
  const [ttDownloadStarted, setTtDownloadStarted] = useState(false);
  const [igInitiating, setIgInitiating] = useState(false);
  const [igDownloadStarted, setIgDownloadStarted] = useState(false);
  const [truthInitiating, setTruthInitiating] = useState(false);
  const [truthDownloadStarted, setTruthDownloadStarted] = useState(false);
  const [xInitiating, setXInitiating] = useState(false);
  const [xDownloadStarted, setXDownloadStarted] = useState(false);
  const [fbInitiating, setFbInitiating] = useState(false);
  const [fbDownloadStarted, setFbDownloadStarted] = useState(false);
  const [inAppBannerDismissed, setInAppBannerDismissed] = useState(false);
  const [copyToastVisible, setCopyToastVisible] = useState(false);
  const [fbPostVideoTipModal, setFbPostVideoTipModal] = useState(false);
  const [fbAndroidShareMethod, setFbAndroidShareMethod] = useState<'web-share' | 'download' | null>(null);

  // Explicit platform flags
  const isIG = platform === 'ig';
  const isX = platform === 'x';
  const isFB = platform === 'fb';
  const isTT = platform === 'tt';
  const isTruth = platform === 'truth';
  const needsManualUpload = isIG || isX || isTT || isTruth || isFB;

  const { video: videoUrl, thumbnail: thumbnailUrl } = getShareVariantMedia(platform, variant);

  useEffect(() => {
    const fetchUserInfo = async () => {
      const email = readContestEmail();
      if (!email) return;

      try {
        const res = await fetch('/api/associate/status', {
          headers: { 'X-User-Email': email },
        });
        if (res.ok) {
          const data = await res.json();
          setFirstName(data.firstName || null);
        }
      } catch (err) {
        console.warn('[share] Failed to fetch user info', err);
      }
    };

    fetchUserInfo();
  }, []);

  const baseUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_SITE_URL || '';

  const shareUrl = buildTrackingLink(platform, variant, refCode, target, baseUrl);

  const caption = buildShareCaption({
    firstName,
    refCode,
    shareUrl,
    includeSecretCode: target === 'terminal',
    platform,
  });

  const platformShareUrl = buildPlatformShareUrl(platform, shareUrl, caption);
  const fbPreviewUrl = buildFbPreviewUrl(variant, refCode, target, baseUrl);
  const fbShareDialogUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fbPreviewUrl)}`;

  // Device-aware: server device (or client fallback) drives FB flow
  const sharePlan = getSharePlan(platform, variant, device);
  const isFbDesktop = isFB && device === 'desktop';
  const isFbAndroid = isFB && device === 'android';
  const isFbIOS = isFB && device === 'ios';

  const handleCopyCaption = async () => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[share] Copy caption tapped');
    }
    try {
      await navigator.clipboard.writeText(caption);
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('dq_last_caption', caption);
      }
      setHasCopied(true);
      // Micro-toast for FB mobile: paste instruction
      if (isFB && (device === 'android' || device === 'ios')) {
        setCopyToastVisible(true);
        setTimeout(() => setCopyToastVisible(false), 4500);
      }
    } catch (err) {
      console.error('[share] Failed to copy', err);
      alert('Please select and copy the caption manually.');
    }
  };

  const doDownloadVideo = () => {
    if (isTT) {
      if (ttInitiating) return;
      setTtInitiating(true);
    } else if (isIG) {
      if (igInitiating) return;
      setIgInitiating(true);
    } else if (isTruth) {
      if (truthInitiating) return;
      setTruthInitiating(true);
    } else if (isX) {
      if (xInitiating) return;
      setXInitiating(true);
    } else if (isFB) {
      if (fbInitiating) return;
      setFbInitiating(true);
    }
    // TT/IG/Truth/X/FB: use API route with Content-Disposition: attachment for reliable iOS Save bar
    try {
      const href = isTT
        ? `/api/share/tt/video?variant=${variant}`
        : isIG
        ? `/api/share/ig/video?variant=${variant}`
        : isTruth
        ? `/api/share/truth/video?variant=${variant}`
        : isX
        ? `/api/share/x/video?variant=${variant}`
        : isFB
        ? `/api/share/fb/video?variant=${variant}`
        : videoUrl;
      const link = document.createElement('a');
      link.href = href;
      link.download = `agnes-protocol-${platform}-${variant}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setVideoDownloaded(true);
      if (isTT) setTtDownloadStarted(true);
      if (isIG) setIgDownloadStarted(true);
      if (isTruth) setTruthDownloadStarted(true);
      if (isX) setXDownloadStarted(true);
      if (isFB) setFbDownloadStarted(true);
    } finally {
      if (isTT) {
        setTimeout(() => setTtInitiating(false), 1500);
      }
      if (isIG) {
        setTimeout(() => setIgInitiating(false), 1500);
      }
      if (isTruth) {
        setTimeout(() => setTruthInitiating(false), 1500);
      }
      if (isX) {
        setTimeout(() => setXInitiating(false), 1500);
      }
      if (isFB) {
        setTimeout(() => setFbInitiating(false), 1500);
      }
    }
  };

  const handleDownloadVideo = () => {
    // Android FB: gentle guardrail if user taps Post Video before copying caption
    if (isFbAndroid && !hasCopied) {
      setFbPostVideoTipModal(true);
      return;
    }
    // Android FB: use share flow (Web Share → download fallback); iOS uses download
    if (isFbAndroid) {
      shareToFacebookAndroid();
      return;
    }
    doDownloadVideo();
  };

  /** Android-only: Post Video to Facebook — Web Share with file, then download fallback. iOS untouched. */
  const shareToFacebookAndroid = async () => {
    setFbInitiating(true);
    const videoApiUrl = `/api/share/fb/video?variant=${variant}`;
    try {
      // (1) Web Share with File — best chance for "Facebook opens with video attached"
      const res = await fetch(videoApiUrl);
      if (!res.ok) throw new Error('Video fetch failed');
      const blob = await res.blob();
      const file = new File([blob], `agnes-protocol-fb-${variant}.mp4`, { type: 'video/mp4' });

      if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        setFbAndroidShareMethod('web-share');
        setFbDownloadStarted(true);
        setVideoDownloaded(true);
        setTimeout(() => setFbInitiating(false), 1500);
        return;
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setTimeout(() => setFbInitiating(false), 500);
        return; // user cancelled share sheet
      }
      // fall through to download
    }

    // (2) Download fallback — share from Gallery/Downloads
    try {
      const link = document.createElement('a');
      link.href = videoApiUrl;
      link.download = `agnes-protocol-fb-${variant}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setFbAndroidShareMethod('download');
      setFbDownloadStarted(true);
      setVideoDownloaded(true);
    } finally {
      setTimeout(() => setFbInitiating(false), 1500);
    }
  };

  const buildInstructionsParams = () => {
    const params = new URLSearchParams();
    if (refCode) params.set('ref', refCode);
    if (target) params.set('target', target);
    if (target === 'terminal') params.set('secret', 'WhereIsJodyVernon');
    params.set('device', device);
    return params.toString();
  };

  const handleTikTokNext = () => {
    router.push(`/share/tt/${variant}/instructions?${buildInstructionsParams()}`);
  };

  const handleInstagramNext = () => {
    router.push(`/share/ig/${variant}/instructions?${buildInstructionsParams()}`);
  };

  const handleTruthNext = () => {
    router.push(`/share/truth/${variant}/instructions?${buildInstructionsParams()}`);
  };

  const handleXNext = () => {
    router.push(`/share/x/${variant}/instructions?${buildInstructionsParams()}`);
  };

  const handleFacebookNext = () => {
    const params = new URLSearchParams();
    if (refCode) params.set('ref', refCode);
    if (target) params.set('target', target);
    if (target === 'terminal') params.set('secret', 'WhereIsJodyVernon');
    params.set('device', device);
    const qs = params.toString();
    router.push(`/share/fb/${variant}/instructions?${qs}`);
  };

  // Desktop FB: one button — copy caption + open FB share with preview URL
  const handleDesktopFbPost = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      setHasCopied(true);
    } catch {
      alert('Please copy the caption manually.');
    }
    window.open(fbShareDialogUrl, '_blank', 'noopener,noreferrer');
  };

  // User-initiated open (no auto-redirect) - keeps Safari happy on iPhone
  const handleOpenPlatform = () => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[share] Open platform tapped (first tap)', { platform });
    }
    if (platform === 'x') {
      window.open('https://x.com/compose/post', '_blank', 'noopener,noreferrer');
    } else if (platform === 'fb') {
      // sharer.php - no login/OAuth, just share URL
      window.open(platformShareUrl, '_blank', 'noopener,noreferrer');
    } else {
      window.open(platformShareUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // iOS: optional native share sheet first (feels natural on iPhone)
  const handleNativeShare = async () => {
    if (typeof navigator.share === 'undefined') {
      handleOpenPlatform();
      return;
    }
    try {
      await navigator.share({
        title: 'The Agnes Protocol—Exclusive Preview',
        text: caption,
        url: shareUrl,
      });
      // User completed share - we can't detect, so prompt "I Shared"
      setHasCopied(true); // Treat as ready for I Shared
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('[share] Native share failed', err);
        handleOpenPlatform();
      }
    }
  };

  const awardBackToScoreBonus = async () => {
    if (backBonusAwarded) return;

    const email = readContestEmail();
    if (!email) return;

    try {
      const res = await fetch('/api/points/award', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': email,
        },
        body: JSON.stringify({
          action: 'share_x_back_to_score_bonus',
          source: 'share_page',
          targetVariant: target,
        }),
      });

      if (res.ok) {
        setBackBonusAwarded(true);
      }
    } catch (err) {
      console.warn('[share] Failed to award back bonus', err);
    }
  };

  const platformName = platformNames[platform];

  return (
    <ShareScaffold
      platform={platform}
      variant={variant}
      target={target}
      onBackToScore={platform === 'x' ? awardBackToScoreBonus : undefined}
      iSharedHint={isTT ? "Only tap after you've posted." : undefined}
    >
      {/* In-app browser (Gmail/FB/IG) banner: Open in Safari for downloads */}
      {isInAppBrowser && !inAppBannerDismissed && (
        <div
          style={{
            width: '100%',
            maxWidth: 640,
            marginBottom: '1.5rem',
            padding: '1rem 1.25rem',
            background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
            border: '1px solid rgba(59, 130, 246, 0.4)',
            borderRadius: 12,
            position: 'relative',
          }}
        >
          <button
            type="button"
            onClick={() => setInAppBannerDismissed(true)}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: 18,
              cursor: 'pointer',
              padding: 4,
              lineHeight: 1,
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '0.75rem', paddingRight: 28 }}>
            Best results: Open in Safari for TikTok sharing.
          </p>
          <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '1rem', lineHeight: 1.5 }}>
            Tap Share (⬆︎) in the top right → Open in Safari
          </p>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(typeof window !== 'undefined' ? window.location.href : '');
              } catch {
                // fallback: show URL
              }
            }}
            className="share-tap-target"
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: 8,
              border: '1px solid rgba(59, 130, 246, 0.5)',
              background: 'rgba(59, 130, 246, 0.2)',
              color: '#60a5fa',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            Copy Link
          </button>
        </div>
      )}

      <div
        style={{
          width: '100%',
          maxWidth: 640,
          marginBottom: '2rem',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <video
          src={videoUrl}
          poster={thumbnailUrl}
          controls
          autoPlay={false}
          loop
          muted
          playsInline
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            pointerEvents: isMobile && (preparingVideo || (isTT && ttInitiating) || (isIG && igInitiating) || (isTruth && truthInitiating) || (isX && xInitiating) || (isFB && fbInitiating)) ? 'none' : 'auto',
          }}
        />
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: 640,
          marginBottom: '2rem',
          padding: '1.5rem',
          background: 'rgba(15, 23, 42, 0.75)',
          border: '1px solid rgba(148, 163, 184, 0.3)',
          borderRadius: 12,
        }}
      >
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 600,
            color: '#cbd5e1',
            marginBottom: '0.75rem',
          }}
        >
          Your post caption:
        </label>
        <textarea
          readOnly
          value={caption}
          style={{
            width: '100%',
            minHeight: '120px',
            padding: '1rem',
            background: 'rgba(15, 23, 42, 0.5)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            borderRadius: 8,
            color: 'white',
            fontSize: '0.95rem',
            lineHeight: 1.6,
            fontFamily: 'inherit',
            resize: 'none',
          }}
        />
      </div>

      {/* Step Instructions */}
      {isIG || isTruth || isX || isFbIOS ? (
        <div
          style={{
            width: '100%',
            maxWidth: 640,
            marginBottom: '2rem',
            padding: '1.5rem',
            background: 'rgba(15, 23, 42, 0.5)',
            borderRadius: 12,
          }}
        >
          <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '1rem', lineHeight: 1.5 }}>
            Copy caption, download the video, then tap Next for step-by-step instructions.
          </p>
        </div>
      ) : isFbDesktop ? (
        <div
          style={{
            width: '100%',
            maxWidth: 640,
            marginBottom: '2rem',
            padding: '1.5rem',
            background: 'rgba(15, 23, 42, 0.5)',
            borderRadius: 12,
          }}
        >
          <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '1rem', lineHeight: 1.5 }}>
            Click the button below to copy your caption and open Facebook. Paste the caption into your post.
          </p>
        </div>
      ) : isFbAndroid ? (
        <div
          style={{
            width: '100%',
            maxWidth: 640,
            marginBottom: '2rem',
            padding: '1.5rem',
            background: 'rgba(15, 23, 42, 0.5)',
            borderRadius: 12,
          }}
        >
          <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '1rem', lineHeight: 1.5 }}>
            Copy caption and preview link. Paste both into Facebook and post.
          </p>
        </div>
      ) : isTT ? (
        /* TikTok: Mobile one-tap (native share w/ file) or fallback; Desktop = Download → Open TikTok */
        <div
          style={{
            width: '100%',
            maxWidth: 640,
            marginBottom: '2rem',
            padding: '1.5rem',
            background: 'rgba(15, 23, 42, 0.5)',
            borderRadius: 12,
          }}
        >
          <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '1rem', lineHeight: 1.5 }}>
            Copy caption, download the video, then tap Next for step-by-step instructions.
          </p>
        </div>
      ) : (
        <div
          style={{
            width: '100%',
            maxWidth: 640,
            marginBottom: '2rem',
            padding: '1.5rem',
            background: 'rgba(15, 23, 42, 0.5)',
            borderRadius: 12,
          }}
        >
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: hasCopied ? '#10b981' : '#3b82f6',
                  color: 'white',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  marginRight: '0.75rem',
                }}
              >
                {hasCopied ? '✓' : '1'}
              </span>
              <span style={{ fontSize: '1rem', color: hasCopied ? '#10b981' : 'white' }}>
                Click "Copy caption"
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: hasCopied ? '#3b82f6' : 'rgba(148, 163, 184, 0.3)',
                  color: 'white',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  marginRight: '0.75rem',
                }}
              >
                2
              </span>
              <span style={{ fontSize: '1rem', color: hasCopied ? 'white' : '#94a3b8' }}>
                Click "Open {platformName} to post"
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: 'rgba(148, 163, 184, 0.3)',
                  color: 'white',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  marginRight: '0.75rem',
                }}
              >
                3
              </span>
              <span style={{ fontSize: '1rem', color: '#94a3b8' }}>
                Paste and publish your post
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Top Copy caption: only for non-FB flows (FB has its own in device block) */}
      {!isTT && !isIG && !isTruth && !isX && !isFB && (
        <button
          type="button"
          onClick={handleCopyCaption}
          disabled={hasCopied}
          className="share-tap-target"
          style={{
            padding: '1rem 2.5rem',
            borderRadius: 999,
            border: 'none',
            background: hasCopied ? '#10b981' : '#3b82f6',
            color: 'white',
            fontSize: '1.1rem',
            fontWeight: 700,
            cursor: hasCopied ? 'not-allowed' : 'pointer',
            marginBottom: '1rem',
            minWidth: '200px',
            transition: 'all 0.2s',
            touchAction: 'manipulation',
          }}
        >
          {hasCopied ? '✓ Copied!' : 'Copy caption'}
        </button>
      )}

      {hasCopied && !needsManualUpload && (
        <p
          style={{
            fontSize: '0.95rem',
            color: '#10b981',
            marginBottom: '1.5rem',
            textAlign: 'center',
            maxWidth: 640,
          }}
        >
          Copied! Now paste this into {platformName} and post.
        </p>
      )}

      {needsManualUpload ? (
        <>
          {/* TikTok deterministic flow: Copy Caption, Download Video, Next */}
          {isTT && (
            <div style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                onClick={handleCopyCaption}
                disabled={ttInitiating}
                className="share-tap-target"
                style={{
                  padding: '1.25rem 2.5rem',
                  borderRadius: 16,
                  border: '1px solid rgba(148, 163, 184, 0.45)',
                  background: hasCopied ? '#10b981' : 'rgba(56, 239, 125, 0.1)',
                  color: hasCopied ? 'white' : '#38ef7d',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  cursor: ttInitiating ? 'not-allowed' : 'pointer',
                  marginBottom: '0.5rem',
                  minWidth: '240px',
                  transition: 'all 0.2s',
                  touchAction: 'manipulation',
                }}
              >
                {hasCopied ? '✓ Caption copied' : 'Copy Caption'}
              </button>
              {hasCopied && (
                <p style={{ fontSize: '1rem', color: '#10b981', fontWeight: 600, marginBottom: '1rem' }}>Caption copied ✅</p>
              )}

              <button
                type="button"
                onClick={handleDownloadVideo}
                disabled={ttInitiating}
                className="share-tap-target"
                style={{
                  padding: '1.25rem 2.5rem',
                  borderRadius: 16,
                  border: '1px solid rgba(148, 163, 184, 0.45)',
                  background: ttInitiating ? '#475569' : videoDownloaded ? '#10b981' : 'rgba(56, 239, 125, 0.1)',
                  color: ttInitiating ? '#94a3b8' : videoDownloaded ? 'white' : '#38ef7d',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  cursor: ttInitiating ? 'not-allowed' : 'pointer',
                  marginBottom: '0.5rem',
                  minWidth: '240px',
                  transition: 'all 0.2s',
                  touchAction: 'manipulation',
                }}
              >
                {videoDownloaded ? '✓ Video downloaded' : 'Download Video'}
              </button>
              {ttDownloadStarted && (
                <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '1rem', lineHeight: 1.5 }}>
                  Download started ✅
                  <br />
                  {isIOS ? (
                    <>If you see a bar at the bottom that says &quot;Save…&quot;, tap it.</>
                  ) : (
                    <>Swipe down → tap the download notification (or open Downloads).</>
                  )}
                </p>
              )}

              <button
                type="button"
                onClick={handleTikTokNext}
                disabled={ttInitiating}
                className="share-tap-target"
                style={{
                  padding: '1.25rem 2.5rem',
                  borderRadius: 16,
                  border: 'none',
                  background: ttInitiating ? '#475569' : 'linear-gradient(135deg, #ff0050 0%, #00f2ea 100%)',
                  color: 'white',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  cursor: ttInitiating ? 'not-allowed' : 'pointer',
                  marginBottom: '1rem',
                  minWidth: '240px',
                  transition: 'all 0.2s',
                  touchAction: 'manipulation',
                  boxShadow: '0 8px 24px rgba(255,0,80,0.35)',
                }}
              >
                Next: How to Post to TikTok
              </button>
            </div>
          )}

          {/* Instagram deterministic flow: Copy Caption, Download Video, Next */}
          {isIG && (
            <div style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                onClick={handleCopyCaption}
                disabled={igInitiating}
                className="share-tap-target"
                style={{
                  padding: '1.25rem 2.5rem',
                  borderRadius: 16,
                  border: '1px solid rgba(148, 163, 184, 0.45)',
                  background: hasCopied ? '#10b981' : 'rgba(56, 239, 125, 0.1)',
                  color: hasCopied ? 'white' : '#38ef7d',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  cursor: igInitiating ? 'not-allowed' : 'pointer',
                  marginBottom: '0.5rem',
                  minWidth: '240px',
                  transition: 'all 0.2s',
                  touchAction: 'manipulation',
                }}
              >
                {hasCopied ? '✓ Caption copied' : 'Copy Caption'}
              </button>
              {hasCopied && (
                <p style={{ fontSize: '1rem', color: '#10b981', fontWeight: 600, marginBottom: '1rem' }}>Caption copied ✅</p>
              )}

              <button
                type="button"
                onClick={handleDownloadVideo}
                disabled={igInitiating}
                className="share-tap-target"
                style={{
                  padding: '1.25rem 2.5rem',
                  borderRadius: 16,
                  border: '1px solid rgba(148, 163, 184, 0.45)',
                  background: igInitiating ? '#475569' : videoDownloaded ? '#10b981' : 'rgba(56, 239, 125, 0.1)',
                  color: igInitiating ? '#94a3b8' : videoDownloaded ? 'white' : '#38ef7d',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  cursor: igInitiating ? 'not-allowed' : 'pointer',
                  marginBottom: '0.5rem',
                  minWidth: '240px',
                  transition: 'all 0.2s',
                  touchAction: 'manipulation',
                }}
              >
                {videoDownloaded ? '✓ Video downloaded' : 'Download Video'}
              </button>
              {igDownloadStarted && (
                <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '1rem', lineHeight: 1.5 }}>
                  Download started ✅
                  <br />
                  {isIOS ? (
                    <>If you see a bar at the bottom that says &quot;Save…&quot;, tap it.</>
                  ) : (
                    <>Swipe down → tap the download notification (or open Downloads).</>
                  )}
                </p>
              )}

              <button
                type="button"
                onClick={handleInstagramNext}
                disabled={igInitiating}
                className="share-tap-target"
                style={{
                  padding: '1.25rem 2.5rem',
                  borderRadius: 16,
                  border: 'none',
                  background: igInitiating ? '#475569' : 'linear-gradient(135deg, #e4405f 0%, #405de6 50%, #5851db 100%)',
                  color: 'white',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  cursor: igInitiating ? 'not-allowed' : 'pointer',
                  marginBottom: '1rem',
                  minWidth: '240px',
                  transition: 'all 0.2s',
                  touchAction: 'manipulation',
                  boxShadow: '0 8px 24px rgba(228,64,95,0.35)',
                }}
              >
                Next: How to Post to Instagram
              </button>
            </div>
          )}

          {/* Truth Social deterministic flow: Copy Caption, Download Video, Next */}
          {isTruth && (
            <div style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                onClick={handleCopyCaption}
                disabled={truthInitiating}
                className="share-tap-target"
                style={{
                  padding: '1.25rem 2.5rem',
                  borderRadius: 16,
                  border: '1px solid rgba(148, 163, 184, 0.45)',
                  background: hasCopied ? '#10b981' : 'rgba(56, 239, 125, 0.1)',
                  color: hasCopied ? 'white' : '#38ef7d',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  cursor: truthInitiating ? 'not-allowed' : 'pointer',
                  marginBottom: '0.5rem',
                  minWidth: '240px',
                  transition: 'all 0.2s',
                  touchAction: 'manipulation',
                }}
              >
                {hasCopied ? '✓ Caption copied' : 'Copy Caption'}
              </button>
              {hasCopied && (
                <p style={{ fontSize: '1rem', color: '#10b981', fontWeight: 600, marginBottom: '1rem' }}>Caption copied ✅</p>
              )}

              <button
                type="button"
                onClick={handleDownloadVideo}
                disabled={truthInitiating}
                className="share-tap-target"
                style={{
                  padding: '1.25rem 2.5rem',
                  borderRadius: 16,
                  border: '1px solid rgba(148, 163, 184, 0.45)',
                  background: truthInitiating ? '#475569' : videoDownloaded ? '#10b981' : 'rgba(56, 239, 125, 0.1)',
                  color: truthInitiating ? '#94a3b8' : videoDownloaded ? 'white' : '#38ef7d',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  cursor: truthInitiating ? 'not-allowed' : 'pointer',
                  marginBottom: '0.5rem',
                  minWidth: '240px',
                  transition: 'all 0.2s',
                  touchAction: 'manipulation',
                }}
              >
                {videoDownloaded ? '✓ Video downloaded' : 'Download Video'}
              </button>
              {truthDownloadStarted && (
                <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '1rem', lineHeight: 1.5 }}>
                  Download started ✅
                  <br />
                  {isIOS ? (
                    <>If you see a bar at the bottom that says &quot;Save…&quot;, tap it.</>
                  ) : (
                    <>Swipe down → tap the download notification (or open Downloads).</>
                  )}
                </p>
              )}

              <button
                type="button"
                onClick={handleTruthNext}
                disabled={truthInitiating}
                className="share-tap-target"
                style={{
                  padding: '1.25rem 2.5rem',
                  borderRadius: 16,
                  border: 'none',
                  background: truthInitiating ? '#475569' : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  color: 'white',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  cursor: truthInitiating ? 'not-allowed' : 'pointer',
                  marginBottom: '1rem',
                  minWidth: '240px',
                  transition: 'all 0.2s',
                  touchAction: 'manipulation',
                  boxShadow: '0 8px 24px rgba(99,102,241,0.35)',
                }}
              >
                Next: How to Post to Truth Social
              </button>
            </div>
          )}

          {/* X deterministic flow: Copy Caption, Download Video, Next */}
          {isX && (
            <div style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                onClick={handleCopyCaption}
                disabled={xInitiating}
                className="share-tap-target"
                style={{
                  padding: '1.25rem 2.5rem',
                  borderRadius: 16,
                  border: '1px solid rgba(148, 163, 184, 0.45)',
                  background: hasCopied ? '#10b981' : 'rgba(56, 239, 125, 0.1)',
                  color: hasCopied ? 'white' : '#38ef7d',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  cursor: xInitiating ? 'not-allowed' : 'pointer',
                  marginBottom: '0.5rem',
                  minWidth: '240px',
                  transition: 'all 0.2s',
                  touchAction: 'manipulation',
                }}
              >
                {hasCopied ? '✓ Caption copied' : 'Copy Caption'}
              </button>
              {hasCopied && (
                <p style={{ fontSize: '1rem', color: '#10b981', fontWeight: 600, marginBottom: '1rem' }}>Caption copied ✅</p>
              )}

              <button
                type="button"
                onClick={handleDownloadVideo}
                disabled={xInitiating}
                className="share-tap-target"
                style={{
                  padding: '1.25rem 2.5rem',
                  borderRadius: 16,
                  border: '1px solid rgba(148, 163, 184, 0.45)',
                  background: xInitiating ? '#475569' : videoDownloaded ? '#10b981' : 'rgba(56, 239, 125, 0.1)',
                  color: xInitiating ? '#94a3b8' : videoDownloaded ? 'white' : '#38ef7d',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  cursor: xInitiating ? 'not-allowed' : 'pointer',
                  marginBottom: '0.5rem',
                  minWidth: '240px',
                  transition: 'all 0.2s',
                  touchAction: 'manipulation',
                }}
              >
                {videoDownloaded ? '✓ Video downloaded' : 'Download Video'}
              </button>
              {xDownloadStarted && (
                <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '1rem', lineHeight: 1.5 }}>
                  Download started ✅
                  <br />
                  {isIOS ? (
                    <>If you see a bar at the bottom that says &quot;Save…&quot;, tap it.</>
                  ) : (
                    <>Swipe down → tap the download notification (or open Downloads).</>
                  )}
                </p>
              )}

              <button
                type="button"
                onClick={handleXNext}
                disabled={xInitiating}
                className="share-tap-target"
                style={{
                  padding: '1.25rem 2.5rem',
                  borderRadius: 16,
                  border: 'none',
                  background: xInitiating ? '#475569' : 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
                  color: 'white',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  cursor: xInitiating ? 'not-allowed' : 'pointer',
                  marginBottom: '1rem',
                  minWidth: '240px',
                  transition: 'all 0.2s',
                  touchAction: 'manipulation',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                }}
              >
                Next: How to Post to X
              </button>
            </div>
          )}

          {/* Facebook Desktop: one button — copy caption + open FB share with preview */}
          {isFbDesktop && (
            <div style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                onClick={handleDesktopFbPost}
                className="share-tap-target"
                style={{
                  padding: '1.25rem 2.5rem',
                  borderRadius: 16,
                  border: 'none',
                  background: 'linear-gradient(135deg, #1877f2 0%, #0d5bb5 100%)',
                  color: 'white',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  marginBottom: '1rem',
                  minWidth: '240px',
                  transition: 'all 0.2s',
                  touchAction: 'manipulation',
                  boxShadow: '0 8px 24px rgba(24,119,242,0.35)',
                }}
              >
                Post to Facebook
              </button>
              {hasCopied && (
                <p style={{ fontSize: '1rem', color: '#10b981', fontWeight: 600, marginBottom: '1rem' }}>Caption copied ✅ Paste into Facebook.</p>
              )}
            </div>
          )}

          {/* Facebook Android: Copy Caption, Post Video to Facebook, Next (2 taps + paste + post) */}
          {isFbAndroid && (
            <div style={{ marginBottom: '1rem' }}>
              <p
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#10b981',
                  marginBottom: '1rem',
                  letterSpacing: '0.02em',
                }}
              >
                Android • Fast Post
              </p>
              <button
                type="button"
                onClick={handleCopyCaption}
                disabled={fbInitiating}
                className="share-tap-target"
                style={{
                  padding: '1.25rem 2.5rem',
                  borderRadius: 16,
                  border: '1px solid rgba(16, 185, 129, 0.5)',
                  background: hasCopied ? '#10b981' : 'rgba(16, 185, 129, 0.12)',
                  color: hasCopied ? 'white' : '#059669',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  cursor: fbInitiating ? 'not-allowed' : 'pointer',
                  marginBottom: '0.5rem',
                  minWidth: '240px',
                  transition: 'all 0.2s',
                  touchAction: 'manipulation',
                }}
              >
                {hasCopied ? '✓ Caption copied' : 'Copy Caption'}
              </button>

              <button
                type="button"
                onClick={handleDownloadVideo}
                disabled={fbInitiating}
                className="share-tap-target"
                style={{
                  padding: '1.25rem 2.5rem',
                  borderRadius: 16,
                  border: '1px solid rgba(16, 185, 129, 0.5)',
                  background: fbInitiating ? '#475569' : videoDownloaded ? '#10b981' : 'rgba(16, 185, 129, 0.12)',
                  color: fbInitiating ? '#94a3b8' : videoDownloaded ? 'white' : '#059669',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  cursor: fbInitiating ? 'not-allowed' : 'pointer',
                  marginBottom: '0.25rem',
                  minWidth: '240px',
                  transition: 'all 0.2s',
                  touchAction: 'manipulation',
                }}
              >
                {videoDownloaded ? '✓ Video ready' : 'Post Video to Facebook'}
              </button>
              <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.75rem', lineHeight: 1.4 }}>
                Facebook opens with the video attached — press & hold → Paste.
              </p>
              {fbDownloadStarted && (
                <p style={{ fontSize: '0.9rem', color: '#10b981', marginBottom: '1rem', lineHeight: 1.5 }}>
                  {fbAndroidShareMethod === 'download'
                    ? '✅ Video saved. Open Gallery/Downloads and share to Facebook.'
                    : '✅ Paste the caption and tap Post.'}
                </p>
              )}

              <button
                type="button"
                onClick={handleFacebookNext}
                disabled={fbInitiating}
                className="share-tap-target"
                style={{
                  padding: '1.25rem 2.5rem',
                  borderRadius: 16,
                  border: 'none',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  cursor: fbInitiating ? 'not-allowed' : 'pointer',
                  marginBottom: '1rem',
                  minWidth: '240px',
                  transition: 'all 0.2s',
                  touchAction: 'manipulation',
                  boxShadow: '0 8px 24px rgba(16,185,129,0.35)',
                }}
              >
                Next: How to Post to Facebook
              </button>
            </div>
          )}

          {/* Facebook iOS: Copy Caption, Download Video, Next (Files Share flow) */}
          {isFbIOS && (
            <div style={{ marginBottom: '1rem' }}>
              <p
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#007AFF',
                  marginBottom: '1rem',
                  letterSpacing: '0.02em',
                }}
              >
                iPhone • Files Share
              </p>
              <button
                type="button"
                onClick={handleCopyCaption}
                disabled={fbInitiating}
                className="share-tap-target"
                style={{
                  padding: '1.25rem 2.5rem',
                  borderRadius: 16,
                  border: '1px solid rgba(0, 122, 255, 0.5)',
                  background: hasCopied ? '#007AFF' : 'rgba(0, 122, 255, 0.1)',
                  color: hasCopied ? 'white' : '#007AFF',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  cursor: fbInitiating ? 'not-allowed' : 'pointer',
                  marginBottom: '0.5rem',
                  minWidth: '240px',
                  transition: 'all 0.2s',
                  touchAction: 'manipulation',
                }}
              >
                {hasCopied ? '✓ Caption copied' : 'Copy Caption'}
              </button>

              <button
                type="button"
                onClick={handleDownloadVideo}
                disabled={fbInitiating}
                className="share-tap-target"
                style={{
                  padding: '1.25rem 2.5rem',
                  borderRadius: 16,
                  border: '1px solid rgba(0, 122, 255, 0.5)',
                  background: fbInitiating ? '#475569' : videoDownloaded ? '#007AFF' : 'rgba(0, 122, 255, 0.1)',
                  color: fbInitiating ? '#94a3b8' : videoDownloaded ? 'white' : '#007AFF',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  cursor: fbInitiating ? 'not-allowed' : 'pointer',
                  marginBottom: '0.5rem',
                  minWidth: '240px',
                  transition: 'all 0.2s',
                  touchAction: 'manipulation',
                }}
              >
                {videoDownloaded ? '✓ Video downloaded' : 'Download Video'}
              </button>
              {fbDownloadStarted && (
                <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '1rem', lineHeight: 1.5 }}>
                  Download started ✅
                  <br />
                  If you see a bar at the bottom that says &quot;Save…&quot;, tap it.
                </p>
              )}

              <button
                type="button"
                onClick={handleFacebookNext}
                disabled={fbInitiating}
                className="share-tap-target"
                style={{
                  padding: '1.25rem 2.5rem',
                  borderRadius: 16,
                  border: 'none',
                  background: fbInitiating ? '#475569' : 'linear-gradient(135deg, #007AFF 0%, #0051D5 100%)',
                  color: 'white',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  cursor: fbInitiating ? 'not-allowed' : 'pointer',
                  marginBottom: '1rem',
                  minWidth: '240px',
                  transition: 'all 0.2s',
                  touchAction: 'manipulation',
                  boxShadow: '0 8px 24px rgba(0,122,255,0.35)',
                }}
              >
                Next: How to Post to Facebook
              </button>
            </div>
          )}

        </>
      ) : (
        <button
          type="button"
          onClick={handleOpenPlatform}
          disabled={!hasCopied}
          className="share-tap-target"
          style={{
            padding: '1rem 2.5rem',
            borderRadius: 999,
            border: '1px solid rgba(148, 163, 184, 0.45)',
            background: hasCopied ? 'rgba(56, 239, 125, 0.1)' : 'transparent',
            color: hasCopied ? '#38ef7d' : '#94a3b8',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: hasCopied ? 'pointer' : 'not-allowed',
            marginBottom: '1rem',
            minWidth: '200px',
            transition: 'all 0.2s',
            touchAction: 'manipulation',
          }}
        >
          Open {platformName} to post
        </button>
      )}

      {/* Toast: paste instruction after Copy Caption (FB mobile) */}
      {copyToastVisible && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: 'max(1.5rem, env(safe-area-inset-bottom))',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '1rem 1.5rem',
            borderRadius: 12,
            background: '#1a1a1a',
            color: '#fff',
            fontSize: '0.95rem',
            fontWeight: 500,
            lineHeight: 1.4,
            maxWidth: 'calc(100vw - 3rem)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            zIndex: 9999,
          }}
        >
          ✅ Caption copied.
          <br />
          In Facebook, press and hold in the text box to Paste.
        </div>
      )}

      {/* Modal: Post Video before Copy Caption (Android FB) */}
      {fbPostVideoTipModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '1.5rem',
          }}
          onClick={() => setFbPostVideoTipModal(false)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: '1.5rem',
              maxWidth: 320,
              boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', lineHeight: 1.5 }}>
              Quick tip
            </p>
            <p style={{ fontSize: '0.95rem', color: '#6b7280', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Tap Copy Caption first so it&apos;s ready to paste in Facebook.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
              <button
                type="button"
                onClick={() => {
                  handleCopyCaption();
                  setFbPostVideoTipModal(false);
                }}
                style={{
                  padding: '1rem 1.5rem',
                  borderRadius: 12,
                  border: 'none',
                  background: '#10b981',
                  color: '#fff',
                  fontSize: '1rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Copy Caption
              </button>
              <button
                type="button"
                onClick={() => {
                  setFbPostVideoTipModal(false);
                  shareToFacebookAndroid();
                }}
                style={{
                  padding: '1rem 1.5rem',
                  borderRadius: 12,
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  color: '#6b7280',
                  fontSize: '1rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {platform === 'ig' && <IGHelpPanel />}

      {(platform === 'ig' || platform === 'x' || platform === 'tt') && (
        <JodyAssistant
          variant={
            platform === 'x' ? 'em2' : platform === 'tt' ? 'tiktok' : 'ig'
          }
          autoShowDelayMs={4000}
          isSharePage
        />
      )}
      <HelpButton />
    </ShareScaffold>
  );
}
