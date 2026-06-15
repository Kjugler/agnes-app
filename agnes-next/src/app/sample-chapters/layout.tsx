import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import {
  SAMPLE_CHAPTERS_OG_DESCRIPTION,
  SAMPLE_CHAPTERS_OG_IMAGE_URL,
  SAMPLE_CHAPTERS_OG_TITLE,
  TEXT_A_FRIEND_SITE_URL,
} from '@/lib/textAFriendOg';

const sampleChaptersOgImage = {
  url: SAMPLE_CHAPTERS_OG_IMAGE_URL,
  width: 1200,
  height: 630,
  alt: SAMPLE_CHAPTERS_OG_TITLE,
  type: 'image/jpeg',
} as const;

/** Server-rendered metadata for /sample-chapters link previews (Facebook, iMessage, X, LinkedIn, etc.). */
export const metadata: Metadata = {
  title: { absolute: SAMPLE_CHAPTERS_OG_TITLE },
  description: SAMPLE_CHAPTERS_OG_DESCRIPTION,
  alternates: {
    canonical: '/sample-chapters',
  },
  openGraph: {
    title: SAMPLE_CHAPTERS_OG_TITLE,
    description: SAMPLE_CHAPTERS_OG_DESCRIPTION,
    url: `${TEXT_A_FRIEND_SITE_URL}/sample-chapters`,
    type: 'website',
    siteName: 'The Agnes Protocol',
    locale: 'en_US',
    images: [sampleChaptersOgImage],
  },
  twitter: {
    card: 'summary_large_image',
    title: SAMPLE_CHAPTERS_OG_TITLE,
    description: SAMPLE_CHAPTERS_OG_DESCRIPTION,
    images: [SAMPLE_CHAPTERS_OG_IMAGE_URL],
  },
};

export default function SampleChaptersLayout({ children }: { children: ReactNode }) {
  return children;
}
