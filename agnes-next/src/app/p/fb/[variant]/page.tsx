import { headers } from 'next/headers';
import Link from 'next/link';
import type { ShareTarget } from '@/lib/shareTarget';
import { getShareVariantMedia, parseShareVariantParam } from '@/lib/shareAssets';

const SITE_ROOT = process.env.NEXT_PUBLIC_SITE_ROOT ?? 'https://TheAgnesProtocol.com';

type Props = {
  params: Promise<{ variant: string }>;
  searchParams: Promise<{ ref?: string; target?: string; secret?: string }>;
};

function getBaseUrl(host: string | null, protocol: string): string {
  const fallback = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;
  if (fallback) {
    return fallback.startsWith('http') ? fallback.replace(/\/$/, '') : `https://${fallback}`;
  }
  if (!host) return 'https://TheAgnesProtocol.com';
  const base = protocol === 'https' ? `https://${host}` : `http://${host}`;
  return base.replace(/\/$/, '');
}

export async function generateMetadata({ params, searchParams }: Props) {
  const { variant } = await params;
  const search = await searchParams;
  const variantNum = parseShareVariantParam(variant);
  const refCode = search.ref || '';
  const target = (search.target as ShareTarget) || 'challenge';

  const headersList = await headers();
  const host = headersList.get('host') || headersList.get('x-forwarded-host');
  const protocol = headersList.get('x-forwarded-proto') || 'https';
  const baseUrl = getBaseUrl(host, protocol);

  const qs = new URLSearchParams();
  if (refCode) qs.set('ref', refCode);
  qs.set('target', target);
  if (target === 'terminal') qs.set('secret', 'WhereIsJodyVernon');
  const canonicalUrl = `${baseUrl}/p/fb/${variantNum}?${qs.toString()}`;
  const { video: videoPath, thumbnail: thumbPath } = getShareVariantMedia('fb', variantNum);
  const videoUrl = `${baseUrl}${videoPath}`;
  const posterUrl = `${baseUrl}${thumbPath}`;
  const description = refCode
    ? `The internet isn't ready for this. Use code ${refCode} for 15% off.`
    : 'The internet isn\'t ready for this. Use your code for 15% off.';

  return {
    title: 'The Agnes Protocol',
    description,
    openGraph: {
      type: 'video.other',
      title: 'The Agnes Protocol',
      description,
      url: canonicalUrl,
      images: [{ url: posterUrl, width: 1200, height: 630 }],
      videos: [
        {
          url: videoUrl,
          secureUrl: videoUrl,
          type: 'video/mp4',
          width: 1080,
          height: 1920,
        },
      ],
    },
    twitter: {
      card: 'player',
      title: 'The Agnes Protocol',
      description,
    },
  };
}

export default async function FbPreviewPage({ params, searchParams }: Props) {
  const { variant } = await params;
  const variantNum = parseShareVariantParam(variant);
  const assets = getShareVariantMedia('fb', variantNum);

  return (
    <div
      style={{
        minHeight: '100svh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: '#0f172a',
        color: '#fff',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1rem', textAlign: 'center' }}>
        The Agnes Protocol
      </h1>
      <p style={{ fontSize: '1.125rem', maxWidth: 400, textAlign: 'center', marginBottom: '2rem', lineHeight: 1.6 }}>
        The internet isn&apos;t ready for this.
      </p>

      {assets?.video && (
        <video
          src={assets.video}
          poster={assets.thumbnail}
          controls
          autoPlay={false}
          loop
          muted
          playsInline
          style={{
            width: '100%',
            maxWidth: 640,
            borderRadius: 12,
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}
        />
      )}

      <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
        <Link
          href={SITE_ROOT}
          style={{
            padding: '1rem 2rem',
            borderRadius: 12,
            background: 'linear-gradient(135deg, #1877f2 0%, #0d5bb5 100%)',
            color: '#fff',
            fontSize: '1.25rem',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Watch / Join
        </Link>
      </div>
    </div>
  );
}
