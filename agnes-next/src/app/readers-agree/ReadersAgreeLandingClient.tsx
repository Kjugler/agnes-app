'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { useSearchParams } from 'next/navigation';
import SiteFooter from '@/components/SiteFooter';
import { trackMeta } from '@/lib/metaPixel';
import { trackTikTok } from '@/lib/tiktokPixel';
import {
  buildReadersAgreePathWithTracking,
  READERS_AGREE_GO_AMAZON_PATH,
  READERS_AGREE_GO_BN_PATH,
  READERS_AGREE_HERO_IMAGE_PATH,
  SAMPLE_CHAPTERS_PATH,
} from '@/lib/readerRecommendationLanding';
import {
  FUNNEL_EVENT_TYPES,
  trackFunnelEvent,
  useFunnelPageEngagement,
} from '@/lib/funnelTracking';

const cardBase: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '24px 22px',
  borderRadius: '12px',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  background: 'linear-gradient(145deg, rgba(20, 20, 20, 0.95) 0%, rgba(12, 12, 12, 0.98) 100%)',
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.45)',
  textDecoration: 'none',
  color: '#f5f5f5',
  transition: 'border-color 0.2s ease, transform 0.2s ease',
};

const externalCta: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '12px 20px',
  borderRadius: '8px',
  fontSize: '15px',
  fontWeight: 700,
  border: '1px solid rgba(255, 255, 255, 0.25)',
  background: 'rgba(255, 255, 255, 0.06)',
  color: '#fff',
  textDecoration: 'none',
};

const sampleCta: CSSProperties = {
  ...externalCta,
  background: '#00ff7f',
  color: '#0a0a0a',
  border: 'none',
  boxShadow: '0 0 24px rgba(0, 255, 127, 0.25)',
};

function ReviewCard({
  stars,
  title,
  href,
  cta,
  variant,
  onNavigate,
}: {
  stars: string;
  title: string;
  href: string;
  cta: string;
  variant: 'retailer' | 'sample';
  onNavigate?: () => void;
}) {
  const isSample = variant === 'sample';
  const ctaStyle = isSample ? sampleCta : externalCta;

  return (
    <Link
      href={href}
      onClick={() => onNavigate?.()}
      style={{
        ...cardBase,
        borderColor: isSample ? 'rgba(0, 255, 127, 0.35)' : undefined,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = isSample
          ? 'rgba(0, 255, 127, 0.65)'
          : 'rgba(220, 38, 38, 0.55)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = isSample
          ? 'rgba(0, 255, 127, 0.35)'
          : 'rgba(255, 255, 255, 0.12)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div style={{ fontSize: '18px', letterSpacing: '0.06em' }} aria-hidden>
        {stars}
      </div>
      <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, lineHeight: 1.3 }}>{title}</h2>
      <span style={ctaStyle}>{cta} →</span>
    </Link>
  );
}

