import type { Metadata } from 'next';
import { Suspense } from 'react';
import ReadersAgreeLandingClient from './ReadersAgreeLandingClient';
import {
  READERS_AGREE_OG_DESCRIPTION,
  READERS_AGREE_OG_IMAGE_URL,
  READERS_AGREE_OG_TITLE,
} from '@/lib/readerRecommendationLanding';
import { TEXT_A_FRIEND_SITE_URL } from '@/lib/textAFriendOg';

const ogImage = {
  url: READERS_AGREE_OG_IMAGE_URL,
  width: 1200,
  height: 630,
  alt: READERS_AGREE_OG_TITLE,
  type: 'image/jpeg',
} as const;

export const metadata: Metadata = {
  title: { absolute: `${READERS_AGREE_OG_TITLE} | The Agnes Protocol` },
  description: READERS_AGREE_OG_DESCRIPTION,
  alternates: {
    canonical: '/readers-agree',
  },
  openGraph: {
    title: READERS_AGREE_OG_TITLE,
    description: READERS_AGREE_OG_DESCRIPTION,
    url: `${TEXT_A_FRIEND_SITE_URL}/readers-agree`,
    type: 'website',
    siteName: 'The Agnes Protocol',
    locale: 'en_US',
    images: [ogImage],
  },
  twitter: {
    card: 'summary_large_image',
    title: READERS_AGREE_OG_TITLE,
    description: READERS_AGREE_OG_DESCRIPTION,
    images: [READERS_AGREE_OG_IMAGE_URL],
  },
};

export default function ReadersAgreePage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            background: '#050505',
            color: '#888',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          Loading…
        </div>
      }
    >
      <ReadersAgreeLandingClient />
    </Suspense>
  );
}
