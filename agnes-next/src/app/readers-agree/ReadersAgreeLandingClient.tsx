'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useSyncExternalStore, type MouseEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import SiteFooter from '@/components/SiteFooter';
import ReadersAgreeScrollCue from '@/components/readers-agree/ReadersAgreeScrollCue';
import {
  READERS_AGREE_APPEAL_LABELS,
  READERS_AGREE_SYNOPSIS_HOOK,
  READERS_AGREE_SYNOPSIS_PARAGRAPHS,
} from '@/config/readersAgreeBnFunnel';
import { isMobileTouchBrowser } from '@/lib/device';
import { isReadersAgreeDorothyBridgeEnabled } from '@/lib/funnelConfig';
import { trackMeta } from '@/lib/metaPixel';
import { trackTikTok } from '@/lib/tiktokPixel';
import {
  BARNES_NOBLE_REVIEWS_URL,
  READERS_AGREE_AMAZON_ATTRIBUTION_URL,
  buildReadersAgreePathWithTracking,
  READERS_AGREE_CATALOG_PATH,
  READERS_AGREE_CHAPTER_1_PATH,
  READERS_AGREE_GO_AMAZON_PATH,
  READERS_AGREE_GO_BN_PATH,
  READERS_AGREE_HERO_IMAGE_PATH,
} from '@/lib/readerRecommendationLanding';
import {
  clearBridgeTabDeparted,
  markBridgeTabDeparted,
  markReadersAgreeReviewOpened,
  markRetailerPopupBlocked,
  resetBridgeSessionState,
} from '@/lib/readersAgreeMomentum';
import {
  FUNNEL_EVENT_TYPES,
  trackFunnelEvent,
  useFunnelPageEngagement,
} from '@/lib/funnelTracking';
import './readers-agree-bn.css';

const BRIDGE_ENABLED = isReadersAgreeDorothyBridgeEnabled();

function subscribeNoop() {
  return () => {};
}

