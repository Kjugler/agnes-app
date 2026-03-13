'use client';

export default function SignalMedia({ mediaType, mediaUrl }: { mediaType?: string | null; mediaUrl?: string | null }) {
  if (!mediaUrl) return null;
  const type = (mediaType || 'image').toLowerCase();
  if (type === 'image') {
    return (
      <img
        src={mediaUrl}
        alt="Signal media"
        loading="lazy"
        style={{
          width: '100%',
          maxWidth: '100%',
          aspectRatio: '16/9',
          objectFit: 'cover',
          borderRadius: 8,
          marginTop: '0.5rem',
        }}
      />
    );
  }
  if (type === 'video') {
    return (
      <video
        src={mediaUrl}
        controls
        playsInline
        preload="metadata"
        style={{
          width: '100%',
          maxWidth: '100%',
          aspectRatio: '16/9',
          borderRadius: 8,
          marginTop: '0.5rem',
        }}
      />
    );
  }
  if (type === 'audio') {
    return (
      <audio
        src={mediaUrl}
        controls
        preload="metadata"
        style={{
          width: '100%',
          marginTop: '0.5rem',
        }}
      />
    );
  }
  if (type === 'map') {
    return (
      <iframe
        src={mediaUrl}
        title="Map embed"
        style={{
          width: '100%',
          height: 250,
          border: 'none',
          borderRadius: 8,
          marginTop: '0.5rem',
        }}
      />
    );
  }
  return (
    <a
      href={mediaUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: '#00ffe0',
        fontSize: '0.9em',
        marginTop: '0.5rem',
        display: 'inline-block',
      }}
    >
      View document
    </a>
  );
}
