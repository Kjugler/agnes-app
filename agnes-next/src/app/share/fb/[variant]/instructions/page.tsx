'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { buildShareCaption } from '@/lib/shareCaption';
import { buildTrackingLink, buildFbPreviewUrl } from '@/lib/shareHelpers';
import { readContestEmail } from '@/lib/identity';
import { getFbInstructionsVideoSrc } from '@/lib/trainingVideoUrl';
import { useDeviceProfile } from '@/hooks/useDeviceProfile';
import type { ShareTarget } from '@/lib/shareTarget';

function InstructionsContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const variantRaw = Number(params.variant) || 1;
  const variant = (variantRaw >= 1 && variantRaw <= 3 ? variantRaw : 1) as 1 | 2 | 3;
  const refCode = searchParams.get('ref') || '';
  const target = (searchParams.get('target') as ShareTarget) || 'challenge';

  const { isIOS } = useDeviceProfile();
  const [firstName, setFirstName] = useState<string | null>(null);
  const [captionCopied, setCaptionCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [previewLinkCopied, setPreviewLinkCopied] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [pointsAwarded, setPointsAwarded] = useState(false);
  const [awarding, setAwarding] = useState(false);
  // Device from ?device= (share page passes it) or UA fallback
  const deviceParam = searchParams.get('device');
  const initialTab: 'ios' | 'android' =
    deviceParam === 'android' ? 'android' : deviceParam === 'ios' ? 'ios' : 'ios';
  const [activeTab, setActiveTab] = useState<'ios' | 'android'>(initialTab);
  const [videoLoadError, setVideoLoadError] = useState(false);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL || '';
  const shareUrl = buildTrackingLink('fb', variant, refCode, target, baseUrl);
  const fbPreviewUrl = buildFbPreviewUrl(variant, refCode, target, baseUrl);
  const caption = buildShareCaption({
    firstName,
    refCode,
    shareUrl,
    includeSecretCode: target === 'terminal',
    platform: 'fb',
  });

  useEffect(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const deviceFromUrl = searchParams.get('device');
    if (deviceFromUrl === 'ios' || deviceFromUrl === 'android') {
      setActiveTab(deviceFromUrl);
    } else {
      setActiveTab(/iPhone|iPad|iPod/.test(ua) ? 'ios' : 'android');
    }
  }, [searchParams]);

  useEffect(() => {
    setVideoLoadError(false);
  }, [activeTab]);

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
        console.warn('[share/fb/instructions] Failed to fetch user info', err);
      }
    };
    fetchUserInfo();
  }, []);

  const handleCopyCaption = async () => {
    setCopyFailed(false);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(caption);
        setCaptionCopied(true);
        return;
      }
    } catch {
      // Fall through to execCommand
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = caption;
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) {
        setCaptionCopied(true);
      } else {
        setCopyFailed(true);
      }
    } catch {
      setCopyFailed(true);
    }
  };

  const handleCopyPreviewLink = async () => {
    setCopyFailed(false);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fbPreviewUrl);
        setPreviewLinkCopied(true);
        return;
      }
    } catch {
      // Fall through to execCommand
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = fbPreviewUrl;
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) {
        setPreviewLinkCopied(true);
      } else {
        setCopyFailed(true);
      }
    } catch {
      setCopyFailed(true);
    }
  };

  const handleDownloadVideoAgain = () => {
    const href = `/api/share/fb/video?variant=${variant}`;
    const link = document.createElement('a');
    link.href = href;
    link.download = `agnes-protocol-fb-${variant}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setDownloadStarted(true);
  };

  const handleIPosted = async () => {
    if (pointsAwarded || awarding) return;
    setAwarding(true);
    const email = readContestEmail();
    if (!email) {
      alert('Please enter the contest first.');
      setAwarding(false);
      return;
    }
    try {
      const res = await fetch('/api/points/award', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': email,
        },
        body: JSON.stringify({
          action: 'share_fb',
          source: 'share_page',
          targetVariant: target,
          variant,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (process.env.NEXT_PUBLIC_SHARE_FLOW_DEBUG === '1') {
        console.log('[share/fb/instructions] claim response', {
          status: res.status,
          payload,
        });
      }
      if (res.ok) {
        setPointsAwarded(true);
      } else {
        console.error('[share/fb/instructions] Award failed', res.status, payload);
        throw new Error(
          typeof payload?.error === 'string' ? payload.error : 'Award failed'
        );
      }
    } catch (err) {
      console.error('[instructions] Award failed', err);
      alert('Failed to record your post. Please try again.');
    } finally {
      setAwarding(false);
    }
  };

  const backParams = new URLSearchParams();
  if (refCode) backParams.set('ref', refCode);
  if (target) backParams.set('target', target);
  const backHref = `/share/fb/${variant}${backParams.toString() ? `?${backParams.toString()}` : ''}`;

  return (
    <div
      style={{
        minHeight: '100svh',
        background: '#ffffff',
        color: '#1a1a1a',
        padding: 'max(1rem, env(safe-area-inset-top)) max(1.5rem, env(safe-area-inset-right)) max(2rem, env(safe-area-inset-bottom)) max(1.5rem, env(safe-area-inset-left))',
      }}
    >
      <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '1.5rem', textAlign: 'center' }}>
        Post to Facebook (about 30–60 seconds)
      </h1>

      {/* Top action block: Copy Caption + Post Video / Download Video (device-aware) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 400, margin: '0 auto 2rem' }}>
        <button
          type="button"
          onClick={handleCopyCaption}
          style={{
            padding: '1.25rem 2rem',
            borderRadius: 12,
            border: '2px solid #1a1a1a',
            background: captionCopied ? '#10b981' : '#fff',
            color: captionCopied ? '#fff' : '#1a1a1a',
            fontSize: '1.25rem',
            fontWeight: 700,
            cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        >
          {captionCopied ? '✓ Caption copied' : 'Copy Caption'}
        </button>
        {captionCopied && (
          <p style={{ fontSize: '1rem', color: '#10b981', fontWeight: 600, margin: '-0.5rem 0 0' }}>Copied ✅</p>
        )}
        {copyFailed && (
          <p style={{ fontSize: '0.9rem', color: '#dc2626', margin: '-0.5rem 0 0' }}>Copy failed—tap and hold to select</p>
        )}

        <button
          type="button"
          onClick={handleDownloadVideoAgain}
          style={{
            padding: '1.25rem 2rem',
            borderRadius: 12,
            border: '2px solid #1a1a1a',
            background: downloadStarted ? '#10b981' : '#fff',
            color: downloadStarted ? '#fff' : '#1a1a1a',
            fontSize: '1.25rem',
            fontWeight: 700,
            cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        >
          {downloadStarted
            ? '✓ Started'
            : activeTab === 'android'
            ? 'Post Video to Facebook'
            : 'Download Video Again'}
        </button>
        {downloadStarted && (
          <p style={{ fontSize: '1rem', color: '#6b7280', lineHeight: 1.5, margin: '-0.5rem 0 0' }}>
            {activeTab === 'android' ? (
              <>Facebook will open with the video attached. Paste caption and tap Post.</>
            ) : isIOS ? (
              <>If you see &quot;Save…&quot; at the bottom, tap it.</>
            ) : (
              <>Swipe down and tap the download notification.</>
            )}
          </p>
        )}
      </div>

      {/* Instructional video (device-aware) */}
      <div style={{ marginBottom: '2rem' }}>
        <video
          key={activeTab}
          src={getFbInstructionsVideoSrc(activeTab === 'ios' ? 'ios' : 'android')}
          controls
          playsInline
          preload="metadata"
          onError={() => setVideoLoadError(true)}
          onLoadedData={() => setVideoLoadError(false)}
          style={{
            width: '100%',
            maxWidth: 400,
            borderRadius: 12,
            display: 'block',
            margin: '0 auto',
          }}
        >
          Your browser does not support the video tag.
        </video>
        {videoLoadError && (
          <p
            style={{
              fontSize: '0.9rem',
              color: '#b45309',
              textAlign: 'center',
              marginTop: '0.75rem',
              lineHeight: 1.5,
            }}
          >
            Training video failed to load. Follow the written steps above — they&apos;re complete without the
            video. If this keeps happening, ask support to confirm training video hosting (
            <code style={{ fontSize: '0.8rem' }}>NEXT_PUBLIC_TRAINING_VIDEO_BASE_URL</code>
            ) or local <code style={{ fontSize: '0.8rem' }}>public/training</code> on the deployment.
          </p>
        )}
      </div>

      {/* Section: Steps (device-aware) */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button
            type="button"
            onClick={() => setActiveTab('ios')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 8,
              border: '1px solid #d1d5db',
              background: activeTab === 'ios' ? '#1a1a1a' : '#fff',
              color: activeTab === 'ios' ? '#fff' : '#1a1a1a',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            iPhone / iPad
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('android')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 8,
              border: '1px solid #d1d5db',
              background: activeTab === 'android' ? '#1a1a1a' : '#fff',
              color: activeTab === 'android' ? '#fff' : '#1a1a1a',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Android
          </button>
        </div>

        <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1a1a1a', marginBottom: '1rem', lineHeight: 1.5 }}>
          <strong>IMPORTANT: Choose Feed Post (not Story/Reels). If FB converts to Reels, that&apos;s upside.</strong>
        </p>

        {activeTab === 'ios' ? (
          <>
            <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '0.75rem', fontStyle: 'italic' }}>
              If Reels is offered, choose Feed Post instead.
            </p>
            <ol style={{ margin: 0, paddingLeft: '1.5rem', lineHeight: 2, fontSize: '1rem' }}>
              <li>Confirm download (tap Save… if shown)</li>
              <li><strong>Files</strong> → <strong>Browse</strong> → <strong>Downloads</strong></li>
              <li>Tap the Agnes video</li>
              <li>Tap the <strong>Share</strong> icon</li>
              <li>Select <strong>Facebook</strong></li>
              <li>Choose <strong>Feed Post</strong> (not Story)</li>
              <li>Composer opens with video attached</li>
              <li>Tap in text area → press and hold → <strong>Paste</strong> caption</li>
              <li>Tap <strong>Post</strong></li>
              <li>App switcher → return to browser</li>
              <li>Tap I Posted ✅ (Claim Points)</li>
            </ol>
          </>
        ) : (
          <>
            <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1a1a1a', marginBottom: '0.75rem' }}>
              Android – Fast Method
            </p>
            <ol style={{ margin: 0, paddingLeft: '1.5rem', lineHeight: 2, fontSize: '1rem' }}>
              <li>Tap <strong>Copy Caption</strong></li>
              <li>Tap <strong>Post Video to Facebook</strong></li>
              <li>Facebook will open with the video already attached</li>
              <li>Tap in the text field and <strong>Paste</strong> the caption</li>
              <li>Make sure <strong>Feed Post</strong> is selected (not Story/Reels)</li>
              <li>Tap <strong>Post</strong></li>
            </ol>
            <p style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: '1rem', fontStyle: 'italic' }}>
              That&apos;s it.
            </p>

            <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1a1a1a', marginTop: '1.5rem', marginBottom: '0.5rem' }}>
              Troubleshooting
            </p>
            <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '0.75rem', lineHeight: 1.5 }}>
              If the video does not attach automatically, use the <strong>Link Method</strong> below instead.
            </p>
            <div style={{ padding: '1rem', background: '#f9fafb', borderRadius: 8, marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#6b7280', marginBottom: '0.5rem' }}>
                Link Method (fallback)
              </p>
              <button
                type="button"
                onClick={handleCopyPreviewLink}
                style={{
                  padding: '0.75rem 1.25rem',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: previewLinkCopied ? '#10b981' : '#fff',
                  color: previewLinkCopied ? '#fff' : '#1a1a1a',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginBottom: '0.5rem',
                }}
              >
                {previewLinkCopied ? '✓ Preview link copied' : 'Copy Facebook Preview Link'}
              </button>
              <ol style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.8, fontSize: '0.9rem', color: '#6b7280' }}>
                <li>Open <strong>Facebook</strong> → Create Post</li>
                <li><strong>Paste</strong> caption and <strong>Paste</strong> link</li>
                <li>Tap <strong>Post</strong></li>
              </ol>
            </div>
          </>
        )}
      </div>

      {/* Section: Claim / Footer */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 400, margin: '0 auto' }}>
        <button
          type="button"
          onClick={handleIPosted}
          disabled={awarding || pointsAwarded}
          style={{
            padding: '1.25rem 2rem',
            borderRadius: 12,
            border: 'none',
            background: pointsAwarded ? '#10b981' : awarding ? '#9ca3af' : 'linear-gradient(135deg, #1877f2 0%, #0d5bb5 100%)',
            color: '#fff',
            fontSize: '1.25rem',
            fontWeight: 700,
            cursor: awarding || pointsAwarded ? 'not-allowed' : 'pointer',
            touchAction: 'manipulation',
          }}
        >
          {awarding ? 'Awarding…' : pointsAwarded ? '✓ Points claimed!' : 'I Posted ✅ (Claim Points)'}
        </button>
        {pointsAwarded && (
          <p style={{ fontSize: '1rem', color: '#10b981', textAlign: 'center' }}>
            Success! Tap below to return.
          </p>
        )}

        <Link
          href="/contest/score"
          style={{
            display: 'block',
            padding: '1.25rem 2rem',
            borderRadius: 12,
            border: '2px solid #1a1a1a',
            background: '#fff',
            color: '#1a1a1a',
            fontSize: '1.25rem',
            fontWeight: 700,
            textAlign: 'center',
            textDecoration: 'none',
          }}
        >
          Return to Scoreboard
        </Link>

        <Link
          href={backHref}
          style={{
            display: 'block',
            padding: '1rem',
            fontSize: '0.9rem',
            color: '#6b7280',
            textAlign: 'center',
            textDecoration: 'underline',
          }}
        >
          ← Back to Facebook Share
        </Link>

        <p style={{ fontSize: '0.85rem', color: '#9ca3af', textAlign: 'center', marginTop: '1.5rem', lineHeight: 1.5 }}>
          If you got lost, reopen the site and go to{' '}
          <Link href="/posted?platform=fb" style={{ color: '#3b82f6', fontWeight: 600, textDecoration: 'underline' }}>
            /posted?platform=fb
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

export default function FBInstructionsPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100svh',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#1a1a1a',
          }}
        >
          Loading…
        </div>
      }
    >
      <InstructionsContent />
    </Suspense>
  );
}
