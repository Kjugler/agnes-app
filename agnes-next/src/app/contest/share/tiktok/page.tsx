'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { JodyAssistant } from '@/components/JodyAssistant';
import { JodyTrainingModal } from '@/components/JodyTrainingModal';
import { readContestEmail, readAssociate } from '@/lib/identity';
import HelpButton from '@/components/HelpButton';
import { buildShareCaption } from '@/lib/shareCaption';
import { getNextVariant, shareAssets } from '@/lib/shareAssets';

export default function TikTokSharePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hasCopied, setHasCopied] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [awardingPoints, setAwardingPoints] = useState(false);
  const [pointsAwarded, setPointsAwarded] = useState(false);
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [tiktokCaption, setTiktokCaption] = useState('');
  const [showTikTokTraining, setShowTikTokTraining] = useState(false);
  const [tiktokVideoSrc, setTiktokVideoSrc] = useState<string | null>(null);

  // Get rotating TikTok video variant - lock it on mount
  useEffect(() => {
    const variant = getNextVariant('tt');
    setTiktokVideoSrc(shareAssets.tt.variants[variant].video);
  }, []);

  // Get refCode from searchParams or associate cache
  const refCodeFromParams = searchParams.get('ref') || '';
  const associate = readAssociate();
  const refCode = refCodeFromParams || associate?.code || 'YOURCODE';

  // Fetch user's firstName for personalized caption
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
        console.warn('[tiktok-share] Failed to fetch user info', err);
      }
    };
    
    fetchUserInfo();
  }, []);

  // Build share URL and caption
  useEffect(() => {
    const baseUrl =
      typeof window !== 'undefined'
        ? window.location.origin
        : process.env.NEXT_PUBLIC_SITE_URL || 'https://theagnesprotocol.com';
    
    // Build share URL pointing to IG variant 2 with terminal target (matching the pattern)
    const shareUrl = `${baseUrl.replace(/\/$/, '')}/share/ig/2?ref=${encodeURIComponent(refCode)}&target=terminal`;
    
    const caption = buildShareCaption({
      firstName,
      refCode,
      shareUrl,
      includeSecretCode: true, // Always include #WhereIsJodyVernon for TikTok
      platform: 'tt', // TikTok platform
    });
    
    setTiktokCaption(caption);
  }, [firstName, refCode]);

  // Copy caption handler
  const handleCopyCaption = async () => {
    try {
      await navigator.clipboard.writeText(tiktokCaption);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 3000);
    } catch (err) {
      console.error('Failed to copy caption', err);
      alert('Please select and copy the caption manually.');
    }
  };

  // Download video handler
  const handleDownloadVideo = () => {
    setHasDownloaded(true);
    // The download will happen via the <a> tag's native download attribute
  };

  // Posted confirmation handler
  const handlePostedConfirmation = async () => {
    if (pointsAwarded) return; // Prevent double-awarding
    
    setAwardingPoints(true);
    const email = readContestEmail();
    
    if (!email) {
      console.warn('[tiktok-share] No email found, cannot award points');
      setAwardingPoints(false);
      alert('Please enter your email in the contest first.');
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
          action: 'share_tiktok',
          source: 'tiktok_share_page',
        }),
      });
      
      if (res.ok) {
        setPointsAwarded(true);
        // Redirect to scoreboard after short delay
        setTimeout(() => {
          router.push('/contest/score');
        }, 1500);
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error('[tiktok-share] Failed to award points', errorData);
        alert('Failed to record your share. Please try again.');
      }
    } catch (err) {
      console.error('Failed to track TikTok share', err);
      alert('Failed to record your share. Please try again.');
    } finally {
      setAwardingPoints(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f0f24 0%, #1a1a3a 100%)',
        padding: '2rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {/* Back Button */}
      <button
        type="button"
        onClick={() => router.push('/contest/score')}
        style={{
          alignSelf: 'flex-start',
          padding: '0.5rem 1rem',
          background: 'transparent',
          border: '1px solid rgba(148, 163, 184, 0.3)',
          borderRadius: 8,
          color: '#cbd5e1',
          cursor: 'pointer',
          fontSize: '0.9rem',
          marginBottom: '1rem',
        }}
      >
        ← Back to Scoreboard
      </button>

      {/* Heading */}
      <h1
        style={{
          fontSize: '2rem',
          fontWeight: 600,
          color: 'white',
          marginTop: '1rem',
          marginBottom: '0.5rem',
          textAlign: 'center',
        }}
      >
        Share on TikTok
      </h1>
      <p
        style={{
          fontSize: '0.875rem',
          color: '#94a3b8',
          marginBottom: '2rem',
          textAlign: 'center',
          maxWidth: 640,
        }}
      >
        Download the video, copy your caption, and post it to TikTok to earn points.
      </p>

      {/* Video Preview Block */}
      {tiktokVideoSrc && (
        <div
          style={{
            marginTop: '1rem',
            marginBottom: '1rem',
            display: 'flex',
            justifyContent: 'center',
            width: '100%',
            maxWidth: 640,
          }}
        >
          <video
            src={tiktokVideoSrc}
            controls
            style={{
              borderRadius: 12,
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              width: '100%',
              maxWidth: '320px',
              height: 'auto',
            }}
          />
        </div>
      )}

      {/* Caption Block */}
      <div
        style={{
          marginTop: '1rem',
          width: '100%',
          maxWidth: 640,
        }}
      >
        <p
          style={{
            fontWeight: 600,
            marginBottom: '0.5rem',
            color: 'white',
            fontSize: '1rem',
          }}
        >
          Your TikTok Caption
        </p>
        <textarea
          readOnly
          value={tiktokCaption || 'Loading caption...'}
          style={{
            width: '100%',
            minHeight: '160px',
            padding: '0.75rem',
            border: '1px solid rgba(148, 163, 184, 0.3)',
            borderRadius: 8,
            background: 'rgba(15, 23, 42, 0.75)',
            color: 'white',
            fontSize: '0.875rem',
            lineHeight: 1.5,
            fontFamily: 'inherit',
            resize: 'none',
            marginBottom: '1rem',
          }}
        />
        <button
          type="button"
          onClick={handleCopyCaption}
          disabled={hasCopied}
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: 999,
            border: 'none',
            background: hasCopied ? '#10b981' : '#3b82f6',
            color: 'white',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: hasCopied ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            width: '100%',
          }}
        >
          {hasCopied ? '✓ Copied!' : 'Copy Caption'}
        </button>
      </div>

      {/* Download & Share Buttons Row */}
      <div
        style={{
          marginTop: '1.5rem',
          width: '100%',
          maxWidth: 640,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        {tiktokVideoSrc && (
          <a
            href={tiktokVideoSrc}
            download
            onClick={handleDownloadVideo}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: 999,
              border: 'none',
              background: hasDownloaded ? '#10b981' : '#3b82f6',
              color: 'white',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'center',
              textDecoration: 'none',
              transition: 'all 0.2s',
            }}
          >
            {hasDownloaded ? '✓ Video downloaded' : 'Download TikTok Video'}
          </a>
        )}

        <a
          href="https://www.tiktok.com/upload?lang=en"
          target="_blank"
          rel="noreferrer"
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: 999,
            border: '1px solid rgba(148, 163, 184, 0.3)',
            background: 'transparent',
            color: '#cbd5e1',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: 'pointer',
            textAlign: 'center',
            textDecoration: 'none',
            transition: 'all 0.2s',
            display: 'block',
          }}
        >
          Open TikTok to Post
        </a>
      </div>

      {/* DIY Step-by-Step Instructions (Collapsible) */}
      <div
        style={{
          marginTop: '1.5rem',
          width: '100%',
          maxWidth: 640,
          border: '1px solid rgba(148, 163, 184, 0.3)',
          borderRadius: 8,
          padding: '1rem',
          background: 'rgba(15, 23, 42, 0.5)',
        }}
      >
        <button
          type="button"
          onClick={() => setShowSteps((prev) => !prev)}
          style={{
            width: '100%',
            textAlign: 'left',
            fontWeight: 600,
            background: 'transparent',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            fontSize: '1rem',
            padding: 0,
          }}
        >
          {showSteps ? 'Hide TikTok Instructions ▲' : 'How to Post on TikTok (Step-by-Step) ▼'}
        </button>

        {showSteps && (
          <ol
            style={{
              listStyleType: 'decimal',
              marginLeft: '1.25rem',
              marginTop: '0.75rem',
              color: '#cbd5e1',
              fontSize: '0.875rem',
              lineHeight: 1.8,
              paddingLeft: 0,
            }}
          >
            <li style={{ marginBottom: '0.5rem' }}>
              Tap "Download TikTok Video" above and save it to your device.
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              Tap "Open TikTok to Post" (or open your TikTok app).
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              Tap the <strong>+</strong> button to create a new post.
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              Select the downloaded video from your camera roll / gallery.
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              Trim or adjust if needed, then tap <strong>Next</strong>.
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              Tap and hold in the caption box, then choose <strong>Paste</strong>.
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              Review your caption and hashtags.
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              Make sure your audience is set to <strong>Everyone</strong>.
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              Tap <strong>Post</strong>.
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              Come back here and tap "I Posted It" to claim your points.
            </li>
          </ol>
        )}
      </div>

      {/* "I Posted It" Button (Scoring) */}
      <div
        style={{
          marginTop: '1.5rem',
          width: '100%',
          maxWidth: 640,
        }}
      >
        <button
          type="button"
          onClick={handlePostedConfirmation}
          disabled={awardingPoints || pointsAwarded}
          style={{
            padding: '1rem 1.5rem',
            borderRadius: 999,
            border: 'none',
            background: pointsAwarded
              ? '#10b981'
              : awardingPoints
              ? '#64748b'
              : '#10b981',
            color: 'white',
            fontSize: '1.1rem',
            fontWeight: 700,
            cursor: awardingPoints || pointsAwarded ? 'not-allowed' : 'pointer',
            width: '100%',
            transition: 'all 0.2s',
          }}
        >
          {awardingPoints
            ? 'Recording your share...'
            : pointsAwarded
            ? '✓ Points Awarded! Redirecting...'
            : 'I Posted It ✔ Get My Points'}
        </button>
      </div>

      {/* Jody Assistant */}
      <JodyAssistant
        variant="tiktok"
        autoShowDelayMs={4000}
        onShowTraining={() => setShowTikTokTraining(true)}
      />

      {/* TikTok Training Modal */}
      <JodyTrainingModal
        isOpen={showTikTokTraining}
        onClose={() => setShowTikTokTraining(false)}
        videoSrc="/training/jody-tiktok-training.mp4"
        title="How to Post on TikTok"
        steps={[
          { text: <>On this page, click <strong>Copy caption</strong>.</> },
          { text: <>Click <strong>Download TikTok Video</strong> to save the video to your Downloads folder.</> },
          { text: <>Open the <strong>TikTok</strong> app and tap the <strong>+</strong> icon to create a new post.</> },
          { text: <>Choose <strong>Video</strong> (if TikTok asks), then select the video you just downloaded.</> },
          { text: <>Trim or adjust if you'd like, then tap <strong>Next</strong> until you reach the caption screen.</> },
          { text: <>In the caption box, tap to focus and press <strong>Ctrl + V</strong> (or long-press &gt; Paste on mobile) to paste the caption you copied from this page.</> },
          { text: <>Tap <strong>Post</strong> and <em>wait</em> until TikTok clearly shows that the video has finished posting.</> },
        ]}
        importantNote={
          <>
            <strong>Important:</strong> if the video doesn't fully post and you move on too quickly, it may not count. DeepQuill LLC reserves the right to audit winning entries to confirm posts were actually live. It would be a shame to lose a prize because one video never finished uploading.
          </>
        }
        afterPostNote={
          <>
            <strong>After your video is posted:</strong> come back to this page and click <strong>&ldquo;I Posted It&rdquo;</strong> so your points are recorded on the Score page. Remember, you can earn <strong>100 points per post per day</strong> on each platform — that's up to <strong>500 points every day</strong>, plus extra bonuses when you catch the rabbits.
          </>
        }
      />
      <HelpButton />
    </div>
  );
}

