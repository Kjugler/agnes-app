/**
 * Detect embeddable media sources (YouTube, Vimeo) and normalize to embed URLs.
 * Used by SignalMedia for client-side rendering.
 */

export type MediaSource =
  | { kind: 'direct'; type: 'image' | 'video' | 'audio'; url: string }
  | { kind: 'youtube'; embedUrl: string }
  | { kind: 'vimeo'; embedUrl: string }
  | { kind: 'unsupported'; url: string };

const YOUTUBE_PATTERNS = [
  /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/i,
  /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/i,
];

const VIMEO_PATTERNS = [
  /vimeo\.com\/(?:video\/)?(\d+)/i,
  /player\.vimeo\.com\/video\/(\d+)/i,
];

function extractYouTubeId(url: string): string | null {
  for (const re of YOUTUBE_PATTERNS) {
    const m = url.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

function extractVimeoId(url: string): number | null {
  for (const re of VIMEO_PATTERNS) {
    const m = url.match(re);
    if (m?.[1]) return parseInt(m[1], 10);
  }
  return null;
}

function isDirectVideoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.endsWith('.mp4') ||
    lower.endsWith('.webm') ||
    lower.endsWith('.ogg') ||
    lower.endsWith('.mov') ||
    lower.includes('video/')
  );
}

function isDirectImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.match(/\.(jpg|jpeg|png|gif|webp|avif)(\?|$)/) != null ||
    lower.includes('image/')
  );
}

/**
 * Analyze mediaUrl (and optional mediaType hint) and return how to render it.
 * IMPORTANT: URL-based detection (YouTube, Vimeo) always wins over mediaType hint.
 * mediaType=video must NOT cause YouTube URLs to use native <video>.
 */
export function getMediaSource(
  mediaUrl: string | null | undefined,
  mediaTypeHint?: string | null
): MediaSource | null {
  if (!mediaUrl?.trim()) return null;
  const url = mediaUrl.trim();

  // 1. ALWAYS check URL for embeddable sources first - never bypass for mediaType
  const ytId = extractYouTubeId(url);
  if (ytId) {
    return {
      kind: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${ytId}`,
    };
  }

  const vimeoId = extractVimeoId(url);
  if (vimeoId) {
    return {
      kind: 'vimeo',
      embedUrl: `https://player.vimeo.com/video/${vimeoId}`,
    };
  }

  // 2. Only then consider direct files (by URL pattern or mediaType hint)
  const hint = (mediaTypeHint || '').toLowerCase();
  if (hint === 'image' || isDirectImageUrl(url)) {
    return { kind: 'direct', type: 'image', url };
  }
  if (hint === 'video' || isDirectVideoUrl(url)) {
    return { kind: 'direct', type: 'video', url };
  }
  if (hint === 'audio') {
    return { kind: 'direct', type: 'audio', url };
  }

  return { kind: 'unsupported', url };
}
