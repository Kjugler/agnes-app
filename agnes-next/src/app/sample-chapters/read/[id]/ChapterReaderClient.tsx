'use client';

import React, { useEffect, useRef, type MouseEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getChapter, isValidChapterId } from '../../chapters';
import { readAssociate } from '@/lib/identity';
import { buildTextThisSceneSmsBody, openSmsWithPrefilledBody } from '@/lib/textThisScene';
import { trackTikTok } from '@/lib/tiktokPixel';
import { trackMeta } from '@/lib/metaPixel';
import { FUNNEL_EVENT_TYPES, useFunnelPageEngagement } from '@/lib/funnelTracking';
import { JodyConcierge } from '@/components/jody/JodyConcierge';
import { isJodyConciergeEnabled } from '@/lib/funnelConfig';
import { useJodyChapterExit } from '@/hooks/useJodyConcierge';
import { JODY_CONCIERGE_CONFIG } from '@/config/jodyConcierge';
import { isReadingSessionDwellMet } from '@/lib/readerJourney';
import { SampleChapterReader } from '@/components/sample-chapters/SampleChapterReader';
import { sampleChaptersHubHref } from '@/lib/sampleChapterNav';

interface ChapterReaderClientProps {
  chapterId: string;
}

export default function ChapterReaderClient({ chapterId }: ChapterReaderClientProps) {
  const searchParams = useSearchParams();
  const hubHref = sampleChaptersHubHref(searchParams);
  const chapter = getChapter(chapterId);
  const viewContentFiredRef = useRef(false);
  const { showJody, tryShowOnExit, dismissJody, readerStatus } = useJodyChapterExit(chapterId);

  useFunnelPageEngagement({
    pageViewType: FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_OPEN,
    timeOnPageType: FUNNEL_EVENT_TYPES.SAMPLE_CHAPTER_TIME_ON_PAGE,
    source: 'sample-chapter-reader',
    extraPageViewMeta: { chapterId },
    extraEngagementMeta: { chapterId },
  });

  useEffect(() => {
    if (!chapter || !isValidChapterId(chapterId)) return;
    if (viewContentFiredRef.current) return;
    viewContentFiredRef.current = true;

    trackTikTok('ViewContent', {
      content_id: `sample-chapter-${chapterId}`,
      content_name: chapter.title,
      content_type: 'product',
    });
    trackMeta('ViewContent', {
      content_ids: [`sample-chapter-${chapterId}`],
      content_name: chapter.title,
      content_type: 'product',
    });
  }, [chapterId, chapter]);

  const handleTextThisScene = () => {
    const ref = readAssociate()?.code ?? null;
    const body = buildTextThisSceneSmsBody(ref);
    openSmsWithPrefilledBody(body);
  };

  const handleBackNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      !isJodyConciergeEnabled() ||
      chapterId !== JODY_CONCIERGE_CONFIG.firstAppearAfterChapter
    ) {
      return;
    }
    if (!isReadingSessionDwellMet(chapterId)) return;

    event.preventDefault();
    tryShowOnExit(() => {
      window.location.href = sampleChaptersHubHref(searchParams);
    });
  };

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
          padding:
            'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
        }}
      >
        <p>Chapter not found.</p>
        <Link href={hubHref} style={{ marginTop: 16, color: '#00ff00', textDecoration: 'underline' }}>
          ← Back to Sample Chapters
        </Link>
      </div>
    );
  }

  return (
    <>
      <SampleChapterReader
        chapterId={chapterId}
        title={chapter.title}
        onBackClick={handleBackNavigation}
        onTextThisScene={handleTextThisScene}
      />
      {showJody && (
        <JodyConcierge
          mode="remember-offer"
          chapterId={chapterId}
          readerStatus={readerStatus}
          onClose={dismissJody}
        />
      )}
    </>
  );
}
