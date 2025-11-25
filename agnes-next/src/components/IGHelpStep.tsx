'use client';

import { useEffect, useState } from 'react';

type IGHelpStepProps = {
  number: number;
  title: string;
  description: string | React.ReactNode;
  images: string[];
};

export function IGHelpStep({ number, title, description, images }: IGHelpStepProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Fade-in animation when component mounts
    const timer = setTimeout(() => setIsVisible(true), number * 100);
    return () => clearTimeout(timer);
  }, [number]);

  return (
    <div
      style={{
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 0.4s ease-in',
        marginBottom: '2rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '1rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
        }}
      >
        {/* Number Circle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '40px',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #b26bff 0%, #8b5cf6 100%)',
            color: 'white',
            fontSize: '1.25rem',
            fontWeight: 700,
            boxShadow: '0 0 20px rgba(178, 107, 255, 0.4)',
            flexShrink: 0,
          }}
        >
          {number}
        </div>

        {/* Title and Description */}
        <div style={{ flex: 1, minWidth: '200px' }}>
          <h3
            style={{
              fontSize: 'clamp(1rem, 4vw, 1.25rem)',
              fontWeight: 700,
              color: 'white',
              marginBottom: '0.5rem',
              marginTop: 0,
            }}
          >
            {title}
          </h3>
          <div
            style={{
              fontSize: 'clamp(0.9rem, 3vw, 1rem)',
              color: '#cbd5e1',
              lineHeight: 1.6,
            }}
          >
            {description}
          </div>
        </div>
      </div>

      {/* Images */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          marginTop: '1rem',
        }}
      >
        {images.map((imagePath, idx) => (
          <div
            key={idx}
            style={{
              width: '100%',
              maxWidth: '600px',
              margin: '0 auto',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
              background: '#1e293b',
            }}
          >
            <img
              src={imagePath}
              alt={`Step ${number} screenshot ${idx + 1}: ${title}`}
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
                objectFit: 'contain',
              }}
              loading="lazy"
              onError={(e) => {
                // Gracefully handle missing images
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const container = target.parentElement;
                if (container) {
                  container.innerHTML = `
                    <div style="padding: 2rem; text-align: center; color: #94a3b8;">
                      <p>Image not available</p>
                      <p style="font-size: 0.875rem; margin-top: 0.5rem;">${title}</p>
                    </div>
                  `;
                }
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