export default function ReadersAgreeLandingClient() {
  const searchParams = useSearchParams();
  const viewFiredRef = useRef(false);

  useFunnelPageEngagement({
    pageViewType: FUNNEL_EVENT_TYPES.READERS_AGREE_PAGE_VIEW,
    timeOnPageType: FUNNEL_EVENT_TYPES.READERS_AGREE_TIME_ON_PAGE,
    scrollDepthType: FUNNEL_EVENT_TYPES.READERS_AGREE_SCROLL_DEPTH,
    source: 'readers-agree',
    searchParams,
  });

  const sampleChaptersHref = useMemo(
    () => buildReadersAgreePathWithTracking(SAMPLE_CHAPTERS_PATH, searchParams),
    [searchParams]
  );

  const amazonGoHref = useMemo(
    () => buildReadersAgreePathWithTracking(READERS_AGREE_GO_AMAZON_PATH, searchParams),
    [searchParams]
  );

  const bnGoHref = useMemo(
    () => buildReadersAgreePathWithTracking(READERS_AGREE_GO_BN_PATH, searchParams),
    [searchParams]
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

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#050505',
        color: '#f5f5f5',
      }}
    >
      <section
        style={{
          position: 'relative',
          overflow: 'hidden',
          padding: '32px 16px 40px',
          background:
            'radial-gradient(ellipse 120% 80% at 50% -20%, rgba(185, 28, 28, 0.45) 0%, transparent 55%), linear-gradient(180deg, #0c0c0c 0%, #050505 100%)',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.02) 2px, rgba(255,255,255,0.02) 4px)',
            pointerEvents: 'none',
            opacity: 0.4,
          }}
        />

        <div
          style={{
            position: 'relative',
            maxWidth: '960px',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '28px',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow:
                '0 24px 60px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255,255,255,0.08), 0 0 48px rgba(185, 28, 28, 0.2)',
            }}
          >
            <Image
              src={READERS_AGREE_HERO_IMAGE_PATH}
              alt="Readers Agree — The Agnes Protocol"
              width={1200}
              height={896}
              sizes="(max-width: 960px) 100vw, 960px"
              style={{ width: '100%', height: 'auto', display: 'block' }}
              priority
            />
          </div>

          <div style={{ maxWidth: '36rem' }}>
            <p
              style={{
                margin: '0 0 12px 0',
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: '#fca5a5',
              }}
            >
              The Agnes Protocol
            </p>
            <h1
              style={{
                margin: '0 0 14px 0',
                fontSize: 'clamp(1.75rem, 5vw, 2.5rem)',
                fontWeight: 800,
                lineHeight: 1.15,
                letterSpacing: '-0.02em',
              }}
            >
              <span style={{ color: '#ffffff' }}>Readers Agree — </span>
              <span style={{ color: '#ef4444', textShadow: '0 0 40px rgba(239, 68, 68, 0.35)' }}>
                See Why They Can&apos;t Put It Down
              </span>
            </h1>
            <p
              style={{
                margin: '0 0 14px 0',
                fontSize: 'clamp(1rem, 2.5vw, 1.2rem)',
                lineHeight: 1.5,
                color: 'rgba(245, 245, 245, 0.92)',
                fontWeight: 600,
              }}
            >
              A reader you know thought you&apos;d connect with this. Nearly all ★★★★★ reviews.
            </p>
            <p
              style={{
                margin: 0,
                fontSize: '16px',
                lineHeight: 1.65,
                color: 'rgba(245, 245, 245, 0.72)',
              }}
            >
              Read what real readers said on Amazon and Barnes &amp; Noble — then start with 4 free
              sample chapters.
            </p>
          </div>
        </div>
      </section>

      <section style={{ padding: '0 16px 56px', maxWidth: '960px', margin: '0 auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '20px',
          }}
        >
          <ReviewCard
            stars="★★★★★"
            title="Amazon Readers"
            href={amazonGoHref}
            cta="Read the Reviews"
            variant="retailer"
            onNavigate={() =>
              trackFunnelEvent(FUNNEL_EVENT_TYPES.READERS_AGREE_AMAZON_CLICK, {}, {
                source: 'readers-agree',
                searchParams,
              })
            }
          />
          <ReviewCard
            stars="★★★★★"
            title="Barnes & Noble Readers"
            href={bnGoHref}
            cta="Read the Reviews"
            variant="retailer"
            onNavigate={() =>
              trackFunnelEvent(FUNNEL_EVENT_TYPES.READERS_AGREE_BN_CLICK, {}, {
                source: 'readers-agree',
                searchParams,
              })
            }
          />
          <ReviewCard
            stars="📖"
            title="Read 4 FREE Sample Chapters"
            href={sampleChaptersHref}
            cta="Start Reading"
            variant="sample"
            onNavigate={() =>
              trackFunnelEvent(FUNNEL_EVENT_TYPES.READERS_AGREE_SAMPLE_CHAPTERS_CLICK, {}, {
                source: 'readers-agree',
                searchParams,
              })
            }
          />
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
