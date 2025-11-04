// TikTok helper page - similar to /s/ig
// This page shows content that users can share on TikTok
// The caption is already copied to clipboard when they arrive here

export default function TikTokSharePage() {
  return (
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
      <div style={{ maxWidth: 900, margin: '40px auto', padding: 16, textAlign: 'center' }}>
        <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>Caption Copied!</h1>
        <p style={{ fontSize: '16px', marginBottom: '24px', opacity: 0.9 }}>
          Your caption is ready to paste. Open TikTok and create a new post.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
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
      </div>
    </div>
  );
}

