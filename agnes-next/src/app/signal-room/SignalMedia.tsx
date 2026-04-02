'use client';

import { getMediaSource } from '@/lib/signal-media-utils';

type SignalMediaProps = {
  mediaType?: string | null;
  mediaUrl?: string | null;
  variant?: 'default' | 'featured';
};

export default function SignalMedia({ mediaType, mediaUrl, variant = 'default' }: SignalMediaProps) {
  const source = getMediaSource(mediaUrl, mediaType);
  if (!source) return null;

  const isFeatured = variant === 'featured';
  const marginTop = isFeatured ? '1rem' : '0.5rem';
  const borderRadius = isFeatured ? 12 : 8;
  const containerStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: '100%',
    aspectRatio: '16/9',
    objectFit: 'cover',
    borderRadius,
    marginTop,
  };

  if (source.kind === 'youtube' || source.kind === 'vimeo') {
    return (
      <iframe
        src={source.embedUrl}
        title={source.kind === 'youtube' ? 'YouTube video' : 'Vimeo video'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        style={{
          width: '100%',
          aspectRatio: '16/9',
          border: 'none',
          borderRadius,
          marginTop,
        }}
      />
    );
  }

  if (source.kind === 'direct') {
    if (source.type === 'image') {
      return (
        <img
          src={source.url}
          alt="Signal media"
          loading={isFeatured ? 'eager' : 'lazy'}
          style={containerStyle}
        />
      );
    }
    if (source.type === 'video') {
      return (
        <video
          src={source.url}
          controls
          playsInline
          preload={isFeatured ? 'auto' : 'metadata'}
          style={containerStyle}
        />
      );
    }
    if (source.type === 'pdf') {
      return (
        <iframe
          src={source.url}
          title="PDF attachment"
          style={{
            width: '100%',
            minHeight: isFeatured ? 520 : 420,
            border: 'none',
            borderRadius,
            marginTop,
            backgroundColor: '#0a0e27',
          }}
        />
      );
    }
    if (source.type === 'audio') {
      return (
        <audio
          src={source.url}
          controls
          preload="metadata"
          style={{
            width: '100%',
            marginTop,
          }}
        />
      );
    }
  }

  // Unsupported / fallback
  return (
    <div
      style={{
        backgroundColor: '#1a1f3a',
        border: '1px solid #2a3a4a',
        borderRadius,
        padding: '1rem',
        marginTop,
        color: '#888',
        fontSize: '0.9em',
        textAlign: 'center',
      }}
    >
      <span style={{ marginRight: '0.5rem' }}>Media source not embeddable</span>
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: '#00ffe0', textDecoration: 'underline' }}
      >
        Open in new tab
      </a>
    </div>
  );
}
