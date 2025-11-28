import { REFER_VIDEOS, ReferVideoId } from '@/config/referVideos';
import ReferActions from './ReferActions';

interface ReferPageProps {
  searchParams: {
    code?: string;
    v?: string;
    src?: string;
  };
}

export default function ReferPage({ searchParams }: ReferPageProps) {
  const referralCode = (searchParams.code || '').trim();
  const videoIdParam = (searchParams.v || 'fb1').trim() as ReferVideoId;

  const videoConfig =
    REFER_VIDEOS.find((v) => v.id === videoIdParam) ?? REFER_VIDEOS[0];

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '2rem 1rem',
        backgroundColor: '#fff',
      }}
    >
      <div style={{ width: '100%', maxWidth: '48rem' }}>
        <h1
          style={{
            fontSize: '1.875rem',
            fontWeight: 700,
            marginBottom: '0.5rem',
            color: '#1a1a1a',
          }}
        >
          Someone you know sent you this.
        </h1>
        <p
          style={{
            fontSize: '0.875rem',
            color: '#666',
            marginBottom: '1.5rem',
            lineHeight: 1.6,
          }}
        >
          A friend invited you to check out <strong>The Agnes Protocol</strong>.
          Watch the short video below, then decide if you&apos;re ready to play.
        </p>

        {/* Video player */}
        <div style={{ marginBottom: '1.5rem' }}>
          <video
            src={videoConfig.videoSrc}
            controls
            autoPlay
            loop
            playsInline
            style={{
              width: '100%',
              borderRadius: '0.5rem',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}
          />
          <p
            style={{
              marginTop: '0.5rem',
              fontSize: '0.75rem',
              color: '#999',
            }}
          >
            {videoConfig.label} — {videoConfig.description}
          </p>
        </div>

        {/* Actions (client-side) */}
        <ReferActions referralCode={referralCode} videoId={videoConfig.id} />
      </div>
    </div>
  );
}

