'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import SiteFooter from '@/components/SiteFooter';
import ReadersAgreeScrollCue from '@/components/readers-agree/ReadersAgreeScrollCue';
import ReadersAgreeEmailCapture from '@/components/readers-agree/ReadersAgreeEmailCapture';
import {
  READERS_AGREE_APPEAL_LABELS,
  READERS_AGREE_SYNOPSIS_HOOK,
  READERS_AGREE_SYNOPSIS_PARAGRAPHS,
} from '@/config/readersAgreeBnFunnel';
import { trackMeta } from '@/lib/metaPixel';
import { trackTikTok } from '@/lib/tiktokPixel';
import {
  BARNES_NOBLE_REVIEWS_URL,
  READERS_AGREE_AMAZON_ATTRIBUTION_URL,
  buildReadersAgreePathWithTracking,
  READERS_AGREE_CATALOG_PATH,
  READERS_AGREE_HERO_IMAGE_PATH,
} from '@/lib/readerRecommendationLanding';
import {
  FUNNEL_EVENT_TYPES,
  trackFunnelEvent,
  useFunnelPageEngagement,
} from '@/lib/funnelTracking';
import './readers-agree-bn.css';

export default function ReadersAgreeLandingClient() {
  const searchParams = useSearchParams();
  const viewFiredRef = useRef(false);
  const emailFormRef = useRef<HTMLFormElement>(null);

  useFunnelPageEngagement({
    pageViewType: FUNNEL_EVENT_TYPES.READERS_AGREE_PAGE_VIEW,
    timeOnPageType: FUNNEL_EVENT_TYPES.READERS_AGREE_TIME_ON_PAGE,
    scrollDepthType: FUNNEL_EVENT_TYPES.READERS_AGREE_SCROLL_DEPTH,
    source: 'readers-agree',
    searchParams,
  });

  const catalogHref = useMemo(
    () => buildReadersAgreePathWithTracking(READERS_AGREE_CATALOG_PATH, searchParams),
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

            <ReadersAgreeScrollCue startReadingRef={emailFormRef} />

            <div className="ra-bn-ctas">
              <Link
                href={catalogHref}
                className="ra-bn-cta-primary"
                onClick={handleBuyDirectClick}
              >
                Buy Direct →
              </Link>

              <div className="ra-bn-purchase-row" aria-label="Retail purchase options">
                <a
                  href={READERS_AGREE_AMAZON_ATTRIBUTION_URL}
                  className="ra-bn-cta-secondary"
                  rel="noopener noreferrer"
                  onClick={handleAmazonClick}
                >
                  Amazon
                </a>
                <a
                  href={BARNES_NOBLE_REVIEWS_URL}
                  className="ra-bn-cta-secondary"
                  rel="noopener noreferrer"
                  onClick={handleBnClick}
                >
                  Barnes &amp; Noble
                </a>
              </div>

              <ReadersAgreeEmailCapture searchParams={searchParams} formRef={emailFormRef} />
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
