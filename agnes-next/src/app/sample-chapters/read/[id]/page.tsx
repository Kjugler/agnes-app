import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import ChapterReaderClient from './ChapterReaderClient';
import { isValidChapterId } from '../../chapters';

interface PageProps {
  params: Promise<{ id: string }>;
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
