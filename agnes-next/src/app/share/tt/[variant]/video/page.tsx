'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShareScaffold } from '@/components/share/ShareScaffold';
import { buildShareCaption } from '@/lib/shareCaption';
import { buildTrackingLink } from '@/lib/shareHelpers';
import { readContestEmail } from '@/lib/identity';
import type { ShareTarget } from '@/lib/shareTarget';
import type { ShareVariant } from '@/lib/shareAssets';

function TikTokVideoPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const variantRaw = Number(params.variant) || 1;
  const variant = (variantRaw >= 1 && variantRaw <= 7 ? variantRaw : 1) as ShareVariant;
  const videoSrc = searchParams.get('src') || '';
  const refCode = searchParams.get('ref') || '';
  const target = (searchParams.get('target') as ShareTarget) || 'challenge';

  const [firstName, setFirstName] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  const baseUrl =
    typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL || '';
  const shareUrl = buildTrackingLink('tt', variant, refCode, target, baseUrl);
  const caption = buildShareCaption({
    firstName,
    refCode,
    shareUrl,
    includeSecretCode: target === 'terminal',
    platform: 'tt',
  });

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
        console.warn('[share/tt/video] Failed to fetch user info', err);
      }
    };
    fetchUserInfo();
  }, []);

  const handleShare = async () => {
    if (!videoSrc || sharing) return;
    setSharing(true);
    try {
      const res = await fetch(videoSrc, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], `agnes-protocol-tt-${variant}.mp4`, {
        type: blob.type || 'video/mp4',
      });
      const canShare =
        typeof navigator.share === 'function' &&
        (typeof navigator.canShare !== 'function' ? true : navigator.canShare({ files: [file] }));
      if (canShare) {
        await navigator.share({
          files: [file],
          title: 'The Agnes Protocol',
          text: caption,
        });
      } else {
        throw new Error('Sharing not supported');
      }
    } catch (err) {
      console.warn('[share/tt/video] Share failed', err);
    } finally {
      setSharing(false);
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = videoSrc;
    link.download = `agnes-protocol-tt-${variant}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      setHasCopied(true);
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('dq_last_caption', caption);
    } catch {
      alert('Please select and copy the caption manually.');
    }
  };

  if (!videoSrc) {
    return (
      <div
        style={{
          minHeight: '100svh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: 'white',
        }}
      >
        <p style={{ marginBottom: 16 }}>Missing video. Go back and tap Initiate Sequence.</p>
        <Link
          href={`/share/tt/${variant}?ref=${refCode}&target=${target}`}
          style={{ color: '#60a5fa', textDecoration: 'underline' }}
        >
          Back to share page
        </Link>
      </div>
    );
  }

  return (
    <ShareScaffold platform="tt" variant={variant} target={target} iSharedHint="Only tap after you've posted.">
      <div
        style={{
          width: '100%',
          maxWidth: 640,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.5rem',
        }}
      >
        <video
          src={videoSrc}
          controls
          playsInline
          style={{
            width: '100%',
            borderRadius: 12,
            background: '#000',
          }}
        />
        <p style={{ fontSize: '0.95rem', color: '#94a3b8', textAlign: 'center', lineHeight: 1.5 }}>
          Tap Share → Choose TikTok
        </p>
        <p style={{ fontSize: '0.875rem', color: '#64748b', textAlign: 'center' }}>
          Paste caption (already copied)
        </p>
        <button
          type="button"
          onClick={handleShare}
          disabled={sharing}
          className="share-tap-target"
          style={{
            padding: '1.25rem 2.5rem',
            borderRadius: 16,
            border: 'none',
            background: sharing ? '#475569' : 'linear-gradient(135deg, #ff0050 0%, #00f2ea 100%)',
            color: 'white',
            fontSize: '1.25rem',
            fontWeight: 700,
            cursor: sharing ? 'not-allowed' : 'pointer',
            minWidth: '240px',
            touchAction: 'manipulation',
            boxShadow: '0 8px 24px rgba(255,0,80,0.35)',
          }}
        >
          {sharing ? 'Preparing…' : 'Share'}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="share-tap-target"
          style={{
            padding: '1rem 2rem',
            borderRadius: 999,
            border: '1px solid rgba(148, 163, 184, 0.45)',
            background: 'transparent',
            color: '#94a3b8',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        >
          Download
        </button>
        <button
          type="button"
          onClick={handleCopyCaption}
          style={{
            background: 'none',
            border: 'none',
            color: '#60a5fa',
            fontSize: '0.875rem',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          {hasCopied ? '✓ Caption copied' : 'Copy caption again'}
        </button>
      </div>
    </ShareScaffold>
  );
}

export default function TikTokVideoPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100svh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Loading…</div>}>
      <TikTokVideoPageContent />
    </Suspense>
  );
}
