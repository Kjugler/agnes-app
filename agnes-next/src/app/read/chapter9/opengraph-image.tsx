import { ImageResponse } from 'next/og';

export const alt = 'Chapter 9 – The Agnes Protocol — Before everything changed.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Crawler-facing OG image: calm book-page preview (no homepage / alarm aesthetic). */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'row',
          backgroundColor: '#f7f4ee',
        }}
      >
        {/* Book inner margin */}
        <div
          style={{
            width: 56,
            borderRight: '1px solid #e2dcd0',
            backgroundColor: '#faf7f1',
          }}
        />
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: '72px 64px 72px 56px',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontSize: 26,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#7a7268',
              marginBottom: 28,
              fontFamily: 'Georgia, "Times New Roman", serif',
            }}
          >
            The Agnes Protocol
          </div>
          <div
            style={{
              fontSize: 62,
              fontWeight: 600,
              color: '#1c1917',
              marginBottom: 36,
              fontFamily: 'Georgia, "Times New Roman", serif',
              lineHeight: 1.15,
            }}
          >
            Chapter 9
          </div>
          <div
            style={{
              fontSize: 34,
              fontStyle: 'italic',
              color: '#44403c',
              marginBottom: 44,
              fontFamily: 'Georgia, "Times New Roman", serif',
              lineHeight: 1.35,
              maxWidth: 920,
            }}
          >
            Before everything changed.
          </div>
          {/* Faux paragraph lines — book excerpt feel without real copy */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 880 }}>
            {[0.92, 0.88, 0.95, 0.72].map((w, i) => (
              <div
                key={i}
                style={{
                  height: 10,
                  borderRadius: 2,
                  backgroundColor: '#d9d3c9',
                  width: `${Math.round(w * 100)}%`,
                  opacity: 0.55,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
