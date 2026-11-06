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
  sampleChapterPagePath,
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
  const frameRef = useRef<HTMLElement>(null);
  const pageRef = useRef(1);
  const displayedPageRef = useRef(1);
  const [access, setAccess] = useState<AccessState>('checking');
  const [emailHint, setEmailHint] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [lockedChapterId, setLockedChapterId] = useState<string | null>(null);
  const [viewerEpoch, setViewerEpoch] = useState(0);
  const [identityGeneration, setIdentityGeneration] = useState(0);

  pageRef.current = pageNumber;
  const showPdf =
    access === 'recognized' ||
    (access === 'anonymous' && (!exhausted || lockedChapterId === chapterId));

  useEffect(() => {
    let cancelled = false;
    setAccess('checking');
    setPageCount(0);
    Promise.all([fetchReadersAgreeRecognition(), fetchReadingAllowance({ method: 'GET' })]).then(
      ([recognition, allowance]) => {
        if (cancelled) return;
        if (recognition.recognized) {
          const sameChapter = allowance?.chapterId === chapterId && (allowance.page || 1) > 1;
          setPageNumber(sameChapter && allowance ? allowance.page : 1);
          setEmailHint(recognition.emailHint);
          setExhausted(false);
          setInviteOpen(false);
          setLockedChapterId(null);
          setAccess('recognized');
          return;
        }
        setEmailHint(null);
        const isExhausted = allowance == null || allowance.exhausted;
        setExhausted(isExhausted);
        if (isExhausted) {
          const locked = allowance?.chapterId || null;
          setLockedChapterId(locked);
          setInviteOpen(true);
          setPageNumber(locked === chapterId ? allowance?.page || 1 : 1);
        } else {
          const sameChapter = allowance?.chapterId === chapterId && (allowance.page || 1) > 1;
          setLockedChapterId(null);
          setInviteOpen(false);
          setPageNumber(sameChapter && allowance ? allowance.page : 1);
        }
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
      if (stopped || !snapshot) return;
      if (snapshot.exhausted) {
        setExhausted(true);
        setLockedChapterId(snapshot.chapterId || chapterId);
        if (snapshot.chapterId === chapterId && snapshot.page) setPageNumber(snapshot.page);
        setInviteOpen(true);
      }
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
      if (access === 'checking') return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      if (access === 'anonymous' && exhausted) {
        setInviteOpen(true);
        return;
      }
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      setPageNumber((current) => {
        const next = current + delta;
        if (next < 1) return current;
        if (pageCount > 0 && next > pageCount) return current;
        return next;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [access, exhausted, pageCount]);

  const handleAccessEstablished = () => {
    setExhausted(false);
    setInviteOpen(false);
    setLockedChapterId(null);
    setAccess('recognized');
    setViewerEpoch((value) => value + 1);
    void fetchReadersAgreeRecognition().then((result) => {
      if (result.recognized) setEmailHint(result.emailHint);
    });
  };

  const handleNotNow = async () => {
    const wrap = frameRef.current?.querySelector('.chapter-one-canvas-wrap');
    const readingScroll = wrap instanceof HTMLElement ? wrap.scrollTop : 0;
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
    setExhausted(true);
    setLockedChapterId(snapshot.chapterId || chapterId);
    if (snapshot.chapterId === chapterId && snapshot.page) setPageNumber(snapshot.page);
    setInviteOpen(false);
    const restoreReadingScroll = () => {
      const node = frameRef.current?.querySelector('.chapter-one-canvas-wrap');
      if (node instanceof HTMLElement) node.scrollTop = readingScroll;
    };
    requestAnimationFrame(() => {
      restoreReadingScroll();
      requestAnimationFrame(restoreReadingScroll);
    });
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

  const requestStep = (delta: number) => {
    if (access === 'anonymous' && exhausted) {
      setInviteOpen(true);
      return;
    }
    setPageNumber((current) => {
      const next = current + delta;
      if (next < 1) return current;
      if (pageCount > 0 && next > pageCount) return current;
      return next;
    });
  };

  const nextDisabled =
    access === 'checking' || (!exhausted && pageCount > 0 && pageNumber >= pageCount);
  const prevDisabled = access === 'checking' || pageNumber <= 1;

  return (
    <div className="chapter-one-reader">
      <header className="chapter-one-header">
        <Link
          className="chapter-one-nav"
          href={hubHref}
          onClick={onBackClick}
          data-testid="view-all-sample-chapters"
        >
          View All Sample Chapters
        </Link>
        <span className="chapter-one-title">{title}</span>
        <div className="chapter-one-actions">
          <BuyBookButton
            className="chapter-one-buy"
            source="sample-chapter-reader"
            funnelEventType={FUNNEL_EVENT_TYPES.SAMPLE_CHAPTERS_BUY_CLICK}
            successPath="/checkout/success"
            cancelPath={hubHref}
          >
            Buy the Book
          </BuyBookButton>
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

      <section
        ref={frameRef}
        className={inviteOpen ? 'chapter-one-stage chapter-one-stage--invite' : 'chapter-one-stage'}
        aria-label={title}
      >
        {access === 'checking' ? <p className="chapter-one-status">Opening chapter…</p> : null}
        {showPdf ? (
          <ChapterPdfJsViewer
            key={`${chapterId}:${pageNumber}:${viewerEpoch}`}
            pagePath={sampleChapterPagePath(chapterId, pageNumber)}
            title={title}
            pageNumber={pageNumber}
            onDocumentLoaded={(count) => {
              displayedPageRef.current = pageNumber;
              setPageCount(count);
              setPageNumber((current) => Math.min(Math.max(1, current), count));
            }}
            onPageDenied={() => {
              setExhausted(true);
              setLockedChapterId((current) => current || chapterId);
              setInviteOpen(true);
              setPageNumber(displayedPageRef.current);
            }}
          />
        ) : null}
        {sampleChapterEmailPromptVisible({
          recognized: access === 'recognized',
          exhausted,
        }) && inviteOpen ? (
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
          disabled={prevDisabled}
          onClick={() => requestStep(-1)}
        >
          Previous page
        </button>
        <span className="chapter-one-page-label" data-testid="chapter-page-label">
          {pageCount ? `Page ${pageNumber} of ${pageCount}` : 'Page …'}
        </span>
        <button
          type="button"
          data-testid="chapter-page-next"
          disabled={nextDisabled}
          onClick={() => requestStep(1)}
        >
          Next page
        </button>
      </div>
    </div>
  );
}
