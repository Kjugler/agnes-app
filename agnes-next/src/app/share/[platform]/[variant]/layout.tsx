import type { Metadata } from 'next';
import type { SharePlatform } from '@/lib/shareAssets';

type Params = { platform?: string; variant?: string };
type Search = { ref?: string; target?: string };

// TEMP: hard-wire the current public base URL so Facebook always
// gets a real, https, non-localhost URL.
const BASE_URL = 'https://simona-nonindictable-pseudoapoplectically.ngrok-free.dev';

export async function generateMetadata(
  props: {
    params: Promise<Params> | Params;
    searchParams: Promise<Search> | Search | undefined;
  }
): Promise<Metadata> {
  const p = await props.params;
  const sp = props.searchParams ? await props.searchParams : undefined;

  const platform = (p?.platform as SharePlatform) || 'fb';
  const variantRaw = Number(p?.variant ?? '1') || 1;
  const variant = (variantRaw >= 1 && variantRaw <= 3 ? variantRaw : 1) as 1 | 2 | 3;

  const refCode = typeof sp?.ref === 'string' ? sp.ref : '';
  const target = typeof sp?.target === 'string' ? sp.target : 'challenge';

  // Build absolute URLs by hand – no helpers, no env, no localhost.
  const imageUrl = `${BASE_URL}/images/fb/fb${variant}.jpg`;

  const query = [
    refCode ? `ref=${encodeURIComponent(refCode)}` : '',
    target ? `target=${encodeURIComponent(target)}` : '',
  ]
    .filter(Boolean)
    .join('&');

  const shareUrl = `${BASE_URL}/share/${platform}/${variant}${query ? `?${query}` : ''}`;

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

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
