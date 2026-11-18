'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import SiteFooter from '@/components/SiteFooter';
import { trackMeta } from '@/lib/metaPixel';
import { trackTikTok } from '@/lib/tiktokPixel';
import {
  FUNNEL_EVENT_TYPES,
  trackFunnelEvent,
  useFunnelPageEngagement,
} from '@/lib/funnelTracking';
import { catalogHref, sampleChaptersHubHref } from '@/lib/sampleChapterNav';
import './world-wondering.css';

const HERO_SRC = '/images/ChatGPT%20Image%20Sep%203%2C%202026%2C%2011_28_25%20AM.png';

export default function WorldWonderingClient() {
  const searchParams = useSearchParams();
  const contentFiredRef = useRef(false);

  useFunnelPageEngagement({
    pageViewType: FUNNEL_EVENT_TYPES.WORLD_WONDERING_PAGE_VIEW,
    source: 'world-wondering',
    searchParams,
  });

  const sampleHref = useMemo(() => sampleChaptersHubHref(searchParams), [searchParams]);
  const catalogLink = useMemo(() => catalogHref(searchParams), [searchParams]);

  useEffect(() => {
    if (contentFiredRef.current) return;
    contentFiredRef.current = true;
    trackMeta('ViewContent', {
      content_ids: ['world-wondering'],
      content_name: 'World Wondering',
      content_type: 'product',
    });
    trackTikTok('ViewContent', {
      content_id: 'world-wondering',
      content_name: 'World Wondering',
      content_type: 'product',
    });
  }, []);

  const trackOpts = { source: 'world-wondering' as const, searchParams };

  return (
    <main className="ww-page">
      <div className="ww-hero">
        <img
          src={HERO_SRC}
          alt="Logan Townsend, a fictional podcast host in The Agnes Protocol, seated in his studio beneath The Logan Townsend Show screen and an illuminated ON AIR sign."
          width={1536}
          height={1024}
          fetchPriority="high"
          className="ww-hero-image"
        />
      </div>

      <div className="ww-copy">
        <p className="ww-eyebrow">THE AGNES PROTOCOL — A NOVEL BY SIMON MCQUADE</p>
        <h1 className="ww-headline">EVERY STORY HAS A BEGINNING. THIS ONE HAS A SECRET.</h1>
        <p className="ww-support">
          In a world where questions lead to more questions, some discoveries change everything.
        </p>
        <p className="ww-support">
          Enter the world of <em>The Agnes Protocol</em>, a suspense thriller filled with secrets,
          unexpected alliances, and characters whose decisions carry extraordinary consequences.
        </p>

        <section className="ww-character" aria-labelledby="logan-townsend-heading">
          <h2 id="logan-townsend-heading">MEET LOGAN TOWNSEND</h2>
          <p>A podcast host who knows how to ask difficult questions.</p>
          <p>But some answers come at a price.</p>
          <p>Discover the characters and the mystery inside <em>The Agnes Protocol</em>.</p>
        </section>

        <div className="ww-actions">
          <Link
            href={sampleHref}
            className="ww-cta ww-cta-primary"
            onClick={() =>
              trackFunnelEvent(
                FUNNEL_EVENT_TYPES.WORLD_WONDERING_SAMPLE_CHAPTERS_CLICK,
                { destination: '/sample-chapters' },
                trackOpts,
              )
            }
          >
            READ FREE SAMPLE CHAPTERS
          </Link>
          <Link
            href={catalogLink}
            className="ww-cta ww-cta-secondary"
            onClick={() =>
              trackFunnelEvent(
                FUNNEL_EVENT_TYPES.WORLD_WONDERING_CATALOG_CLICK,
                { destination: '/catalog' },
                trackOpts,
              )
            }
          >
            EXPLORE THE BOOK
          </Link>
        </div>

        <p className="ww-close">The story is fiction. The suspense is real.</p>
      </div>

      <SiteFooter variant="muted" />
    </main>
  );
}
