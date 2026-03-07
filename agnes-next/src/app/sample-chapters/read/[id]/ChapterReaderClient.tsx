'use client';

import React, { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getChapter, isValidChapterId } from '../../chapters';

interface ChapterReaderClientProps {
  chapterId: string;
}

export default function ChapterReaderClient({ chapterId }: ChapterReaderClientProps) {
  const router = useRouter();
  
  const chapter = getChapter(chapterId);
  
  const handleBack = useCallback(() => {
    router.push('/sample-chapters');
  }, [router]);

  if (!chapter || !isValidChapterId(chapterId)) {
    return (
      <div
        style={{
          minHeight: '100svh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#000',
          color: '#00ffe5',
          fontFamily: '"Courier New", Courier, monospace',
          padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
        }}
      >
        <p>Chapter not found.</p>
        <Link
          href="/sample-chapters"
          style={{
            marginTop: 16,
            color: '#00ff00',
            textDecoration: 'underline',
          }}
        >
          ← Back to Sample Chapters
        </Link>
      </div>
    );
  }

  const { title, pdfUrl } = chapter;

  return (
    <div
      style={{
        minHeight: '100svh',
        height: '100svh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#000',
        color: '#00ffe5',
        fontFamily: '"Courier New", Courier, monospace',
        overflow: 'hidden',
      }}
    >
      {/* Top bar with Back + Download - subtle, respects safe area */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 'max(12px, env(safe-area-inset-top))',
          paddingRight: 'max(12px, env(safe-area-inset-right))',
          paddingBottom: 12,
          paddingLeft: 'max(12px, env(safe-area-inset-left))',
          flexShrink: 0,
          borderBottom: '1px solid rgba(0, 255, 229, 0.2)',
        }}
      >
        <button
          type="button"
          onClick={handleBack}
          aria-label="Go back"
          style={{
            background: 'transparent',
            border: '1px solid rgba(0, 255, 229, 0.5)',
            color: '#00ffe5',
            padding: '8px 16px',
            fontSize: 14,
            fontFamily: 'inherit',
            cursor: 'pointer',
            borderRadius: 6,
          }}
        >
          ← Back
        </button>
        
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            flex: 1,
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            margin: '0 8px',
          }}
        >
          {title}
        </span>

        <a
          href={pdfUrl}
          download
          target="_blank"
          rel="noreferrer noopener"
          style={{
            background: 'transparent',
            border: '1px solid rgba(0, 255, 229, 0.5)',
            color: '#00ffe5',
            padding: '8px 16px',
            fontSize: 14,
            fontFamily: 'inherit',
            textDecoration: 'none',
            borderRadius: 6,
          }}
        >
          Download
        </a>
      </header>

      {/* PDF iframe - full remaining height */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: '0 max(12px, env(safe-area-inset-right)) 0 max(12px, env(safe-area-inset-left))',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        }}
      >
        <iframe
          src={pdfUrl}
          title={title}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            backgroundColor: '#fff',
          }}
          className="pdfFrame"
        />
      </div>
    </div>
  );
}
