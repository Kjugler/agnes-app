'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, type MouseEvent } from 'react';
import ReadersAgreeEmailCapture from '@/components/readers-agree/ReadersAgreeEmailCapture';
import { buildAmazonProductUrl } from '@/lib/amazonAttribution';
import {
  BARNES_NOBLE_REVIEWS_URL,
  buildReadersAgreePathWithTracking,
  READERS_AGREE_CATALOG_PATH,
  READERS_AGREE_GO_AMAZON_PATH,
  READERS_AGREE_GO_BN_PATH,
} from '@/lib/readerRecommendationLanding';
import { FUNNEL_EVENT_TYPES, trackFunnelEvent } from '@/lib/funnelTracking';
import './readers-agree-bridge.css';

export type BridgeRetailerOrigin = 'amazon' | 'bn';

type BridgeDecideNextProps = {
  retailerOrigin: BridgeRetailerOrigin;
  destinationUrl: string;
  searchParams: URLSearchParams | null;
};

export default function BridgeDecideNext({
  retailerOrigin,
  destinationUrl,
  searchParams,
}: BridgeDecideNextProps) {
  const router = useRouter();
  const viewFiredRef = useRef(false);

  const catalogHref = useMemo(
    () =>
      buildReadersAgreePathWithTracking(
        READERS_AGREE_CATALOG_PATH,
        searchParams ?? new URLSearchParams(),
      ),
    [searchParams],
  );

  const amazonProductUrl = useMemo(
    () => buildAmazonProductUrl({ searchParams }),
    [searchParams],
  );

  const amazonGoHref = useMemo(
    () =>
      buildReadersAgreePathWithTracking(
        READERS_AGREE_GO_AMAZON_PATH,
        searchParams ?? new URLSearchParams(),
      ),
    [searchParams],
  );

  const bnGoHref = useMemo(
    () =>
      buildReadersAgreePathWithTracking(
        READERS_AGREE_GO_BN_PATH,
        searchParams ?? new URLSearchParams(),
      ),
    [searchParams],
  );

  const isAmazonOrigin = retailerOrigin === 'amazon';
  const altRetailer = isAmazonOrigin ? 'bn' : 'amazon';

  useEffect(() => {
    if (viewFiredRef.current) return;
    viewFiredRef.current = true;
    trackFunnelEvent(
      FUNNEL_EVENT_TYPES.READERS_AGREE_BRIDGE_VIEW,
      { retailerOrigin },
      { source: 'readers-agree-bridge', searchParams },
    );
  }, [retailerOrigin, searchParams]);

  const trackOpts = { source: 'readers-agree-bridge' as const, searchParams };

  const handleBuyDirect = () => {
    trackFunnelEvent(
      FUNNEL_EVENT_TYPES.READERS_AGREE_BRIDGE_BUY_DIRECT_CLICK,
      { retailerOrigin, destination: 'catalog' },
      trackOpts,
    );
  };

  const handleBackToRetailer = () => {
    trackFunnelEvent(
      FUNNEL_EVENT_TYPES.READERS_AGREE_BRIDGE_BACK_TO_RETAILER_CLICK,
      { retailerOrigin },
      trackOpts,
    );
  };

  const handleAltRetailerClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    trackFunnelEvent(
      FUNNEL_EVENT_TYPES.READERS_AGREE_BRIDGE_ALT_RETAILER_CLICK,
      { retailerOrigin, altRetailer },
      trackOpts,
    );

    if (altRetailer === 'amazon') {
      window.open(amazonProductUrl, '_blank', 'noopener,noreferrer');
      router.push(amazonGoHref);
    } else {
      window.open(BARNES_NOBLE_REVIEWS_URL, '_blank', 'noopener,noreferrer');
      router.push(bnGoHref);
    }
  };

  const backLabel = isAmazonOrigin ? 'Back to Amazon' : 'Back to Barnes & Noble';
  const altLabel = isAmazonOrigin ? 'Barnes & Noble' : 'Amazon';

  return (
    <main className="ra-bridge-shell">
      <div className="ra-bridge-honeycomb" aria-hidden />
      <section className="ra-bridge-panel">
        <div className="ra-bridge-copy">
          <h1 className="ra-bridge-headline">Still deciding?</h1>
          <p className="ra-bridge-subline">
            Take another look, compare your options, or keep exploring.
          </p>
        </div>

        <div className="ra-bridge-actions" aria-label="Next steps">
          <Link href={catalogHref} className="ra-bridge-btn" onClick={handleBuyDirect}>
            Buy Direct
          </Link>
          <a
            href={altRetailer === 'amazon' ? amazonProductUrl : BARNES_NOBLE_REVIEWS_URL}
            className="ra-bridge-btn"
            onClick={handleAltRetailerClick}
            rel="noopener noreferrer"
          >
            {altLabel}
          </a>
        </div>

        <a
          href={destinationUrl}
          className="ra-bridge-back-link"
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleBackToRetailer}
        >
          {backLabel}
        </a>

        <ReadersAgreeEmailCapture
          variant="bridge"
          captureSurface="bridge"
          retailerOrigin={retailerOrigin}
          searchParams={searchParams}
          className="ra-bridge-email"
        />
      </section>
    </main>
  );
}
