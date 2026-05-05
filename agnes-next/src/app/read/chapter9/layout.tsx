import type { Metadata } from 'next';
import type { ReactNode } from 'react';

const SITE_URL = 'https://www.theagnesprotocol.com';

/** Same asset as TextAFriendModal `THUMB_SHARE_CHAPTER_9` (“Share a Scene” on /contest/score). Public, crawlable. */
const CHAPTER_9_SHARE_PREVIEW_IMAGE = `${SITE_URL}/images/fb/chapter9.jpg`;

const chapterPreviewOgImage = {
  url: CHAPTER_9_SHARE_PREVIEW_IMAGE,
  width: 1200,
  height: 630,
  alt: 'Chapter 9 – The Agnes Protocol — sample read preview',
  type: 'image/jpeg',
} as const;

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
    images: [chapterPreviewOgImage],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Chapter 9 – The Agnes Protocol',
    description: 'Before everything changed.',
    images: [CHAPTER_9_SHARE_PREVIEW_IMAGE],
  },
};

export default function Chapter9ReadLayout({ children }: { children: ReactNode }) {
  return children;
}
