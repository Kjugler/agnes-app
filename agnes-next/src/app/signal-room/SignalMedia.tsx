'use client';

import React, { useEffect, useState } from 'react';
import { getMediaSource } from '@/lib/signal-media-utils';

type SignalMediaProps = {
  mediaType?: string | null;
  mediaUrl?: string | null;
  variant?: 'default' | 'featured';
};

function MediaLoadError({ url, borderRadius, marginTop }: { url: string; borderRadius: number; marginTop: string }) {
  return (
    <div
      style={{
        backgroundColor: '#1a1f3a',
        border: '1px solid #5a3a3a',
        borderRadius,
        padding: '1rem',
        marginTop,
        color: '#e0a0a0',
        fontSize: '0.88em',
        lineHeight: 1.45,
      }}
    >
      Media failed to load in the room.{' '}
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#00ffe0', textDecoration: 'underline' }}>
        Open asset URL
      </a>
    </div>
  );
}

export default function SignalMedia({ mediaType, mediaUrl, variant = 'default' }: SignalMediaProps) {
  const source = getMediaSource(mediaUrl, mediaType);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoadError(false);
  }, [mediaUrl, mediaType]);

  if (!source) return null;

  const isFeatured = variant === 'featured';
  const marginTop = isFeatured ? '1rem' : '0.5rem';
  const borderRadius = isFeatured ? 12 : 8;
  const imageStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: '100%',
    maxHeight: isFeatured ? 520 : 400,
    objectFit: 'contain',
    borderRadius,
    marginTop,
    backgroundColor: '#0a0e27',
    display: 'block',
  };
  const videoStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: '100%',
    aspectRatio: '16/9',
    objectFit: 'contain',
    borderRadius,
    marginTop,
    backgroundColor: '#0a0e27',
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
      if (loadError) {
        return <MediaLoadError url={source.url} borderRadius={borderRadius} marginTop={marginTop} />;
      }
      return (
        <img
          src={source.url}
          alt="Signal media"
          loading={isFeatured ? 'eager' : 'lazy'}
          style={imageStyle}
          onError={() => setLoadError(true)}
        />
      );
    }
    if (source.type === 'video') {
      if (loadError) {
        return <MediaLoadError url={source.url} borderRadius={borderRadius} marginTop={marginTop} />;
      }
      return (
        <video
          src={source.url}
          controls
          playsInline
          preload={isFeatured ? 'auto' : 'metadata'}
          style={videoStyle}
          onError={() => setLoadError(true)}
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
