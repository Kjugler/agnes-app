'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { readContestEmail, readAssociate } from '@/lib/identity';
import { buildShareCaption } from '@/lib/shareCaption';
import { getNextVariant, shareAssets } from '@/lib/shareAssets';
import { JodyAssistant } from '@/components/JodyAssistant';
import { JodyTrainingModal } from '@/components/JodyTrainingModal';
import HelpButton from '@/components/HelpButton';

export default function TruthSharePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hasCopied, setHasCopied] = useState(false);
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [awardingPoints, setAwardingPoints] = useState(false);
  const [pointsAwarded, setPointsAwarded] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [truthCaption, setTruthCaption] = useState('');
  const [truthVideoSrc, setTruthVideoSrc] = useState<string | null>(null);
  const [showTruthTraining, setShowTruthTraining] = useState(false);

  // Get rotating Truth video variant - lock it on mount
  useEffect(() => {
    const variant = getNextVariant('truth');
    setTruthVideoSrc(shareAssets.truth.variants[variant].video);
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
        console.warn('[truth-share] Failed to fetch user info', err);
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
      includeSecretCode: true, // Always include #WhereIsJodyVernon for Truth
      platform: 'truth', // Truth platform
    });
    
    setTruthCaption(caption);
  }, [firstName, refCode]);

  // Copy caption handler
  const handleCopyCaption = async () => {
    try {
      await navigator.clipboard.writeText(truthCaption);
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
      console.warn('[truth-share] No email found, cannot award points');
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
          action: 'share_truth',
          source: 'truth_share_page',
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
        console.error('[truth-share] Failed to award points', errorData);
        alert('Failed to record your share. Please try again.');
      }
    } catch (err) {
      console.error('Failed to track Truth share', err);
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
        Share on Truth Social
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
        Download the video, copy your caption, and post it to Truth Social to earn points.
      </p>

      {/* Video Preview Block */}
      {truthVideoSrc && (
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
            src={truthVideoSrc}
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
          Your Truth Social Caption
        </p>
        <textarea
          readOnly
          value={truthCaption || 'Loading caption...'}
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
          {hasCopied ? '✓ Caption Copied' : 'Copy Caption'}
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
        {truthVideoSrc && (
          <a
            href={truthVideoSrc}
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
            {hasDownloaded ? '✓ Video Downloaded' : 'Download Truth Video'}
          </a>
        )}

        <a
          href="https://truthsocial.com"
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
          }}
        >
          Open Truth Social to Post
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
          {showSteps ? 'Hide Truth Social Instructions ▲' : 'How to Post on Truth Social (Step-by-Step) ▼'}
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
              Tap "Download Truth Video" above and save it to your device.
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              Tap "Open Truth Social to Post" (or open your Truth Social app).
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
        variant="truth"
        autoShowDelayMs={4000}
        onShowTraining={() => setShowTruthTraining(true)}
      />

      {/* Truth Training Modal */}
      {showTruthTraining && (
        <JodyTrainingModal
          isOpen={showTruthTraining}
          onClose={() => setShowTruthTraining(false)}
          title="How to Post on Truth Social"
          videoSrc="/training/jody-truth-training.mp4"
          steps={[
            { text: <>On this page, click <strong>Copy caption</strong> to copy the full Truth Social caption with your personal code and links.</> },
            { text: <>Click <strong>Download Truth Video</strong> to save the video to your device. It will usually go into your Downloads folder.</> },
            { text: <>Open Truth Social in your browser or app and sign in to the account where you want to post.</> },
            { text: <>Tap the <strong>New Post / camera icon</strong> to create a new post, then choose to upload a video from your device.</> },
            { text: <>Browse to your Downloads folder (or wherever your browser saved the file) and select the video you just downloaded from DeepQuill.</> },
            { text: <>Truth Social will show a preview of your video. Confirm it looks right, then move to the caption area.</> },
            { text: <>Click or tap into the caption area and paste the text you copied earlier (<strong>Ctrl + V</strong> on desktop, or long-press &gt; Paste on mobile).</> },
            { text: <>Review the post one last time — make sure the video, caption, and hashtags all look correct — then tap <strong>Post</strong>.</> },
            { text: <>Wait until Truth Social clearly shows that your post is live before leaving the screen.</> },
          ]}
          importantNote={
            <>
              <strong>Important:</strong> if the video upload fails or you close the window too quickly, the post may not actually go live. DeepQuill LLC reserves the right to audit winning entries to confirm posts were truly published. We don't want you to lose eligibility because one video didn't finish uploading.
            </>
          }
          afterPostNote={
            <>
              Once Truth Social confirms that your post is live, come back to this page and click <strong>&ldquo;I Posted It ✔ Get My Points&rdquo;</strong>. That records your share in the contest and updates your score on the scoreboard.
            </>
          }
        />
      )}
      <HelpButton />
    </div>
  );
}

