import type { NextRequest } from 'next/server';

export type DeviceType = 'desktop' | 'ios' | 'android';

const BOT_PATTERNS = [
  'facebookexternalhit',
  'Facebot',
  'Twitterbot',
  'Slackbot',
  'Discordbot',
  'LinkedInBot',
  'Googlebot',
  'bingbot',
  'DuckDuckBot',
  'Applebot',
  'TelegramBot',
  'WhatsApp',
  'Pinterest',
  'Snapchat',
  'Discord',
];

function getHeaders(reqOrHeaders: NextRequest | Headers): Headers {
  return reqOrHeaders instanceof Headers ? reqOrHeaders : reqOrHeaders.headers;
}

function getUa(reqOrHeaders: NextRequest | Headers): string {
  return getHeaders(reqOrHeaders).get('user-agent') || '';
}

function getHeader(reqOrHeaders: NextRequest | Headers, name: string): string | null {
  return getHeaders(reqOrHeaders).get(name);
}

/**
 * Detect if the request is from a known crawler/bot.
 * Bots must be treated as desktop for OG scraping.
 */
export function isBot(req: NextRequest): boolean {
  const ua = getUa(req);
  return BOT_PATTERNS.some((pattern) => ua.includes(pattern));
}

/**
 * Detect device type from request or headers (server-side, single source of truth).
 * Uses Client Hints first when present, then User-Agent fallback.
 * Bots are always treated as desktop.
 */
export function detectDevice(reqOrHeaders: NextRequest | Headers): DeviceType {
  const ua = getUa(reqOrHeaders);
  if (BOT_PATTERNS.some((pattern) => ua.includes(pattern))) {
    return 'desktop';
  }

  // Client Hints (when present)
  const secChUaPlatform = getHeader(reqOrHeaders, 'sec-ch-ua-platform')?.toLowerCase();
  if (secChUaPlatform) {
    if (secChUaPlatform.includes('android')) return 'android';
    if (secChUaPlatform.includes('ios') || secChUaPlatform.includes('iphone') || secChUaPlatform.includes('ipad')) return 'ios';
  }

  // User-Agent fallback
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';

  return 'desktop';
}

/** Client-side iOS detection (Safari, Chrome/CriOS, Firefox/FxiOS on iPhone/iPad). */
export function isIOSMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/**
 * Client-side mobile touch browsers that use the Dorothy two-tap bridge-first flow.
 * Covers iOS Safari/Chrome, Android Chrome, Samsung Internet, and other Android WebViews.
 */
export function isMobileTouchBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (isIOSMobileBrowser()) return true;
  if (/Android/i.test(ua)) return true;
  return false;
}
