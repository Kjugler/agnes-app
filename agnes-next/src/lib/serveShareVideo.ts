import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { detectDevice } from './device';
import { pickAsset } from './assetRotation';
import type { SharePlatform } from './shareAssets';

const PLATFORM_VIDEOS: Record<SharePlatform, Record<number, string>> = {
  fb: { 1: 'fb1.mp4', 2: 'fb2.mp4', 3: 'fb3.mp4' },
  ig: { 1: 'ig1.mp4', 2: 'ig2.mp4', 3: 'ig3.mp4' },
  x: { 1: 'x1.mp4', 2: 'x2.mp4', 3: 'x3.mp4' },
  tt: { 1: 'tiktok1.mp4', 2: 'tiktok2.mp4', 3: 'tiktok3.mp4' },
  truth: { 1: 'truth1.mp4', 2: 'truth2.mp4', 3: 'truth3.mp4' },
};

type ServeOptions = {
  platform: SharePlatform;
  variant: number;
  req: NextRequest;
};

/**
 * Serve share video with device-aware headers and optional asset rotation (FB).
 * iOS → attachment, Android → inline, Desktop → inline
 */
export async function serveShareVideo({ platform, variant, req }: ServeOptions): Promise<NextResponse> {
  const deviceCookie = req.cookies.get('dq_device')?.value;
  const deviceOverride = req.nextUrl.searchParams.get('device');
  let device: 'desktop' | 'ios' | 'android' = 'desktop';
  if (deviceOverride === 'ios' || deviceOverride === 'android' || deviceOverride === 'desktop') {
    device = deviceOverride;
  } else if (deviceCookie === 'ios' || deviceCookie === 'android' || deviceCookie === 'desktop') {
    device = deviceCookie;
  } else {
    device = detectDevice(req);
  }

  let filename: string;
  let assetIdToCache: string | undefined;
  if (platform === 'fb') {
    const ref = req.nextUrl.searchParams.get('ref') || undefined;
    const visitorCookie = req.cookies.get('dq_visitor')?.value;
    const assetCookieVal = req.cookies.get(`dq_asset_${platform}_${variant}`)?.value;
    const assetCookie = assetCookieVal ? `dq_asset_${platform}_${variant}=${assetCookieVal}` : undefined;
    const result = pickAsset({ platform, variant, device, ref, visitorCookie, assetCookie });
    filename = result.filename;
    assetIdToCache = result.assetId;
  } else {
    const map = PLATFORM_VIDEOS[platform];
    filename = map?.[variant] || map?.[1] || 'fb1.mp4';
  }

  const filePath = path.join(process.cwd(), 'public', 'videos', filename);
  const buffer = await readFile(filePath);

  // Device-aware Content-Disposition
  const disposition = device === 'ios' ? 'attachment' : 'inline';
  const downloadFilename = `agnes-protocol-${platform}-${variant}.mp4`;

  const response = new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': `${disposition}; filename="${downloadFilename}"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(buffer.byteLength),
    },
  });

  // Cache chosen asset for FB (7-day stability)
  if (platform === 'fb' && assetIdToCache) {
    response.cookies.set(`dq_asset_${platform}_${variant}`, assetIdToCache, {
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
      sameSite: 'lax',
    });
  }

  return response;
}
