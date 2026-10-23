'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChapterPdfJsViewer } from '@/components/sample-chapters/ChapterPdfJsViewer';
import { JodyReaderInvitation } from '@/components/sample-chapters/JodyReaderInvitation';
import { isActivelyReading } from '@/lib/activeReadingClock';
import { FUNNEL_EVENT_TYPES, getOrCreateVisitorId } from '@/lib/funnelTracking';
import {
  fetchReadingAllowance,
  sampleChapterDocumentPath,
} from '@/lib/readingAllowance';
import {
  clearReadersAgreeRecognition,
  fetchReadersAgreeRecognition,
} from '@/lib/readersAgreeSession';
import { sampleChapterEmailPromptVisible } from '@/lib/chapterOneGate';
import { sampleChaptersHubHref } from '@/lib/sampleChapterNav';
import { markSampleReadingEngaged } from '@/lib/departureBridge';
import { BuyBookButton } from '@/components/BuyBookButton';
import './chapter-one-reader.css';

type SampleChapterReaderProps = {
  chapterId: string;
  title: string;
  onBackClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  onTextThisScene: () => void;
};

type AccessState = 'checking' | 'anonymous' | 'recognized';

export function SampleChapterReader({
  chapterId,
  title,
  onBackClick,
  onTextThisScene,
}: SampleChapterReaderProps) {
  const searchParams = useSearchParams();
  const hubHref = sampleChaptersHubHref(searchParams);
  const documentPath = sampleChapterDocumentPath(chapterId);
  const frameRef = useRef<HTMLElement>(null);
  const pageRef = useRef(1);
  const [access, setAccess] = useState<AccessState>('checking');
  const [emailHint, setEmailHint] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [viewerEpoch, setViewerEpoch] = useState(0);
  const [identityGeneration, setIdentityGeneration] = useState(0);

  pageRef.current = pageNumber;
  const canRead = access === 'recognized' || (access === 'anonymous' && !exhausted);

  useEffect(() => {
    let cancelled = false;
    setAccess('checking');
    setPageCount(0);
    Promise.all([fetchReadersAgreeRecognition(), fetchReadingAllowance({ method: 'GET' })]).then(
      ([recognition, allowance]) => {
        if (cancelled) return;
        const sameChapter = allowance?.chapterId === chapterId && (allowance.page || 1) > 1;
        if (sameChapter && allowance) setPageNumber(allowance.page);
        else setPageNumber(1);
        if (recognition.recognized) {
          setEmailHint(recognition.emailHint);
          setExhausted(false);
          setAccess('recognized');
          return;
        }
        setEmailHint(null);
        setExhausted(allowance == null || allowance.exhausted);
        setAccess('anonymous');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [chapterId, identityGeneration]);

  const measureViewer = useCallback(() => {
    const node = frameRef.current;
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
    return visibleHeight >= 160;
  }, []);

  useEffect(() => {
    if (access !== 'anonymous' || exhausted) return;
    let stopped = false;

    const send = async (active: boolean) => {
      if (active) markSampleReadingEngaged();
      const snapshot = await fetchReadingAllowance({
        method: 'POST',
        body: {
          active,
          chapterId,
          page: pageRef.current,
          visitorId: getOrCreateVisitorId(),
        },
      });
      if (stopped) return;
      if (!snapshot || snapshot.exhausted) setExhausted(true);
    };

    void send(false);
    const timer = window.setInterval(() => {
      const active = isActivelyReading({
        visibilityState: document.visibilityState,
        hasFocus: document.hasFocus(),
        viewerVisible: measureViewer(),
      });
      void send(active);
    }, 2000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [access, chapterId, exhausted, measureViewer]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!canRead) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (event.key === 'ArrowRight') {
        setPageNumber((current) => (pageCount > 0 ? Math.min(pageCount, current + 1) : current + 1));
      } else if (event.key === 'ArrowLeft') {
        setPageNumber((current) => Math.max(1, current - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canRead, pageCount]);

  const handleAccessEstablished = () => {
    setExhausted(false);
    setAccess('recognized');
    setViewerEpoch((value) => value + 1);
    void fetchReadersAgreeRecognition().then((result) => {
      if (result.recognized) setEmailHint(result.emailHint);
    });
  };

  const handleNotNow = async () => {
    const snapshot = await fetchReadingAllowance({
      method: 'POST',
      body: {
        decline: true,
        active: false,
        chapterId,
        page: pageRef.current,
        visitorId: getOrCreateVisitorId(),
      },
    });
    if (!snapshot?.exhausted) {
      throw new Error('allowance_not_closed');
    }
    window.location.assign('/');
  };

  const handleNotYou = async () => {
    if (switching) return;
    setSwitching(true);
    const cleared = await clearReadersAgreeRecognition();
    setSwitching(false);
    if (!cleared) return;
    setEmailHint(null);
    setIdentityGeneration((value) => value + 1);
  };

  const nextAllowed = canRead && (pageCount === 0 || pageNumber < pageCount);
  const prevAllowed = canRead && pageNumber > 1;

  return (
    <div className="chapter-one-reader">
      <header className="chapter-one-header">
        <div className="chapter-one-nav-mobile">
          <Link href={hubHref} onClick={onBackClick}>
            ← Back to Sample Chapters
          </Link>
          <BuyBookButton
            source="sample-chapter-reader"
            funnelEventType={FUNNEL_EVENT_TYPES.SAMPLE_CHAPTERS_BUY_CLICK}
            successPath="/checkout/success"
            cancelPath={hubHref}
          >
            Buy the Book
          </BuyBookButton>
        </div>
        <div className="chapter-one-nav-desktop">
          <Link href={hubHref} onClick={onBackClick}>
            ← Back to Sample Chapters
          </Link>
          <BuyBookButton
            source="sample-chapter-reader"
            funnelEventType={FUNNEL_EVENT_TYPES.SAMPLE_CHAPTERS_BUY_CLICK}
            successPath="/checkout/success"
            cancelPath={hubHref}
          >
            Buy the Book
          </BuyBookButton>
        </div>
        <span className="chapter-one-title">{title}</span>
        <div className="chapter-one-actions">
          <button type="button" onClick={onTextThisScene}>
            Text This Scene
          </button>
        </div>
      </header>

      {emailHint ? (
        <p className="chapter-one-known">
          Continuing as {emailHint}.{' '}
          <button type="button" onClick={handleNotYou} disabled={switching}>
            {switching ? '…' : 'Not you?'}
          </button>
        </p>
      ) : null}

      <section ref={frameRef} className="chapter-one-stage" aria-label={title}>
        {access === 'checking' ? <p className="chapter-one-status">Opening chapter…</p> : null}
        {canRead ? (
          <ChapterPdfJsViewer
            key={`${chapterId}:${viewerEpoch}`}
            documentPath={documentPath}
            title={title}
            pageNumber={pageNumber}
            onDocumentLoaded={(count) => {
              setPageCount(count);
              setPageNumber((current) => Math.min(Math.max(1, current), count));
            }}
          />
        ) : null}
        {sampleChapterEmailPromptVisible({
          recognized: access === 'recognized',
          exhausted,
        }) ? (
          <JodyReaderInvitation
            searchParams={searchParams}
            onDecline={handleNotNow}
            onAccessEstablished={handleAccessEstablished}
          />
        ) : null}
      </section>

      <div className="chapter-one-toolbar">
        <button
          type="button"
          data-testid="chapter-page-prev"
          disabled={!prevAllowed}
          onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
        >
          Previous page
        </button>
        <span className="chapter-one-page-label" data-testid="chapter-page-label">
          {pageCount ? `Page ${pageNumber} of ${pageCount}` : 'Page …'}
        </span>
        <button
          type="button"
          data-testid="chapter-page-next"
          disabled={!nextAllowed}
          onClick={() =>
            setPageNumber((current) => (pageCount > 0 ? Math.min(pageCount, current + 1) : current))
          }
        >
          Next page
        </button>
      </div>
    </div>
  );
}
