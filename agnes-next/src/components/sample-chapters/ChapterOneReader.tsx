'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChapterPdfJsViewer } from '@/components/sample-chapters/ChapterPdfJsViewer';
import { JodyReaderInvitation } from '@/components/sample-chapters/JodyReaderInvitation';
import {
  activeReadingElapsedMs,
  hasReachedReaderGate,
  isActivelyReading,
  readerGateThresholdMs,
  syncActiveReadingClock,
  type ActiveReadingClock,
} from '@/lib/activeReadingClock';
import {
  CHAPTER_ONE_ACTIVE_MS_KEY,
  CHAPTER_ONE_DOCUMENT_PATH,
  CHAPTER_ONE_GATE_PAGE_KEY,
  canAdvanceToPage,
  readStoredActiveMs,
  readStoredGatePage,
} from '@/lib/chapterOneGate';
import {
  clearReadersAgreeRecognition,
  fetchReadersAgreeRecognition,
} from '@/lib/readersAgreeSession';
import { sampleChaptersHubHref } from '@/lib/sampleChapterNav';
import { BuyBookButton } from '@/components/BuyBookButton';
import { FUNNEL_EVENT_TYPES } from '@/lib/funnelTracking';
import './chapter-one-reader.css';

type ChapterOneReaderProps = {
  title: string;
  onBackClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  onTextThisScene: () => void;
};

type AccessState = 'checking' | 'anonymous' | 'recognized';

function clearGateStorage() {
  try {
    sessionStorage.removeItem(CHAPTER_ONE_ACTIVE_MS_KEY);
    sessionStorage.removeItem(CHAPTER_ONE_GATE_PAGE_KEY);
  } catch {
    /* private mode */
  }
}

