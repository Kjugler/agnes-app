import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import {
  TEXT_A_FRIEND_BOOK_DESCRIPTION,
  TEXT_A_FRIEND_BOOK_IMAGE_URL,
  TEXT_A_FRIEND_BOOK_TITLE,
  TEXT_A_FRIEND_SITE_URL,
} from '@/lib/textAFriendOg';

const ogImage = {
  url: TEXT_A_FRIEND_BOOK_IMAGE_URL,
  width: 1200,
  height: 630,
  alt: 'Text a Friend — The Agnes Protocol',
  type: 'image/jpeg',
} as const;

export const metadata: Metadata = {
  title: { absolute: 'Text a Friend — The Agnes Protocol' },
  description: TEXT_A_FRIEND_BOOK_DESCRIPTION,
  alternates: {
    canonical: '/text-a-friend',
  },
  openGraph: {
    title: TEXT_A_FRIEND_BOOK_TITLE,
    description: TEXT_A_FRIEND_BOOK_DESCRIPTION,
    url: `${TEXT_A_FRIEND_SITE_URL}/text-a-friend`,
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

export default function TextAFriendLayout({ children }: { children: ReactNode }) {
  return children;
}
