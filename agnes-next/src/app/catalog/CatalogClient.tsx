'use client';

import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { useMemo, useEffect, useState, useRef, useSyncExternalStore, type CSSProperties } from 'react';
import { PRODUCTS, formatPrice, type ProductId } from '@/lib/products';
import { trackTikTok } from '@/lib/tiktokPixel';
import { trackMeta } from '@/lib/metaPixel';
import SiteFooter from '@/components/SiteFooter';
import { CATALOG_SOCIAL_PROOF } from '@/config/catalogSocialProof';
import {
  formatDiscountedPrice,
  formatSavings,
  discountedPriceCents,
} from '@/lib/catalogPricing';
import {
  hasTextAFriendDiscountCookie,
  resolveReferralCodeFromBrowser,
  validateReferralCode,
} from '@/lib/resolveCatalogReferral';
import {
  HUB_ACCENT_RED,
  HUB_THEME,
  hubContentWrapStyle,
  hubEyebrowStyle,
  hubPageShellStyle,
  hubPrimaryButtonStyle,
  hubSecondaryButtonStyle,
} from '@/lib/hubTheme';

const BOOK_COVER_SRC = '/og/book-cover-og.jpg';
const EBOOK_VALUE_LABEL = '$12';

type DiscountState =
  | { active: false }
  | { active: true; code: string; namedReferral: boolean };

function subscribeNarrow(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  const mq = window.matchMedia('(max-width: 720px)');
  mq.addEventListener('change', onStoreChange);
  return () => mq.removeEventListener('change', onStoreChange);
}

function getIsNarrow() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(max-width: 720px)').matches;
}

function featuredCardStyle(emphasis: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: '28px',
    padding: '32px',
    borderRadius: '12px',
    border: `1px solid ${HUB_THEME.border}`,
    background: HUB_THEME.surface,
    boxShadow: emphasis ? '0 12px 32px rgba(0, 0, 0, 0.08)' : '0 4px 16px rgba(0, 0, 0, 0.04)',
    marginBottom: '32px',
  };
}

function secondaryCardStyle(): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '22px 20px',
    borderRadius: '12px',
    border: `1px solid ${HUB_THEME.border}`,
    background: HUB_THEME.surface,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)',
    flex: '1 1 240px',
    minWidth: '220px',
  };
}

function PriceStack({
  priceCents,
  discount,
}: {
  priceCents: number;
  discount: DiscountState;
}) {
  if (!discount.active) {
    return (
      <div style={{ margin: '8px 0 4px' }}>
        <div
          style={{
            fontSize: '2rem',
            fontWeight: 700,
            color: HUB_THEME.primaryGreen,
            lineHeight: 1.1,
          }}
        >
          {formatPrice(priceCents)}
        </div>
      </div>
    );
  }

  const finalCents = discountedPriceCents(priceCents);
  return (
    <div style={{ margin: '12px 0 4px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', color: '#999999' }}>
        <span>List price</span>
        <span style={{ textDecoration: 'line-through' }}>{formatPrice(priceCents)}</span>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '15px',
          fontWeight: 600,
          color: HUB_THEME.primaryGreen,
        }}
      >
        <span>Reader savings</span>
        <span>{formatSavings(priceCents)}</span>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginTop: '4px',
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 600, color: HUB_THEME.textMuted, letterSpacing: '0.06em' }}>
          YOUR PRICE
        </span>
        <span
          style={{
            fontSize: 'clamp(2rem, 5vw, 2.5rem)',
            fontWeight: 700,
            color: HUB_THEME.primaryGreen,
            lineHeight: 1,
          }}
        >
          {formatPrice(finalCents)}
        </span>
      </div>
    </div>
  );
}

