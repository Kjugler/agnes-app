import type { NextRequest } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { detectDevice } from './device';
import { pickAsset } from './assetRotation';
import type { SharePlatform } from './shareAssets';

export type DeviceType = 'desktop' | 'ios' | 'android';

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

/**
 * Get Content-Disposition based on device.
 * iOS + desktop: attachment (triggers Save bar)
 * Android: inline (saves to Gallery/Downloads cleanly)
 */
function getContentDisposition(device: DeviceType, filename: string): string {
  if (device === 'android') {
    return `inline; filename="${filename}"`;
  }
  return `attachment; filename="${filename}"`;
}

export type ServeVideoOptions = {
  platform: SharePlatform;
  req: NextRequest;
};

export async function serveShareVideo({ platform, req }: ServeVideoOptions): Promise<Response> {
  const variantParam = req.nextUrl.searchParams.get('variant');
  const variant = Math.min(3, Math.max(1, parseInt(variantParam || '1', 10) || 1));
  const device = getDevice(req);
  const { filename, assetId } = getAssetInfo(platform, variant, req);
  const downloadFilename = `agnes-protocol-${platform}-${variant}.mp4`;

  try {
    const filePath = path.join(process.cwd(), 'public', 'videos', filename);
    const buffer = await readFile(filePath);

    const response = new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': getContentDisposition(device, downloadFilename),
        'Cache-Control': 'public, max-age=86400',
        'Content-Length': String(buffer.byteLength),
      },
    });

    // Persist FB asset choice for 7 days so user sees same creative
    if (platform === 'fb' && assetId) {
      response.headers.append(
        'Set-Cookie',
        `dq_asset_fb_${variant}=${assetId}; Path=/; Max-Age=604800; SameSite=Lax`
      );
    }

    return response;
  } catch (err) {
    console.error(`[api/share/${platform}/video] Failed to serve video`, err);
    return new Response(JSON.stringify({ error: 'Video not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