export function ChapterOneReader({ title, onBackClick, onTextThisScene }: ChapterOneReaderProps) {
  const searchParams = useSearchParams();
  const hubHref = sampleChaptersHubHref(searchParams);
  const frameRef = useRef<HTMLElement>(null);
  const pageRef = useRef(1);
  const thresholdMs = readerGateThresholdMs();
  const [access, setAccess] = useState<AccessState>('checking');
  const [emailHint, setEmailHint] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [gatePage, setGatePage] = useState<number | null>(null);
  const [invitationOpen, setInvitationOpen] = useState(false);
  const [clockGeneration, setClockGeneration] = useState(0);

  pageRef.current = pageNumber;
  const accessEstablished = access === 'recognized';

  const openGate = useCallback((page: number) => {
    const locked = Math.max(1, page);
    setGatePage(locked);
    setInvitationOpen(true);
    try {
      sessionStorage.setItem(CHAPTER_ONE_GATE_PAGE_KEY, String(locked));
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchReadersAgreeRecognition().then((result) => {
      if (cancelled) return;
      if (result.recognized) {
        clearGateStorage();
        setEmailHint(result.emailHint);
        setGatePage(null);
        setInvitationOpen(false);
        setAccess('recognized');
        return;
      }
      const storedGate = readStoredGatePage(sessionStorage.getItem(CHAPTER_ONE_GATE_PAGE_KEY));
      setEmailHint(null);
      setAccess('anonymous');
      if (storedGate) {
        setGatePage(storedGate);
        setPageNumber(storedGate);
        setInvitationOpen(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [clockGeneration]);

  useEffect(() => {
    if (access !== 'anonymous' || gatePage != null) return;
    let clock: ActiveReadingClock = {
      accumulatedMs: readStoredActiveMs(sessionStorage.getItem(CHAPTER_ONE_ACTIVE_MS_KEY)),
      runningSinceMs: null,
    };
    let viewerVisible = false;
    let fired = false;
    const frame = frameRef.current;

    const measureViewer = () => {
      const node = frameRef.current;
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
      return visibleHeight >= 160;
    };

    const sync = () => {
      viewerVisible = measureViewer();
      const now = Date.now();
      clock = syncActiveReadingClock(
        clock,
        now,
        isActivelyReading({
          visibilityState: document.visibilityState,
          hasFocus: document.hasFocus(),
          viewerVisible,
        }),
      );
      try {
        sessionStorage.setItem(CHAPTER_ONE_ACTIVE_MS_KEY, String(Math.floor(clock.accumulatedMs)));
      } catch {
        /* private mode */
      }
      if (!fired && hasReachedReaderGate(activeReadingElapsedMs(clock, now), thresholdMs)) {
        fired = true;
        openGate(pageRef.current);
      }
    };

    const observer = new IntersectionObserver(() => sync(), { threshold: [0, 0.01, 0.25, 0.5, 1] });
    if (frame) observer.observe(frame);

    const onSignal = () => sync();
    document.addEventListener('visibilitychange', onSignal);
    window.addEventListener('focus', onSignal);
    window.addEventListener('blur', onSignal);
    window.addEventListener('resize', onSignal);
    window.addEventListener('scroll', onSignal, true);
    const timer = window.setInterval(sync, 250);
    sync();

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onSignal);
      window.removeEventListener('focus', onSignal);
      window.removeEventListener('blur', onSignal);
      window.removeEventListener('resize', onSignal);
      window.removeEventListener('scroll', onSignal, true);
      window.clearInterval(timer);
    };
  }, [access, clockGeneration, gatePage, openGate, thresholdMs]);

  const goToPage = (target: number) => {
    if (invitationOpen) return;
    if (
      !canAdvanceToPage({
        targetPage: target,
        pageCount,
        accessEstablished,
        gatePage,
      })
    ) {
      return;
    }
    setPageNumber(target);
  };

  const handleDecline = () => {
    setInvitationOpen(false);
  };

  const handleAccessEstablished = () => {
    clearGateStorage();
    setGatePage(null);
    setInvitationOpen(false);
    setAccess('checking');
    setClockGeneration((value) => value + 1);
  };

  const handleNotYou = async () => {
    if (switching) return;
    setSwitching(true);
    const cleared = await clearReadersAgreeRecognition();
    setSwitching(false);
    if (!cleared) return;
    clearGateStorage();
    setEmailHint(null);
    setGatePage(null);
    setInvitationOpen(false);
    setAccess('anonymous');
    setClockGeneration((value) => value + 1);
  };

  const nextAllowed =
    !invitationOpen &&
    canAdvanceToPage({
      targetPage: pageNumber + 1,
      pageCount,
      accessEstablished,
      gatePage,
    });
  const prevAllowed = !invitationOpen && pageNumber > 1;

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
          {accessEstablished ? (
            <>
              <a className="chapter-one-open" href={CHAPTER_ONE_DOCUMENT_PATH} target="_blank" rel="noopener noreferrer">
                Open full chapter
              </a>
              <a className="chapter-one-download" href={`${CHAPTER_ONE_DOCUMENT_PATH}?download=1`}>
                Download
              </a>
            </>
          ) : null}
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
        <ChapterPdfJsViewer
          pageNumber={pageNumber}
          onDocumentLoaded={(count) => {
            setPageCount(count);
            setPageNumber((current) => Math.min(current, count));
            setGatePage((gate) => (gate != null && gate > count ? count : gate));
          }}
        />
        {invitationOpen && !accessEstablished ? (
          <JodyReaderInvitation
            searchParams={searchParams}
            onDecline={handleDecline}
            onAccessEstablished={handleAccessEstablished}
          />
        ) : null}
      </section>

      <div className="chapter-one-toolbar">
        <button type="button" data-testid="chapter-page-prev" disabled={!prevAllowed} onClick={() => goToPage(pageNumber - 1)}>
          Previous page
        </button>
        <span className="chapter-one-page-label" data-testid="chapter-page-label">
          {pageCount ? `Page ${pageNumber} of ${pageCount}` : 'Page …'}
        </span>
        <button type="button" data-testid="chapter-page-next" disabled={!nextAllowed} onClick={() => goToPage(pageNumber + 1)}>
          Next page
        </button>
        {gatePage != null && !accessEstablished ? (
          <span className="chapter-one-lock-note" data-testid="chapter-page-locked">
            Next page stays closed until Jody knows it&apos;s you.{' '}
            {invitationOpen ? null : (
              <button type="button" data-testid="jody-reader-reopen" onClick={() => setInvitationOpen(true)}>
                Continue with email
              </button>
            )}
          </span>
        ) : null}
      </div>
    </div>
  );
}
