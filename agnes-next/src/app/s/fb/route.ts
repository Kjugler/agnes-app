import { Metadata } from 'next';

type Props = {
  searchParams: { v?: string; ref?: string };
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const v = Number(searchParams.v || '1');
  const validV = [1, 2, 3].includes(v) ? v : 1;
  
  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3002';
  const image = `${origin}/images/fb${validV}.jpg`;
  const video = `${origin}/videos/fb${validV}.mp4`;
  const pageUrl = `${origin}/s/fb?v=${validV}${searchParams.ref ? `&ref=${encodeURIComponent(searchParams.ref)}` : ''}`;
  
  const title = 'The Agnes Protocol — The End of Truth Begins Here';
  const desc = 'A cinematic thriller that weaponizes truth. #WhereIsJodyVernon';
  
  return {
    title,
    description: desc,
    openGraph: {
      url: pageUrl,
      type: 'video.other',
      title,
      description: desc,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
        },
      ],
      videos: [
        {
          url: video,
          type: 'video/mp4',
          width: 1280,
          height: 720,
        },
      ],
    },
    twitter: {
      card: 'player',
      title,
      description: desc,
      images: [image],
    },
  };
}

export default function FBSharePage({ searchParams }: Props) {
  const v = Number(searchParams.v || '1');
  const validV = [1, 2, 3].includes(v) ? v : 1;
  const ref = searchParams.ref || '';
  
  // Redirect to home after a brief delay (allows FB to scrape)
  const redirectScript = `
    <script>
      setTimeout(function() {
        window.location.href = '/';
      }, 300);
    </script>
  `;
  
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: redirectScript }} />
      <div style={{
        margin: 0,
        fontFamily: 'system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        background: '#0b0b0b',
        color: '#fff',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ maxWidth: 900, margin: '40px auto', padding: 16 }}>
          <video
            src={`/videos/fb${validV}.mp4`}
            poster={`/images/fb${validV}.jpg`}
            controls
            playsInline
            muted
            style={{ width: '100%', borderRadius: 14 }}
          />
          <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a
              href="/contest/score"
              style={{
                background: '#16a34a',
                color: '#fff',
                padding: '10px 14px',
                borderRadius: 10,
                textDecoration: 'none',
                fontWeight: 700,
              }}
            >
              See my score
            </a>
            <a
              href="/buy"
              style={{
                background: '#16a34a',
                color: '#fff',
                padding: '10px 14px',
                borderRadius: 10,
                textDecoration: 'none',
                fontWeight: 700,
              }}
            >
              Buy the book
            </a>
          </div>
          {ref && (
            <div style={{ opacity: 0.8, fontSize: 14, marginTop: 10 }}>
              Ref: {ref}
            </div>
          )}
        </div>
      </div>
    </>
  );
}