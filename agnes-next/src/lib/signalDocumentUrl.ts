/**
 * Paste-link validation for Signal document attachments (PDF / PNG / JPG).
 * Direct asset URLs work; viewer/sharing pages do not embed reliably.
 */

const BLOCKED_HOST_SUBSTRINGS = [
  'drive.google.com',
  'docs.google.com',
  'dropbox.com',
  'sharepoint.com',
  'onedrive.live.com',
  '1drv.ms',
  'notion.so',
];

/** Path must end with a supported extension (query string allowed after). */
function pathHasSupportedDocExtension(pathname: string): boolean {
  const base = pathname.split('/').pop() || '';
  const beforeQuery = base.split('?')[0] || '';
  return /\.(pdf|png|jpg|jpeg)$/i.test(beforeQuery);
}

function isVercelBlobSignalsUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return (
      u.protocol === 'https:' &&
      u.hostname.endsWith('.public.blob.vercel-storage.com') &&
      /\/signals\//i.test(u.pathname)
    );
  } catch {
    return false;
  }
}

export type DocumentUrlValidation = { ok: true } | { ok: false; error: string };

/**
 * Validates a pasted URL for mediaType=document.
 * Expects a direct https URL to a .pdf / .png / .jpg / .jpeg asset, or a Vercel Blob signals/* URL.
 */
export function validateDocumentPasteUrl(raw: string): DocumentUrlValidation {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: 'Enter a direct link to a PDF or image file, or upload a file.' };
  }
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return { ok: false, error: 'Invalid URL. Use a full https:// link to the file.' };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return { ok: false, error: 'Only http(s) URLs are supported.' };
  }

  const host = u.hostname.toLowerCase();
  for (const bad of BLOCKED_HOST_SUBSTRINGS) {
    if (host === bad || host.endsWith(`.${bad}`) || host.includes(bad)) {
      return {
        ok: false,
        error:
          'That host uses a viewer or sharing page, not a direct file link. Use “Share → link to file” only if it ends in .pdf or .png/.jpg, or upload the file instead. Google Drive “Open” /view links cannot be embedded.',
      };
    }
  }

  if (isVercelBlobSignalsUrl(trimmed)) {
    return { ok: true };
  }

  if (!pathHasSupportedDocExtension(u.pathname)) {
    return {
      ok: false,
      error:
        'URL must point directly to a file ending in .pdf, .png, .jpg, or .jpeg (not a folder or viewer page). Example: https://cdn.example.com/memo.pdf',
    };
  }

  return { ok: true };
}
