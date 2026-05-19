import { Suspense } from 'react';
import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import LighteningClient from './LighteningClient';
import {
  TEXT_A_FRIEND_BOOK_DESCRIPTION,
  TEXT_A_FRIEND_BOOK_IMAGE_URL,
  TEXT_A_FRIEND_BOOK_TITLE,
  TEXT_A_FRIEND_SITE_URL,
} from '@/lib/textAFriendOg';

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Softer OG for Text-a-Friend SMS links (/t/fb1 → /?source=textafriend → /lightening). */
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const sp = await searchParams;
  const sourceRaw = sp.source;
  const source =
    typeof sourceRaw === 'string'
      ? sourceRaw
      : Array.isArray(sourceRaw)
        ? sourceRaw[0]
        : undefined;

  if (source !== 'textafriend') {
    return {};
  }

  const ogImage = {
    url: TEXT_A_FRIEND_BOOK_IMAGE_URL,
    width: 1200,
    height: 630,
    alt: TEXT_A_FRIEND_BOOK_TITLE,
    type: 'image/jpeg' as const,
  };

  return {
    title: { absolute: TEXT_A_FRIEND_BOOK_TITLE },
    description: TEXT_A_FRIEND_BOOK_DESCRIPTION,
    openGraph: {
      title: TEXT_A_FRIEND_BOOK_TITLE,
      description: TEXT_A_FRIEND_BOOK_DESCRIPTION,
      url: `${TEXT_A_FRIEND_SITE_URL}/lightening`,
      type: 'website',
      siteName: 'The Agnes Protocol',
      locale: 'en_US',
      images: [ogImage],
    },
    twitter: {
      card: 'summary_large_image',
      title: TEXT_A_FRIEND_BOOK_TITLE,
      description: TEXT_A_FRIEND_BOOK_DESCRIPTION,
      images: [TEXT_A_FRIEND_BOOK_IMAGE_URL],
    },
  };
}

export default async function Page() {
  if (process.env.NEXT_PUBLIC_ENTRY_FUNNEL_DEBUG === '1') {
    try {
      const c = await cookies();
      console.log('[ENTRY_FUNNEL:ssr]', {
        path: '/lightening',
        entry_variant: c.get('entry_variant')?.value ?? null,
        seen_terminal: c.get('seen_terminal')?.value ?? null,
        seen_protocol: c.get('seen_protocol')?.value ?? null,
        seen_contest: c.get('seen_contest')?.value ?? null,
        terminal_discovery_complete: c.get('terminal_discovery_complete')?.value ?? null,
      });
    } catch {
      /* ignore */
    }
  }

  return (
    <Suspense fallback={null}>
      <LighteningClient />
    </Suspense>
  );
}
