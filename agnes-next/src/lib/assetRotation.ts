import type { SharePlatform } from './shareAssets';

export type AssetEntry = {
  id: string;
  type: 'video' | 'image';
  file: string;
  mime: string;
};

/** FB asset catalog — rotation pool for FB share delivery */
export const FB_ASSETS: AssetEntry[] = [
  { id: 'fb1', type: 'video', file: 'fb1.mp4', mime: 'video/mp4' },
  { id: 'fb2', type: 'video', file: 'fb2.mp4', mime: 'video/mp4' },
  { id: 'fb3', type: 'video', file: 'fb3.mp4', mime: 'video/mp4' },
  { id: 'fb4', type: 'video', file: 'fb4.mp4', mime: 'video/mp4' },
  { id: 'fb5', type: 'video', file: 'fb5.mp4', mime: 'video/mp4' },
  { id: 'fb6', type: 'video', file: 'fb6.mp4', mime: 'video/mp4' },
  { id: 'fb7', type: 'video', file: 'fb7.mp4', mime: 'video/mp4' },
];

/** Map platform + variant to asset list (FB uses rotation; others use 1:1 for now) */
function getAssetList(platform: SharePlatform, variant: number): AssetEntry[] {
  if (platform === 'fb') {
    return FB_ASSETS;
  }
  // Other platforms: single asset per variant (no rotation yet)
  const fileMap: Record<string, Record<number, string>> = {
    ig: {
      1: 'ig1.mp4',
      2: 'ig2.mp4',
      3: 'ig3.mp4',
      4: 'ig4.mp4',
      5: 'ig5.mp4',
      6: 'ig6.mp4',
      7: 'ig7.mp4',
    },
    x: {
      1: 'x1.mp4',
      2: 'x2.mp4',
      3: 'x3.mp4',
      4: 'x4.mp4',
      5: 'x5.mp4',
      6: 'x6.mp4',
      7: 'x7.mp4',
    },
    tt: {
      1: 'tiktok1.mp4',
      2: 'tiktok2.mp4',
      3: 'tiktok3.mp4',
      4: 'tiktok4.mp4',
      5: 'tiktok5.mp4',
      6: 'tiktok6.mp4',
      7: 'tiktok7.mp4',
    },
    truth: {
      1: 'truth1.mp4',
      2: 'truth2.mp4',
      3: 'truth3.mp4',
      4: 'truth4.mp4',
      5: 'truth5.mp4',
      6: 'truth6.mp4',
      7: 'truth7.mp4',
    },
  };
  const file = fileMap[platform]?.[variant] || 'fb1.mp4';
  return [{ id: file.replace('.mp4', ''), type: 'video', file, mime: 'video/mp4' }];
}

/**
 * Simple hash for deterministic selection
 */
function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h = (h << 5) - h + c;
    h = h & h;
  }
  return Math.abs(h);
}

export type PickAssetInput = {
  platform: SharePlatform;
  variant: number;
  device: 'desktop' | 'ios' | 'android';
  ref?: string;
  secret?: string;
  visitorCookie?: string;
  assetCookie?: string; // dq_asset_fb_1=fb2 etc.
};

export type PickAssetResult = {
  assetId: string;
  assetPath: string;
  assetType: 'video' | 'image';
  filename: string;
};

/**
 * Pick asset for this request. Deterministic per user + variant.
 * Stability: if assetCookie provided, prefer it (7-day cache).
 * Otherwise: hash(seed + platform + variant) % assets.length
 */
export function pickAsset(input: PickAssetInput): PickAssetResult {
  const { platform, variant, device, ref, visitorCookie, assetCookie } = input;
  const assets = getAssetList(platform, variant);

  if (assets.length === 0) {
    return {
      assetId: 'fb1',
      assetPath: '/videos/fb1.mp4',
      assetType: 'video',
      filename: 'fb1.mp4',
    };
  }

  // Stability: cookie override (user saw this asset before)
  const cookieKey = `dq_asset_${platform}_${variant}`;
  if (assetCookie) {
    const parsed = assetCookie.split('=');
    if (parsed[0] === cookieKey && parsed[1]) {
      const found = assets.find((a) => a.id === parsed[1]);
      if (found) {
        return {
          assetId: found.id,
          assetPath: `/videos/${found.file}`,
          assetType: found.type as 'video' | 'image',
          filename: found.file,
        };
      }
    }
  }

  // Seed: ref > visitor cookie > fallback
  const seed = ref || visitorCookie || 'default';
  const index = hash(`${seed}-${platform}-${variant}`) % assets.length;
  const chosen = assets[index];

  return {
    assetId: chosen.id,
    assetPath: `/videos/${chosen.file}`,
    assetType: chosen.type as 'video' | 'image',
    filename: chosen.file,
  };
}
