import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import ChapterReaderClient from './ChapterReaderClient';
import { isValidChapterId } from '../../chapters';
import {
  TEXT_A_FRIEND_CHAPTER9_DESCRIPTION,
  TEXT_A_FRIEND_CHAPTER9_IMAGE_URL,
  TEXT_A_FRIEND_CHAPTER9_TITLE,
  TEXT_A_FRIEND_SITE_URL,
} from '@/lib/textAFriendOg';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (id !== '9') {
    return {};
  }

  const ogImage = {
    url: TEXT_A_FRIEND_CHAPTER9_IMAGE_URL,
    width: 1200,
    height: 630,
    alt: TEXT_A_FRIEND_CHAPTER9_TITLE,
    type: 'image/jpeg' as const,
  };

  return {
    title: { absolute: TEXT_A_FRIEND_CHAPTER9_TITLE },
    description: TEXT_A_FRIEND_CHAPTER9_DESCRIPTION,
    alternates: {
      canonical: '/sample-chapters/read/9',
    },
    openGraph: {
      title: TEXT_A_FRIEND_CHAPTER9_TITLE,
      description: TEXT_A_FRIEND_CHAPTER9_DESCRIPTION,
      url: `${TEXT_A_FRIEND_SITE_URL}/sample-chapters/read/9`,
      type: 'article',
      siteName: 'The Agnes Protocol',
      locale: 'en_US',
      images: [ogImage],
    },
    twitter: {
      card: 'summary_large_image',
      title: TEXT_A_FRIEND_CHAPTER9_TITLE,
      description: TEXT_A_FRIEND_CHAPTER9_DESCRIPTION,
      images: [TEXT_A_FRIEND_CHAPTER9_IMAGE_URL],
    },
  };
}

export default async function ChapterReadPage({ params }: PageProps) {
  const { id } = await params;

  if (!id || !isValidChapterId(id)) {
    notFound();
  }

  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100svh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#000',
            color: '#00ffe5',
            fontFamily: '"Courier New", Courier, monospace',
          }}
        >
          Loading…
        </div>
      }
    >
      <ChapterReaderClient chapterId={id} />
    </Suspense>
  );
}
