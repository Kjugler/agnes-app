import type { Metadata } from 'next';
import type { SharePlatform } from '@/lib/shareAssets';
import { shareAssets } from '@/lib/shareAssets';

type Params = {
  platform: string;
  variant: string;
};

// Use configured site URL (must be set for Facebook sharing)
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXT_PUBLIC_SITE_URL or SITE_URL must be set for Facebook sharing');
  }
  return 'http://localhost:3002';
})();

export async function generateMetadata(
  { params }: { params: Promise<Params> }
): Promise<Metadata> {
  const { platform: platformRaw, variant: variantRaw } = await params;

  const platform = (platformRaw as SharePlatform) || 'fb';
  const variantNum = Number(variantRaw) || 1;
  const variant = (variantNum >= 1 && variantNum <= 3 ? variantNum : 1) as 1 | 2 | 3;

  // Get image path from shareAssets (X and IG platforms use FB thumbnails)
  const assets = shareAssets[platform]?.variants[variant];
  const thumbnailPath = assets?.thumbnail || `/images/fb/fb${variant}.jpg`;
  const imageUrl = `${BASE_URL}${thumbnailPath}`;

  // Build share URL without query params (query params handled at page level)
  const shareUrl = `${BASE_URL}/share/${platform}/${variant}`;

  const title = 'The Agnes Protocol—Exclusive Preview';
  const description =
    'Use my code for 15% off, earn points, rank up, and jump into the full experience. #WhereIsJodyVernon';

  return {
    title,
    description,
    // metadataBase is optional here since we're already absolute,
    // but we can set it for completeness.
    metadataBase: new URL(BASE_URL),
    openGraph: {
      url: shareUrl,
      type: 'website',
      title,
      description,
      images: [
        {
          url: imageUrl,
          secureUrl: imageUrl,
          width: 1200,
          height: 630,
          alt: 'The Agnes Protocol—Exclusive Preview',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };
}

type LayoutParams = { platform: string; variant: string };
type LayoutParamsPromise = Promise<LayoutParams>;

export default async function ShareLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: LayoutParamsPromise;
}) {
  const p = await params;
  return <>{children}</>;
}
