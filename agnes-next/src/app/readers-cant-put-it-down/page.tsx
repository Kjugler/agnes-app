import type { Metadata } from 'next';
import { Suspense } from 'react';
import MetaAdLandingClient from './MetaAdLandingClient';

const SITE_URL = 'https://www.theagnesprotocol.com';
const OG_IMAGE = `${SITE_URL}/og/book-cover-og.jpg`;

export const metadata: Metadata = {
  title: "Find Out Why Readers Can't Put It Down | The Agnes Protocol",
  description:
    '25 reviews. Nearly all five stars. Read Amazon and Barnes & Noble reader reviews, then start the free sample chapters of The Agnes Protocol.',
  alternates: {
    canonical: '/readers-cant-put-it-down',
  },
  openGraph: {
    title: "Find Out Why Readers Can't Put It Down",
    description:
      '25 reviews. Nearly all five stars. Read the reviews, then start the free sample chapters.',
    url: `${SITE_URL}/readers-cant-put-it-down`,
    type: 'website',
    siteName: 'The Agnes Protocol',
    images: [
      {
        url: OG_IMAGE,
        alt: 'The Agnes Protocol book cover',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Find Out Why Readers Can't Put It Down",
    description:
      'Read Amazon and Barnes & Noble reviews, then start the free sample chapters.',
    images: [OG_IMAGE],
  },
};

export default function ReadersCantPutItDownPage() {
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
      <MetaAdLandingClient />
    </Suspense>
  );
}
