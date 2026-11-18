import type { Metadata } from 'next';
import { Suspense } from 'react';
import WorldWonderingClient from './WorldWonderingClient';

const SITE_URL = 'https://www.theagnesprotocol.com';
const TITLE = 'World Wondering | The Agnes Protocol';
const DESCRIPTION =
  'Discover The Agnes Protocol by Simon McQuade. Meet Logan Townsend and explore a suspense thriller filled with secrets, mystery, and unexpected discoveries.';
const OG_IMAGE = {
  url: `${SITE_URL}/og/ghost-writers.jpg`,
  width: 1200,
  height: 630,
  alt: 'The Agnes Protocol',
} as const;

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: {
    canonical: '/world-wondering',
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/world-wondering`,
    type: 'website',
    siteName: 'The Agnes Protocol',
    locale: 'en_US',
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};

export default function WorldWonderingPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            background: '#090b10',
            color: '#d7c4a3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          Loading…
        </div>
      }
    >
      <WorldWonderingClient />
    </Suspense>
  );
}
