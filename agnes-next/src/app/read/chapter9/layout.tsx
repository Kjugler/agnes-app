import type { Metadata } from 'next';
import type { ReactNode } from 'react';

const SITE_URL = 'https://www.theagnesprotocol.com';

/** Server-rendered metadata for link previews (iMessage, Slack, etc.). Query params do not affect OG tags. */
export const metadata: Metadata = {
  title: { absolute: 'Chapter 9 – The Agnes Protocol' },
  description: 'Before everything changed.',
  alternates: {
    canonical: '/read/chapter9',
  },
  openGraph: {
    title: 'Chapter 9 – The Agnes Protocol',
    description: 'Before everything changed.',
    url: `${SITE_URL}/read/chapter9`,
    type: 'article',
    siteName: 'The Agnes Protocol',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Chapter 9 – The Agnes Protocol',
    description: 'Before everything changed.',
  },
};

export default function Chapter9ReadLayout({ children }: { children: ReactNode }) {
  return children;
}
