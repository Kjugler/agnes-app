import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import {
  TEXT_A_FRIEND_CHAPTER9_DESCRIPTION,
  TEXT_A_FRIEND_CHAPTER9_IMAGE_URL,
  TEXT_A_FRIEND_CHAPTER9_TITLE,
  TEXT_A_FRIEND_SITE_URL,
} from '@/lib/textAFriendOg';

const chapterPreviewOgImage = {
  url: TEXT_A_FRIEND_CHAPTER9_IMAGE_URL,
  width: 1200,
  height: 630,
  alt: TEXT_A_FRIEND_CHAPTER9_TITLE,
  type: 'image/jpeg',
} as const;

/** Server-rendered metadata for link previews (iMessage, Slack, etc.). */
export const metadata: Metadata = {
  title: { absolute: TEXT_A_FRIEND_CHAPTER9_TITLE },
  description: TEXT_A_FRIEND_CHAPTER9_DESCRIPTION,
  alternates: {
    canonical: '/read/chapter9',
  },
  openGraph: {
    title: TEXT_A_FRIEND_CHAPTER9_TITLE,
    description: TEXT_A_FRIEND_CHAPTER9_DESCRIPTION,
    url: `${TEXT_A_FRIEND_SITE_URL}/read/chapter9`,
    type: 'article',
    siteName: 'The Agnes Protocol',
    locale: 'en_US',
    images: [chapterPreviewOgImage],
  },
  twitter: {
    card: 'summary_large_image',
    title: TEXT_A_FRIEND_CHAPTER9_TITLE,
    description: TEXT_A_FRIEND_CHAPTER9_DESCRIPTION,
    images: [TEXT_A_FRIEND_CHAPTER9_IMAGE_URL],
  },
};

export default function Chapter9ReadLayout({ children }: { children: ReactNode }) {
  return children;
}