export default function CatalogClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isNarrow = useSyncExternalStore(subscribeNarrow, getIsNarrow, () => true);

  const [discount, setDiscount] = useState<DiscountState>({ active: false });
  const [discountLoading, setDiscountLoading] = useState(true);
  const [whyBuyOpen, setWhyBuyOpen] = useState(false);

  const paperback = PRODUCTS.find((p) => p.id === 'paperback')!;
  const ebook = PRODUCTS.find((p) => p.id === 'ebook')!;
  const audio = PRODUCTS.find((p) => p.id === 'audio_preorder')!;

  const refQueryKey = searchParams.toString();

  useEffect(() => {
    let cancelled = false;

    async function resolveDiscount() {
      setDiscountLoading(true);
      try {
        const candidate = resolveReferralCodeFromBrowser(searchParams);
        if (candidate) {
          const result = await validateReferralCode(candidate);
          if (!cancelled && result.valid) {
            setDiscount({ active: true, code: result.code, namedReferral: true });
            return;
          }
          if (!cancelled && result.serviceUnavailable && process.env.NODE_ENV === 'development') {
            console.warn(
              `[catalog] Could not validate ref "${candidate}" — deepquill backend unavailable.`,
            );
          }
        }
        if (!cancelled && hasTextAFriendDiscountCookie()) {
          setDiscount({ active: true, code: '', namedReferral: false });
          return;
        }
        if (!cancelled) setDiscount({ active: false });
      } catch {
        if (!cancelled) setDiscount({ active: false });
      } finally {
        if (!cancelled) setDiscountLoading(false);
      }
    }

    resolveDiscount();
    return () => {
      cancelled = true;
    };
  }, [refQueryKey, searchParams]);

  const browseFiredRef = useRef(false);
  useEffect(() => {
    if (browseFiredRef.current) return;
    browseFiredRef.current = true;
    trackTikTok('Browse', {
      content_type: 'product_group',
      content_name: 'The Agnes Protocol Catalog',
    });
    trackMeta('ViewContent', {
      content_type: 'product_group',
      content_name: 'The Agnes Protocol Catalog',
      content_ids: PRODUCTS.map((p) => p.id),
    });
  }, []);

  const trackingParams = useMemo(() => {
    const params = new URLSearchParams();
    const keysToPreserve = ['ref', 'src', 'v', 'origin', 'code', 'utm_source', 'utm_medium', 'utm_campaign'];
    keysToPreserve.forEach((key) => {
      const value = searchParams.get(key);
      if (value) params.set(key, value);
    });
    return params;
  }, [searchParams]);

  const handleBuyClick = (product: ProductId) => {
    const params = new URLSearchParams(trackingParams);
    params.set('product', product);
    router.push(`/checkout?${params.toString()}`);
  };

  const paperbackFinalLabel = discount.active
    ? formatDiscountedPrice(paperback.priceCents)
    : paperback.displayPrice;

  const buyPaperbackLabel = discount.active
    ? `Buy Direct — ${paperbackFinalLabel}`
    : `Buy Paperback — ${paperback.displayPrice}`;

  const buyProductLabel = (product: (typeof PRODUCTS)[number]) => {
    if (!discount.active) {
      if (product.id === 'audio_preorder') return `Preorder Audio — ${product.displayPrice}`;
      return `Buy ${product.title} — ${product.displayPrice}`;
    }
    const final = formatDiscountedPrice(product.priceCents);
    if (product.id === 'audio_preorder') return `Preorder Audio — ${final}`;
    return `Buy ${product.title} — ${final}`;
  };

  return (
    <main style={hubPageShellStyle()}>
      <div style={{ ...hubContentWrapStyle(), paddingTop: '48px' }}>
        {/* Hero */}
        <header style={{ textAlign: 'center', marginBottom: '40px' }}>
          <p style={{ ...hubEyebrowStyle(), marginBottom: '16px' }}>Continue Your Journey</p>
          <h1
            style={{
              margin: '0 0 16px 0',
              fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
              fontWeight: 700,
              lineHeight: 1.15,
              color: HUB_THEME.text,
            }}
          >
            The Complete Agnes Protocol Experience
          </h1>
          <p
            style={{
              margin: '0 auto 20px',
              maxWidth: '36rem',
              fontSize: 'clamp(1rem, 2.2vw, 1.125rem)',
              lineHeight: 1.55,
              color: HUB_THEME.textMuted,
            }}
          >
            You&apos;ve discovered the story. Now experience it the way it was meant to be experienced.
          </p>
          <p
            style={{
              margin: '0 0 12px 0',
              fontSize: '15px',
              fontWeight: 500,
              color: HUB_THEME.textMuted,
            }}
          >
            <span style={{ color: '#F59E0B', letterSpacing: '0.05em' }} aria-hidden>
              ★★★★★{' '}
            </span>
            {CATALOG_SOCIAL_PROOF}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: '13px',
              letterSpacing: '0.04em',
              color: '#999999',
            }}
          >
            Paperback • FREE eBook • eBook • Audiobook
          </p>
        </header>

        {/* Featured paperback */}
        <section
          style={{
            ...featuredCardStyle(true),
            flexDirection: isNarrow ? 'column' : 'row',
            alignItems: isNarrow ? 'stretch' : 'flex-start',
          }}
          aria-labelledby="catalog-paperback-heading"
        >
          <div
            style={{
              flex: isNarrow ? undefined : '0 0 200px',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <Image
              src={BOOK_COVER_SRC}
              alt="The Agnes Protocol — book cover"
              width={200}
              height={300}
              priority
              style={{
                width: 'min(200px, 55vw)',
                height: 'auto',
                borderRadius: '4px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
              }}
            />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                margin: '0 0 12px 0',
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: HUB_THEME.textMuted,
              }}
            >
              Paperback
            </p>

            {discount.active && !discountLoading && (
              <div
                style={{
                  display: 'inline-block',
                  marginBottom: '16px',
                  padding: '8px 14px',
                  borderRadius: '999px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#0a5c32',
                  background: 'rgba(0, 255, 127, 0.12)',
                  border: '1px solid rgba(0, 255, 127, 0.35)',
                }}
              >
                {discount.namedReferral
                  ? `Your reader discount is applied — Code: ${discount.code}`
                  : '15% reader discount applied'}
              </div>
            )}

            <h2
              id="catalog-paperback-heading"
              style={{
                margin: '0 0 12px 0',
                fontSize: 'clamp(1.125rem, 2.5vw, 1.375rem)',
                fontWeight: 600,
                lineHeight: 1.35,
                color: HUB_THEME.text,
              }}
            >
              Includes FREE eBook ({EBOOK_VALUE_LABEL} Value)
            </h2>

            <div style={{ marginBottom: '20px' }}>
              <p
                style={{
                  margin: '0 0 4px 0',
                  fontSize: '13px',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: HUB_THEME.text,
                }}
              >
                Start Reading Today
              </p>
              <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.45, color: HUB_THEME.textMuted }}>
                Your FREE eBook arrives immediately.
              </p>
            </div>

            <PriceStack priceCents={paperback.priceCents} discount={discount} />

            <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#999999' }}>
              + shipping at checkout
            </p>

            <button
              type="button"
              onClick={() => handleBuyClick('paperback')}
              style={{ ...hubPrimaryButtonStyle(true), marginBottom: '16px', maxWidth: isNarrow ? '100%' : '320px' }}
            >
              {buyPaperbackLabel}
            </button>

            {discount.active && discount.namedReferral && (
              <p
                style={{
                  margin: '0 0 16px 0',
                  fontSize: '14px',
                  lineHeight: 1.5,
                  color: HUB_THEME.textMuted,
                }}
              >
                Your purchase supports the friend who recommended this book.
              </p>
            )}

            <button
              type="button"
              onClick={() => setWhyBuyOpen((open) => !open)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: '14px',
                color: HUB_THEME.textMuted,
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
              }}
            >
              Why buy direct? {whyBuyOpen ? '▾' : '▸'}
            </button>

            {whyBuyOpen && (
              <div
                style={{
                  marginTop: '20px',
                  padding: '20px 22px',
                  borderRadius: '10px',
                  border: `1px solid ${HUB_THEME.border}`,
                  background: HUB_THEME.bg,
                }}
              >
                <p style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600, color: HUB_THEME.text }}>
                  Why Buy Direct?
                </p>
                <p style={{ margin: '0 0 4px 0', fontSize: '15px', lineHeight: 1.5, color: HUB_THEME.textMuted }}>
                  Read reviews on Amazon.
                </p>
                <p style={{ margin: '0 0 16px 0', fontSize: '15px', lineHeight: 1.5, color: HUB_THEME.textMuted }}>
                  Experience The Agnes Protocol here.
                </p>
                <ul
                  style={{
                    margin: 0,
                    padding: 0,
                    listStyle: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    fontSize: '14px',
                    color: HUB_THEME.text,
                  }}
                >
                  <li>✓ FREE eBook Included</li>
                  <li>✓ Buy Direct From the Author</li>
                  <li>✓ Reader Rewards With Every Purchase</li>
                  {discount.active && <li>✓ 15% Reader Discount Applied</li>}
                </ul>
              </div>
            )}
          </div>
        </section>

        {/* Secondary formats */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '20px',
            marginBottom: '40px',
          }}
        >
          {[ebook, audio].map((product) => (
            <div key={product.id} style={secondaryCardStyle()}>
              <p
                style={{
                  margin: 0,
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: HUB_THEME.textMuted,
                }}
              >
                {product.title}
              </p>
              <PriceStack priceCents={product.priceCents} discount={discount} />
              <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.45, color: HUB_THEME.textMuted, flex: 1 }}>
                {product.id === 'ebook'
                  ? 'Instant download after checkout.'
                  : 'Preorder now — we\u2019ll email you when it\u2019s ready.'}
              </p>
              <button
                type="button"
                onClick={() => handleBuyClick(product.id)}
                style={
                  product.id === 'ebook'
                    ? hubPrimaryButtonStyle(true)
                    : hubSecondaryButtonStyle()
                }
              >
                {buyProductLabel(product)}
              </button>
            </div>
          ))}
        </div>

        <p
          style={{
            maxWidth: '520px',
            margin: '0 auto 8px',
            textAlign: 'center',
            fontSize: '13px',
            lineHeight: 1.5,
            color: HUB_THEME.textMuted,
          }}
        >
          Secure checkout via Stripe · Instant eBook delivery by email · Paperback ships separately
        </p>
        <p
          style={{
            maxWidth: '520px',
            margin: '0 auto',
            textAlign: 'center',
            fontSize: '13px',
            lineHeight: 1.5,
            color: '#999999',
          }}
        >
          If you didn&apos;t receive an email, your purchase likely didn&apos;t complete. You can safely try again.
        </p>

        <SiteFooter variant="light" />
      </div>
    </main>
  );
}
