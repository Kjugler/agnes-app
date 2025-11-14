// src/lib/urls.ts

/**
 * Build an absolute URL using the public site base.
 * - Uses NEXT_PUBLIC_SITE_URL (or SITE_URL as a backup)
 * - Never falls back to localhost
 * - Accepts already-absolute URLs and returns them unchanged
 */
const RAW_BASE =
  (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || '')
    .trim()
    .replace(/\/+$/, ''); // strip trailing slashes

export function absoluteUrl(path: string): string {
  // If it's already absolute (http/https), just return it
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  // Normalize the path to start with a single "/"
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // If we have a configured base, use it
  if (RAW_BASE) {
    return `${RAW_BASE}${normalizedPath}`;
  }

  // Last resort: return just the path (no localhost, no guessing)
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      '[absoluteUrl] NEXT_PUBLIC_SITE_URL/SITE_URL not set; returning relative path only:',
      normalizedPath,
    );
  }
  return normalizedPath;
}