export default function ReadersAgreeLandingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewFiredRef = useRef(false);
  const startReadingRef = useRef<HTMLAnchorElement>(null);
  const mobileTwoTap = useSyncExternalStore(subscribeNoop, isMobileTouchBrowser, () => false);

  useFunnelPageEngagement({
    pageViewType: FUNNEL_EVENT_TYPES.READERS_AGREE_PAGE_VIEW,
    timeOnPageType: FUNNEL_EVENT_TYPES.READERS_AGREE_TIME_ON_PAGE,
    scrollDepthType: FUNNEL_EVENT_TYPES.READERS_AGREE_SCROLL_DEPTH,
    source: 'readers-agree',
    searchParams,
  });

  const startReadingHref = useMemo(
    () => buildReadersAgreePathWithTracking(READERS_AGREE_CHAPTER_1_PATH, searchParams),
    [searchParams],
  );

  const catalogHref = useMemo(
    () => buildReadersAgreePathWithTracking(READERS_AGREE_CATALOG_PATH, searchParams),
    [searchParams],
  );

  const amazonGoHref = useMemo(
    () => buildReadersAgreePathWithTracking(READERS_AGREE_GO_AMAZON_PATH, searchParams),
    [searchParams],
  );

  const bnGoHref = useMemo(
    () => buildReadersAgreePathWithTracking(READERS_AGREE_GO_BN_PATH, searchParams),
    [searchParams],
  );

  useEffect(() => {
    if (viewFiredRef.current) return;
    viewFiredRef.current = true;
    trackMeta('ViewContent', {
      content_ids: ['rrf-readers-agree'],
      content_name: 'Readers Agree Landing',
      content_type: 'product',
    });
    trackTikTok('ViewContent', {
      content_id: 'rrf-readers-agree',
      content_name: 'Readers Agree Landing',
      content_type: 'product',
    });
  }, []);

  const trackOpts = { source: 'readers-agree' as const, searchParams };

  const handleStartReadingClick = () => {
    trackFunnelEvent(
      FUNNEL_EVENT_TYPES.READERS_AGREE_SAMPLE_CHAPTERS_CLICK,
      { destination: 'chapter-1-direct' },
      trackOpts,
    );
    trackFunnelEvent(FUNNEL_EVENT_TYPES.READERS_AGREE_START_READING_CLICK, {}, trackOpts);
  };

  const handleBuyClick = () =>
    trackFunnelEvent(FUNNEL_EVENT_TYPES.READERS_AGREE_BUY_CLICK, {}, trackOpts);

  const handleAmazonClick = () =>
    trackFunnelEvent(FUNNEL_EVENT_TYPES.READERS_AGREE_AMAZON_CLICK, {}, trackOpts);

  const handleBnClick = () =>
    trackFunnelEvent(FUNNEL_EVENT_TYPES.READERS_AGREE_BN_CLICK, {}, trackOpts);

  const handleRetailerTap = (
    event: MouseEvent<HTMLAnchorElement>,
    destinationUrl: string,
    bridgeHref: string,
    trackClick: () => void,
  ) => {
    event.preventDefault();
    trackClick();
    clearBridgeTabDeparted();
    markReadersAgreeReviewOpened();
    const opened = window.open(destinationUrl, '_blank', 'noopener,noreferrer');
    if (!opened) {
      markRetailerPopupBlocked();
    } else {
      window.setTimeout(() => {
        if (!document.hasFocus()) {
          markBridgeTabDeparted();
        }
      }, 0);
    }
    router.push(bridgeHref);
  };

  const handleIosBridgeNav = () => {
    resetBridgeSessionState();
  };

  const amazonReviewControl =
    BRIDGE_ENABLED && !mobileTwoTap ? (
      <a
        href={READERS_AGREE_AMAZON_ATTRIBUTION_URL}
        className="ra-bn-cta-secondary"
        onClick={(event) =>
          handleRetailerTap(event, READERS_AGREE_AMAZON_ATTRIBUTION_URL, amazonGoHref, handleAmazonClick)
        }
        rel="noopener noreferrer"
      >
        Amazon Reviews →
      </a>
    ) : (
      <Link
        href={amazonGoHref}
        className="ra-bn-cta-secondary"
        onClick={() => {
          if (BRIDGE_ENABLED && mobileTwoTap) handleIosBridgeNav();
          handleAmazonClick();
        }}
      >
        Amazon Reviews →
      </Link>
    );

  const bnReviewControl =
    BRIDGE_ENABLED && !mobileTwoTap ? (
      <a
        href={BARNES_NOBLE_REVIEWS_URL}
        className="ra-bn-cta-secondary"
        onClick={(event) =>
          handleRetailerTap(event, BARNES_NOBLE_REVIEWS_URL, bnGoHref, handleBnClick)
        }
        rel="noopener noreferrer"
      >
        Barnes &amp; Noble Reviews →
      </a>
    ) : (
      <Link
        href={bnGoHref}
        className="ra-bn-cta-secondary"
        onClick={() => {
          if (BRIDGE_ENABLED && mobileTwoTap) handleIosBridgeNav();
          handleBnClick();
        }}
      >
        Barnes &amp; Noble Reviews →
      </Link>
    );

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#050505',
        color: '#f5f5f5',
      }}
    >
      <section className="ra-bn-hero">
        <div className="ra-bn-hero-scanlines" aria-hidden />

        <div className="ra-bn-shell">
          <div className="ra-bn-cover-wrap">
            <Image
              src={READERS_AGREE_HERO_IMAGE_PATH}
              alt="The Agnes Protocol — book cover"
              width={400}
              height={298}
              sizes="(max-width: 767px) 200px, 280px"
              priority
            />
          </div>

          <div className="ra-bn-copy">
            <h1 className="ra-bn-headline">
              <span className="ra-bn-headline-white">Readers Agree — </span>
              <span className="ra-bn-headline-red">See Why They Can&apos;t Put It Down</span>
            </h1>

            <p className="ra-bn-friend-intro">
              A reader you know thought you&apos;d connect with this.
            </p>

            <div className="ra-bn-synopsis">
              <p className="ra-bn-synopsis-hook">{READERS_AGREE_SYNOPSIS_HOOK}</p>
              {READERS_AGREE_SYNOPSIS_PARAGRAPHS.map((paragraph) => (
                <p key={paragraph.slice(0, 48)}>{paragraph}</p>
              ))}
            </div>

            <div className="ra-bn-appeals" aria-hidden>
              {READERS_AGREE_APPEAL_LABELS.map((label) => (
                <span key={label} className="ra-bn-appeal-pill">
                  {label}
                </span>
              ))}
            </div>

            <ReadersAgreeScrollCue startReadingRef={startReadingRef} />

            <div className="ra-bn-ctas">
              <Link
                ref={startReadingRef}
                href={startReadingHref}
                className="ra-bn-cta-primary"
                onClick={handleStartReadingClick}
              >
                Start Reading →
              </Link>

              <div className="ra-bn-reviews">
                <p className="ra-bn-reviews-label">Read Reviews</p>
                <div className="ra-bn-review-row">
                  {amazonReviewControl}
                  {bnReviewControl}
                </div>
              </div>

              <Link href={catalogHref} className="ra-bn-cta-tertiary" onClick={handleBuyClick}>
                Buy the Book →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
