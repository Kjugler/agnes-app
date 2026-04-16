import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import ChapterReaderClient from './ChapterReaderClient';
import { isValidChapterId } from '../../chapters';

const SITE_URL = 'https://www.theagnesprotocol.com';
/** Chapter 9 reader only — distinct link preview (document/chapter) vs site default OG. */
const CHAPTER_9_OG_IMAGE_URL = `${SITE_URL}/images/fb/chapter9.jpg`;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (id !== '9') {
    return {};
  }

  const ogImage = {
    url: CHAPTER_9_OG_IMAGE_URL,
    width: 1200,
    height: 630,
    alt: 'The Agnes Protocol — sample chapter read',
  } as const;

  return {
    openGraph: {
      images: [ogImage],
    },
    twitter: {
      images: [ogImage],
    },
  };
}

export default async function ChapterReadPage({ params }: PageProps) {
  const { id } = await params;
  
  if (!id || !isValidChapterId(id)) {
    notFound();
  }

  return (
    <Suspense fallback={
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
