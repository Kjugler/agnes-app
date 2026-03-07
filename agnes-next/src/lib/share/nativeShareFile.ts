/**
 * Native share with file attachment (Web Share API + files)
 * Used for TikTok one-tap: Share Sheet opens with video attached.
 */

export type NativeShareResult =
  | { ok: true; mode: 'native_share_files' }
  | { ok: false; mode: 'unsupported' | 'failed'; error?: string };

const FETCH_TIMEOUT_MS = 15000;

/**
 * Fetch video as blob, create File, share via navigator.share if supported
 */
export async function nativeShareWithFile(
  videoUrl: string,
  caption: string,
  filename: string = 'agnes-protocol-tiktok.mp4'
): Promise<NativeShareResult> {
  console.log('[tt_share] tt_share_attempted');

  if (typeof navigator === 'undefined' || !navigator.share) {
    console.log('[tt_share] tt_share_files_supported=false (navigator.share not available)');
    return { ok: false, mode: 'unsupported', error: 'navigator.share not available' };
  }

  if (!navigator.canShare) {
    console.log('[tt_share] tt_share_files_supported=false (navigator.canShare not available)');
    return { ok: false, mode: 'unsupported', error: 'navigator.canShare not available' };
  }

  let blob: Blob;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(videoUrl, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      return { ok: false, mode: 'failed', error: `Fetch failed: ${res.status}` };
    }
    blob = await res.blob();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, mode: 'failed', error: msg };
  }

  const file = new File([blob], filename, { type: blob.type || 'video/mp4' });

  if (!navigator.canShare({ files: [file] })) {
    console.log('[tt_share] tt_share_files_supported=false (canShare({ files }) rejected)');
    return { ok: false, mode: 'unsupported', error: 'Sharing files not supported' };
  }

  console.log('[tt_share] tt_share_files_supported=true');
  console.log('[tt_share] share invoked');

  try {
    await navigator.share({
      files: [file],
      text: caption,
      title: 'The Agnes Protocol',
    });
    console.log('[tt_share] tt_share_success');
    return { ok: true, mode: 'native_share_files' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const name = (err as Error).name;
    console.log('[tt_share] tt_share_error_reason:', name === 'AbortError' ? 'tt_share_cancel' : msg);
    if (name === 'AbortError') {
      return { ok: false, mode: 'failed', error: 'Share cancelled' };
    }
    return { ok: false, mode: 'failed', error: msg };
  }
}

/**
 * Check if native share with files is supported (without fetching)
 */
export function canNativeShareFiles(): boolean {
  if (typeof navigator === 'undefined') return false;
  return typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
}

export type PrepareShareResult =
  | { ok: true; file: File }
  | { ok: false; error?: string };

/**
 * Prepare video for share: fetch as blob, create File, check canShare.
 * Does NOT invoke navigator.share. Use sharePreparedFile for that.
 */
export async function prepareShareFile(
  videoUrl: string,
  filename: string = 'agnes-protocol-tiktok.mp4'
): Promise<PrepareShareResult> {
  if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) {
    return { ok: false, error: 'navigator.share/canShare not available' };
  }

  let blob: Blob;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(videoUrl, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return { ok: false, error: `Fetch failed: ${res.status}` };
    blob = await res.blob();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }

  const file = new File([blob], filename, { type: blob.type || 'video/mp4' });
  if (!navigator.canShare({ files: [file] })) {
    return { ok: false, error: 'Sharing files not supported' };
  }
  return { ok: true, file };
}

/**
 * Share a prepared file via navigator.share. Must be called from user gesture.
 */
export async function sharePreparedFile(
  file: File,
  caption: string,
  title: string = 'The Agnes Protocol'
): Promise<{ ok: boolean; error?: string }> {
  if (typeof navigator === 'undefined' || !navigator.share) {
    return { ok: false, error: 'navigator.share not available' };
  }
  try {
    await navigator.share({
      files: [file],
      text: caption,
      title,
    });
    console.log('[tt_share] tt_share_success');
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const name = (err as Error).name;
    console.log('[tt_share] tt_share_error_reason:', name === 'AbortError' ? 'tt_share_cancel' : msg);
    return { ok: false, error: msg };
  }
}
