'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { buildShareCaption } from '@/lib/shareCaption';
import { buildTrackingLink } from '@/lib/shareHelpers';
import { readContestEmail } from '@/lib/identity';
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
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [pointsAwarded, setPointsAwarded] = useState(false);
  const [awarding, setAwarding] = useState(false);
  const [activeTab, setActiveTab] = useState<'ios' | 'android'>('ios');

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL || '';
  const shareUrl = buildTrackingLink('x', variant, refCode, target, baseUrl);
  const caption = buildShareCaption({
    firstName,
    refCode,
    shareUrl,
    includeSecretCode: target === 'terminal',
    platform: 'x',
  });

  useEffect(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    setActiveTab(/iPhone|iPad|iPod/.test(ua) ? 'ios' : 'android');
  }, []);

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
        console.warn('[share/x/instructions] Failed to fetch user info', err);
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

  const handleDownloadVideoAgain = () => {
    const href = `/api/share/x/video?variant=${variant}`;
    const link = document.createElement('a');
    link.href = href;
    link.download = `agnes-protocol-x-${variant}.mp4`;
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
          action: 'share_x',
          source: 'share_page',
          targetVariant: target,
          variant,
        }),
      });
      if (res.ok) {
        setPointsAwarded(true);
      } else {
        throw new Error('Award failed');
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
  const backHref = `/share/x/${variant}${backParams.toString() ? `?${backParams.toString()}` : ''}`;

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
        Post to X (about 60 seconds)
      </h1>

      {/* Top redundant action block */}
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
          {captionCopied ? '✓ Caption copied' : 'Copy Caption (Redundant)'}
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
          {downloadStarted ? '✓ Download started' : 'Download Video Again'}
        </button>
        {downloadStarted && (
          <p style={{ fontSize: '1rem', color: '#6b7280', lineHeight: 1.5, margin: '-0.5rem 0 0' }}>
            {isIOS ? (
              <>If you see &quot;Save…&quot; at the bottom, tap it.</>
            ) : (
              <>Swipe down and tap the download notification.</>
            )}
          </p>
        )}
      </div>

      {/* Instructional video (device-aware) */}
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem', textAlign: 'center' }}>
          Watch the 1-Minute Demo
        </h3>
        <video
          key={activeTab}
          controls
          playsInline
          preload="metadata"
          style={{
            width: '100%',
            maxWidth: 640,
            borderRadius: 12,
            display: 'block',
            margin: '20px auto',
          }}
        >
          <source
            src={activeTab === 'ios' ? '/training/x-instructions-iPhone.mp4' : '/training/x-instructions-android.mp4'}
            type="video/mp4"
          />
          Your browser does not support the video tag.
        </video>
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
          <strong>IMPORTANT: Upload the video directly in X (do not paste a link-only post).</strong>
        </p>

        {activeTab === 'ios' ? (
          <ol style={{ margin: 0, paddingLeft: '1.5rem', lineHeight: 2, fontSize: '1rem' }}>
            <li>Confirm download (tap Save… if shown)</li>
            <li><strong>Files</strong> → <strong>Browse</strong> → <strong>Downloads</strong></li>
            <li>Tap the Agnes video</li>
            <li>Tap the <strong>Share</strong> icon</li>
            <li>Select <strong>X</strong></li>
            <li>Composer opens with video attached</li>
            <li>Tap in text area → press and hold → <strong>Paste</strong> caption</li>
            <li>Tap <strong>Post</strong></li>
            <li>App switcher → return to browser</li>
            <li>Tap I Posted ✅ (Claim Points)</li>
          </ol>
        ) : (
          <ol style={{ margin: 0, paddingLeft: '1.5rem', lineHeight: 2, fontSize: '1rem' }}>
            <li>Confirm download (notification or Downloads)</li>
            <li><strong>Files</strong> → <strong>Downloads</strong></li>
            <li>Tap three dots → <strong>Share</strong></li>
            <li>Select <strong>X</strong></li>
            <li>Tap in text area → <strong>Paste</strong> caption</li>
            <li>Tap <strong>Post</strong></li>
            <li>Recent Apps → return to browser</li>
            <li>Tap I Posted ✅ (Claim Points)</li>
          </ol>
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
            background: pointsAwarded ? '#10b981' : awarding ? '#9ca3af' : 'linear-gradient(135deg, #ff0050 0%, #00f2ea 100%)',
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
          ← Back to X Share
        </Link>

        <p style={{ fontSize: '0.85rem', color: '#9ca3af', textAlign: 'center', marginTop: '1.5rem', lineHeight: 1.5 }}>
          If you got lost, reopen the site and go to{' '}
          <Link href="/posted?platform=x" style={{ color: '#3b82f6', fontWeight: 600, textDecoration: 'underline' }}>
            /posted?platform=x
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

export default function XInstructionsPage() {
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
