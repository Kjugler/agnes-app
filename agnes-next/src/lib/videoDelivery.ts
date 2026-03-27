import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { detectDevice, type DeviceType } from './device';
import { pickAsset } from './assetRotation';
import type { SharePlatform } from './shareAssets';

/**
 * Public base URL for share-download videos (no trailing slash).
 * Production (Vercel): never read public/videos in serverless — it bloats the bundle.
 * Redirect to the same-origin static path `/videos/<file>` served by the CDN.
 */
function getShareVideoPublicBase(req: NextRequest): string | null {
  const explicit =
    process.env.SHARE_VIDEO_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SHARE_VIDEO_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) return site.replace(/\/$/, '');
  if (process.env.NODE_ENV !== 'production') {
    return req.nextUrl.origin;
  }
  return null;
}

const PLATFORM_VIDEOS: Record<string, Record<number, string>> = {
  fb: { 1: 'fb1.mp4', 2: 'fb2.mp4', 3: 'fb3.mp4' },
  ig: { 1: 'ig1.mp4', 2: 'ig2.mp4', 3: 'ig3.mp4' },
  x: { 1: 'x1.mp4', 2: 'x2.mp4', 3: 'x3.mp4' },
  tt: { 1: 'tiktok1.mp4', 2: 'tiktok2.mp4', 3: 'tiktok3.mp4' },
  truth: { 1: 'truth1.mp4', 2: 'truth2.mp4', 3: 'truth3.mp4' },
};

function getDevice(req: NextRequest): DeviceType {
  const override = req.nextUrl.searchParams.get('device');
  if (override === 'ios' || override === 'android' || override === 'desktop') {
    return override;
  }
  const cookie = req.cookies.get('dq_device')?.value;
  if (cookie === 'ios' || cookie === 'android' || cookie === 'desktop') {
    return cookie;
  }
  return detectDevice(req);
}

/**
 * Get filename for platform + variant. Uses pickAsset for FB (rotation), direct map for others.
 * For FB, also returns assetId for cookie persistence.
 */
function getAssetInfo(
  platform: SharePlatform,
  variant: number,
  req: NextRequest
): { filename: string; assetId?: string } {
  if (platform === 'fb') {
    const cookieKey = `dq_asset_fb_${variant}`;
    const result = pickAsset({
      platform: 'fb',
      variant,
      device: getDevice(req),
      ref: req.nextUrl.searchParams.get('ref') || undefined,
      secret: req.nextUrl.searchParams.get('secret') || undefined,
      visitorCookie: req.cookies.get('dq_visitor')?.value,
      assetCookie: req.cookies.get(cookieKey) ? `${cookieKey}=${req.cookies.get(cookieKey)?.value}` : undefined,
    });
    return { filename: result.filename, assetId: result.assetId };
  }
  const map = PLATFORM_VIDEOS[platform];
  return { filename: map?.[variant] || 'fb1.mp4' };
}

export type ServeVideoOptions = {
  platform: SharePlatform;
  req: NextRequest;
};

export async function serveShareVideo({ platform, req }: ServeVideoOptions): Promise<Response> {
  const variantParam = req.nextUrl.searchParams.get('variant');
  const variant = Math.min(3, Math.max(1, parseInt(variantParam || '1', 10) || 1));
  const { filename, assetId } = getAssetInfo(platform, variant, req);

  const publicBase = getShareVideoPublicBase(req);

  // Production / configured hosts: redirect to static `/videos/*` (not bundled into serverless).
  if (publicBase) {
    try {
      const videoPath = `/videos/${encodeURIComponent(filename)}`;
      const target = new URL(videoPath, publicBase.endsWith('/') ? publicBase : `${publicBase}/`);
      const res = NextResponse.redirect(target, 307);
      res.headers.set('Cache-Control', 'public, max-age=86400');
      if (platform === 'fb' && assetId) {
        res.headers.append(
          'Set-Cookie',
          `dq_asset_fb_${variant}=${assetId}; Path=/; Max-Age=604800; SameSite=Lax`
        );
      }
      return res;
    } catch (err) {
      console.error(`[api/share/${platform}/video] Redirect build failed`, err);
      return NextResponse.json(
        { error: 'Video redirect failed', detail: 'Check NEXT_PUBLIC_SITE_URL or SHARE_VIDEO_PUBLIC_BASE_URL' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    {
      error: 'Share video URL not configured',
      detail: 'Set NEXT_PUBLIC_SITE_URL or SHARE_VIDEO_PUBLIC_BASE_URL (e.g. your Vercel deployment URL).',
    },
    { status: 503 }
  );
}
