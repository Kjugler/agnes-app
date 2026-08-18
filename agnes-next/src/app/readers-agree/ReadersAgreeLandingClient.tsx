'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useSyncExternalStore, type MouseEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import SiteFooter from '@/components/SiteFooter';
import ReadersAgreeScrollCue from '@/components/readers-agree/ReadersAgreeScrollCue';
import ReadersAgreeEmailCapture from '@/components/readers-agree/ReadersAgreeEmailCapture';
import {
  isReadersAgreeReferralTraffic,
  READERS_AGREE_AD_HEADLINE,
  READERS_AGREE_AD_SUBLINE,
  READERS_AGREE_FRIEND_INTRO,
  READERS_AGREE_REFERRAL_HEADLINE_EMPHASIS,
  READERS_AGREE_REFERRAL_HEADLINE_PREFIX,
  READERS_AGREE_V2_LOCKED_PARAGRAPH,
  READERS_AGREE_V2_PILLARS,
} from '@/config/readersAgreeBnFunnel';
import { buildAmazonProductUrl } from '@/lib/amazonAttribution';
import { isMobileTouchBrowser } from '@/lib/device';
import { isReadersAgreeDorothyBridgeEnabled } from '@/lib/funnelConfig';
import { trackMeta } from '@/lib/metaPixel';
import { trackTikTok } from '@/lib/tiktokPixel';
import {
  BARNES_NOBLE_REVIEWS_URL,
  buildReadersAgreePathWithTracking,
  READERS_AGREE_CATALOG_PATH,
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
  const purchaseFirstRef = useRef<HTMLAnchorElement>(null);
  const emailFormRef = useRef<HTMLFormElement>(null);
  const mobileTwoTap = useSyncExternalStore(subscribeNoop, isMobileTouchBrowser, () => false);

  const isReferralTraffic = useMemo(
    () => isReadersAgreeReferralTraffic(searchParams),
    [searchParams],
  );

  useFunnelPageEngagement({
    pageViewType: FUNNEL_EVENT_TYPES.READERS_AGREE_PAGE_VIEW,
    timeOnPageType: FUNNEL_EVENT_TYPES.READERS_AGREE_TIME_ON_PAGE,
    scrollDepthType: FUNNEL_EVENT_TYPES.READERS_AGREE_SCROLL_DEPTH,
    source: 'readers-agree',
    searchParams,
    extraPageViewMeta: { presentation: isReferralTraffic ? 'referral' : 'ad-direct' },
  });

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

  const amazonProductUrl = useMemo(
    () => buildAmazonProductUrl({ searchParams }),
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

  const handleBuyDirectClick = () =>
    trackFunnelEvent(
      FUNNEL_EVENT_TYPES.READERS_AGREE_BUY_DIRECT_CLICK,
      { destination: 'catalog' },
      trackOpts,
    );

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

  const amazonControl =
    BRIDGE_ENABLED && !mobileTwoTap ? (
      <a
        ref={purchaseFirstRef}
        href={amazonProductUrl}
        className="ra-bn-purchase-btn"
        onClick={(event) =>
          handleRetailerTap(event, amazonProductUrl, amazonGoHref, handleAmazonClick)
        }
        rel="noopener noreferrer"
      >
        Amazon
      </a>
    ) : (
      <Link
        ref={purchaseFirstRef}
        href={amazonGoHref}
        className="ra-bn-purchase-btn"
        onClick={() => {
          if (BRIDGE_ENABLED && mobileTwoTap) handleIosBridgeNav();
          handleAmazonClick();
        }}
      >
        Amazon
      </Link>
    );

  const bnControl =
    BRIDGE_ENABLED && !mobileTwoTap ? (
      <a
        href={BARNES_NOBLE_REVIEWS_URL}
        className="ra-bn-purchase-btn"
        onClick={(event) =>
          handleRetailerTap(event, BARNES_NOBLE_REVIEWS_URL, bnGoHref, handleBnClick)
        }
        rel="noopener noreferrer"
      >
        Barnes &amp; Noble
      </a>
    ) : (
      <Link
        href={bnGoHref}
        className="ra-bn-purchase-btn"
        onClick={() => {
          if (BRIDGE_ENABLED && mobileTwoTap) handleIosBridgeNav();
          handleBnClick();
        }}
      >
        Barnes &amp; Noble
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

        <div className="ra-bn-hero-visual">
          <Image
            src={READERS_AGREE_HERO_IMAGE_PATH}
            alt="The Agnes Protocol — political thriller with Capitol surveillance and book cover"
            width={1200}
            height={630}
            sizes="(max-width: 767px) 100vw, min(960px, 100vw)"
            priority
            className="ra-bn-hero-image"
          />
        </div>

        <div className="ra-bn-shell">
          <div className="ra-bn-copy ra-bn-prose">
            {isReferralTraffic ? (
              <>
                <h1 className="ra-bn-headline">
                  <span className="ra-bn-headline-white">{READERS_AGREE_REFERRAL_HEADLINE_PREFIX}</span>
                  <span className="ra-bn-headline-red">{READERS_AGREE_REFERRAL_HEADLINE_EMPHASIS}</span>
                </h1>
                <p className="ra-bn-friend-intro">{READERS_AGREE_FRIEND_INTRO}</p>
              </>
            ) : (
              <>
                <h1 className="ra-bn-headline ra-bn-headline-ad">
                  <span className="ra-bn-headline-white">{READERS_AGREE_AD_HEADLINE}</span>
                </h1>
                <p className="ra-bn-ad-subline">{READERS_AGREE_AD_SUBLINE}</p>
              </>
            )}

            <div className="ra-bn-pillars" aria-label="Story themes">
              {READERS_AGREE_V2_PILLARS.map((pillar) => (
                <p key={pillar} className="ra-bn-pillar">
                  {pillar}
                </p>
              ))}
            </div>

            <p className="ra-bn-locked-paragraph">{READERS_AGREE_V2_LOCKED_PARAGRAPH}</p>

            <ReadersAgreeScrollCue startReadingRef={emailFormRef} />

            <div className="ra-bn-purchase-row" aria-label="Purchase options">
              {amazonControl}
              {bnControl}
              <Link href={catalogHref} className="ra-bn-purchase-btn" onClick={handleBuyDirectClick}>
                Buy Direct
              </Link>
            </div>

            <ReadersAgreeEmailCapture
              variant="landing"
              captureSurface="landing"
              searchParams={searchParams}
              formRef={emailFormRef}
            />
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
