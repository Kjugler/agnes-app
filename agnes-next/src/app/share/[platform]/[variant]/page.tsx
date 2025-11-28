'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import type { SharePlatform } from '@/lib/shareAssets';
import { shareAssets } from '@/lib/shareAssets';
import { buildShareCaption } from '@/lib/shareCaption';
import { type ShareTarget } from '@/lib/shareTarget';
import { buildPlatformShareUrl } from '@/lib/shareHelpers';
import { readContestEmail } from '@/lib/identity';
import { IGHelpPanel } from '@/components/IGHelpPanel';
import { JodyAssistant } from '@/components/JodyAssistant';
import HelpButton from '@/components/HelpButton';

const platformNames: Record<SharePlatform, string> = {
  fb: 'Facebook',
  ig: 'Instagram',
  x: 'X',
  tt: 'TikTok',
  truth: 'Truth Social',
};

export default function ShareLandingPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const platform = (params.platform as SharePlatform) || 'fb';
  const variantRaw = Number(params.variant) || 1;
  const variant = (variantRaw >= 1 && variantRaw <= 3 ? variantRaw : 1) as 1 | 2 | 3;
  
  const refCode = searchParams.get('ref') || '';
  const target = (searchParams.get('target') as ShareTarget) || 'challenge';
  
  const [hasCopied, setHasCopied] = useState(false);
  const [awardingPoints, setAwardingPoints] = useState(false);
  const [pointsAwarded, setPointsAwarded] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [videoDownloaded, setVideoDownloaded] = useState(false);
  
  const assets = shareAssets[platform]?.variants[variant];
  const videoUrl = assets?.video || '/videos/fb1.mp4';
  const thumbnailUrl = assets?.thumbnail || '/images/fb1.jpg';
  
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
        console.warn('[share] Failed to fetch user info', err);
      }
    };
    
    fetchUserInfo();
  }, []);
  
  // Build share URL and caption
  const baseUrl = typeof window !== 'undefined' 
    ? window.location.origin 
    : process.env.NEXT_PUBLIC_SITE_URL || '';
  const shareUrl = `${baseUrl}/share/${platform}/${variant}?ref=${encodeURIComponent(refCode)}&target=${target}`;
  
  const caption = buildShareCaption({
    firstName,
    refCode,
    shareUrl,
    includeSecretCode: target === 'terminal', // A2: Include secret code for terminal
    platform, // Pass platform for X-specific caption
  });
  
  // Build platform-specific share URL (for opening the social platform)
  const platformShareUrl = buildPlatformShareUrl(platform, shareUrl, caption);
  
  // Award points helper function
  const awardPoints = async () => {
    if (pointsAwarded) return; // Prevent double-awarding
    
    setAwardingPoints(true);
    const email = readContestEmail();
    
    if (!email) {
      console.warn('[share] No email found, cannot award points');
      setAwardingPoints(false);
      return;
    }
    
    // Map platform to action name
    const actionMap: Record<SharePlatform, string> = {
      fb: 'share_fb',
      ig: 'share_ig',
      x: 'share_x',
      tt: 'share_tiktok',
      truth: 'share_truth',
    };
    
    const action = actionMap[platform];
    const res = await fetch('/api/points/award', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Email': email,
      },
      body: JSON.stringify({
        action,
        source: 'share_page',
        targetVariant: target,
      }),
    });
    
    if (res.ok) {
      setPointsAwarded(true);
      // Optionally refresh parent window if it exists
      if (window.opener) {
        window.opener.postMessage({ type: 'points_awarded', action }, '*');
      }
    }
    setAwardingPoints(false);
  };
  
  // Copy caption handler
  const handleCopyCaption = async () => {
    if (hasCopied) return; // Prevent double-clicking
    
    try {
      // Copy to clipboard
      await navigator.clipboard.writeText(caption);
      setHasCopied(true);
      
      // Award points for FB (X awards on "Open X to post", IG awards on "I posted")
      if (platform === 'fb') {
        await awardPoints();
      }
    } catch (err) {
      console.error('[share] Failed to copy', err);
      alert('Please select and copy the caption manually.');
    }
  };

  // Download video handler (IG-specific)
  const handleDownloadVideo = () => {
    // Simple direct download
    const link = document.createElement('a');
    link.href = videoUrl;
    link.download = `agnes-protocol-${platform}-${variant}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setVideoDownloaded(true);
  };

  // "I posted to Instagram" handler (IG-specific)
  const handleIPosted = async () => {
    if (pointsAwarded) return; // Prevent double-awarding
    
    try {
      await awardPoints();
      alert('Nice. Your Instagram post is now part of the game.');
    } catch (err) {
      console.error('[share] Failed to track IG share', err);
      alert('Failed to record your post. Please try again.');
    }
  };
  
  // Open platform handler - awards points for X when clicked
  const handleOpenPlatform = async () => {
    // For X platform, award points when opening the composer (proxy for intent)
    if (platform === 'x' && !pointsAwarded) {
      await awardPoints();
    }
    
    // Open the platform share URL in a new tab
    window.open(platformShareUrl, '_blank', 'noopener,noreferrer');
  };
  
  const platformName = platformNames[platform];
  
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
    >
      {/* Video/Thumbnail */}
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
          autoPlay
          loop
          muted
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
          }}
        />
      </div>
      
      {/* Caption Box */}
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
      {platform === 'ig' ? (
        // IG-specific instructions (manual posting flow)
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
                  background: videoDownloaded ? '#10b981' : (hasCopied ? '#3b82f6' : 'rgba(148, 163, 184, 0.3)'),
                  color: 'white',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  marginRight: '0.75rem',
                }}
              >
                {videoDownloaded ? '✓' : '2'}
              </span>
              <span style={{ fontSize: '1rem', color: videoDownloaded ? '#10b981' : (hasCopied ? 'white' : '#94a3b8') }}>
                Click "Download video"
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
                Post video and caption on Instagram
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
                  background: pointsAwarded ? '#10b981' : 'rgba(148, 163, 184, 0.3)',
                  color: 'white',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  marginRight: '0.75rem',
                }}
              >
                {pointsAwarded ? '✓' : '4'}
              </span>
              <span style={{ fontSize: '1rem', color: pointsAwarded ? '#10b981' : '#94a3b8' }}>
                Click "I posted to Instagram"
              </span>
            </div>
          </div>
        </div>
      ) : (
        // Default instructions for FB/X (existing flow)
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
      
      {/* Copy Caption Button (Primary) */}
      <button
        onClick={handleCopyCaption}
        disabled={hasCopied || awardingPoints}
        style={{
          padding: '1rem 2.5rem',
          borderRadius: 999,
          border: 'none',
          background: hasCopied 
            ? '#10b981' 
            : awardingPoints 
            ? '#64748b' 
            : '#3b82f6',
          color: 'white',
          fontSize: '1.1rem',
          fontWeight: 700,
          cursor: hasCopied || awardingPoints ? 'not-allowed' : 'pointer',
          marginBottom: '1rem',
          minWidth: '200px',
          transition: 'all 0.2s',
        }}
      >
        {awardingPoints 
          ? 'Awarding points...' 
          : hasCopied 
          ? '✓ Copied!' 
          : 'Copy caption'}
      </button>
      
      {/* Success Message */}
      {hasCopied && platform !== 'ig' && (
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
      
      {/* IG-specific buttons */}
      {platform === 'ig' ? (
        <>
          {/* Download Video Button */}
          <button
            onClick={handleDownloadVideo}
            disabled={!hasCopied}
            style={{
              padding: '1rem 2.5rem',
              borderRadius: 999,
              border: '1px solid rgba(148, 163, 184, 0.45)',
              background: hasCopied ? (videoDownloaded ? '#10b981' : 'rgba(56, 239, 125, 0.1)') : 'transparent',
              color: hasCopied ? (videoDownloaded ? 'white' : '#38ef7d') : '#94a3b8',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: hasCopied ? 'pointer' : 'not-allowed',
              marginBottom: '1rem',
              minWidth: '200px',
              transition: 'all 0.2s',
            }}
          >
            {videoDownloaded ? '✓ Video downloaded' : 'Download video'}
          </button>
          
          {/* I Posted Button */}
          <button
            onClick={handleIPosted}
            disabled={pointsAwarded || awardingPoints}
            style={{
              padding: '1rem 2.5rem',
              borderRadius: 999,
              border: 'none',
              background: pointsAwarded 
                ? '#10b981' 
                : awardingPoints 
                ? '#64748b' 
                : '#c026d3',
              color: 'white',
              fontSize: '1.1rem',
              fontWeight: 700,
              cursor: pointsAwarded || awardingPoints ? 'not-allowed' : 'pointer',
              marginBottom: '1rem',
              minWidth: '200px',
              transition: 'all 0.2s',
            }}
          >
            {awardingPoints 
              ? 'Awarding points...' 
              : pointsAwarded 
              ? '✓ Posted!' 
              : 'I posted to Instagram'}
          </button>
        </>
      ) : (
        /* Open Platform Button (for FB/X) */
        <button
          onClick={handleOpenPlatform}
          disabled={!hasCopied}
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
          }}
        >
          Open {platformName} to post
        </button>
      )}
      
      {/* Instagram Help Panel - Only show for IG platform */}
      {platform === 'ig' && <IGHelpPanel />}
      
      {/* Optional: Back to Score */}
      <button
        onClick={() => router.push('/contest/score')}
        style={{
          padding: '0.75rem 1.5rem',
          borderRadius: 999,
          border: '1px solid rgba(148, 163, 184, 0.3)',
          background: 'transparent',
          color: '#94a3b8',
          fontSize: '0.9rem',
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        ← Back to Score
      </button>

      {/* Jody IG helper, bottom-right - Only show for IG platform */}
      {platform === 'ig' && <JodyAssistant variant="ig" autoShowDelayMs={4000} />}
      <HelpButton />
    </div>
  );
}
