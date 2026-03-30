'use client';

import React from 'react';
import Link from 'next/link';
import { getChapter, isValidChapterId } from '../../chapters';

interface ChapterReaderClientProps {
  chapterId: string;
}

export default function ChapterReaderClient({ chapterId }: ChapterReaderClientProps) {
  const chapter = getChapter(chapterId);

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
          <Link
            href="/sample-chapters"
            style={{
              color: '#00ffe5',
              fontSize: 14,
              fontFamily: 'inherit',
              textDecoration: 'none',
            }}
          >
            ← Back to Sample Chapters
          </Link>
          <Link
            href="/contest"
            style={{
              color: '#00ffe5',
              fontSize: 14,
              fontFamily: 'inherit',
              textDecoration: 'none',
            }}
          >
            ← Back to Contest Hub
          </Link>
        </div>
        
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

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: 'rgba(0, 255, 229, 0.12)',
              border: '1px solid rgba(0, 255, 229, 0.6)',
              color: '#00ffe5',
              padding: '8px 16px',
              fontSize: 14,
              fontFamily: 'inherit',
              textDecoration: 'none',
              borderRadius: 6,
              fontWeight: 600,
            }}
          >
            Open full chapter
          </a>
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
        </div>
      </header>

      {/* Mobile: embedded PDFs often only show page 1 — use Open full chapter / Download. Desktop: inline iframe. */}
      <div className="chapter-reader-mobile-panel">
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.55,
            maxWidth: 420,
            color: 'rgba(0, 255, 229, 0.88)',
          }}
        >
          On phones and tablets, use <strong style={{ color: '#00ffe5' }}>Open full chapter</strong> so your
          browser can show every page—scroll, search, zoom, and print from the viewer.
        </p>
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            background: 'rgba(0, 255, 229, 0.15)',
            border: '2px solid #00ffe5',
            color: '#00ffe5',
            padding: '14px 24px',
            fontSize: 16,
            fontFamily: 'inherit',
            textDecoration: 'none',
            borderRadius: 8,
            fontWeight: 700,
          }}
        >
          Open full chapter
        </a>
        <a
          href={pdfUrl}
          download
          target="_blank"
          rel="noreferrer noopener"
          style={{
            background: 'transparent',
            border: '1px solid rgba(0, 255, 229, 0.5)',
            color: '#00ffe5',
            padding: '10px 20px',
            fontSize: 14,
            fontFamily: 'inherit',
            textDecoration: 'none',
            borderRadius: 6,
          }}
        >
          Download PDF
        </a>
      </div>

      <div
        className="chapter-reader-embed-host"
        style={{
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
        />
      </div>
    </div>
  );
}
