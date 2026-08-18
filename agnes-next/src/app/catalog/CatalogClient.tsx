'use client';

import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PRODUCTS, formatPrice, type ProductId } from '@/lib/products';
import { trackTikTok } from '@/lib/tiktokPixel';
import { trackMeta } from '@/lib/metaPixel';
import SiteFooter from '@/components/SiteFooter';
import { CATALOG_SOCIAL_PROOF } from '@/config/catalogSocialProof';
import {
  CATALOG_AUDIO_LABEL,
  CATALOG_AUDIO_TAGLINE,
  CATALOG_EBOOK_TAGLINE,
  CATALOG_HERO_EYEBROW,
  CATALOG_HERO_HEADLINE,
  CATALOG_HERO_SUBLINE,
  CATALOG_PAPERBACK_BADGE,
  CATALOG_PAPERBACK_TITLE,
  CATALOG_PAPERBACK_VALUE_ITEMS,
  CATALOG_TRUST_NOTE,
} from '@/config/catalogMerchandising';
import {
  discountedPriceCents,
  formatDiscountedPrice,
  formatSavings,
} from '@/lib/catalogPricing';
import { buildCatalogTrackingParams } from '@/lib/catalogAttribution';
import {
  hasTextAFriendDiscountCookie,
  resolveValidatedReferralFromBrowser,
} from '@/lib/resolveCatalogReferral';
import './catalog.css';

const BOOK_COVER_SRC = '/og/book-cover-og.jpg';

type DiscountState =
  | { active: false }
  | { active: true; code: string; namedReferral: boolean };

function PaperbackPrice({ priceCents, discount }: { priceCents: number; discount: DiscountState }) {
  if (!discount.active) {
    return <div className="catalog-price-hero">{formatPrice(priceCents)}</div>;
  }

  return (
    <div className="catalog-price-stack">
      <div className="catalog-price-list">{formatPrice(priceCents)}</div>
      <div className="catalog-price-discount">
        {formatSavings(priceCents)} Reader Discount
      </div>
      <div className="catalog-price-final">{formatPrice(discountedPriceCents(priceCents))}</div>
    </div>
  );
}

function SecondaryPrice({ priceCents, discount }: { priceCents: number; discount: DiscountState }) {
  if (!discount.active) {
    return <div className="catalog-price-secondary">{formatPrice(priceCents)}</div>;
  }

  return (
    <div className="catalog-price-secondary-stack">
      <div className="catalog-price-list">{formatPrice(priceCents)}</div>
      <div className="catalog-price-discount">
        {formatSavings(priceCents)} Reader Discount
      </div>
      <div className="catalog-price-final">{formatPrice(discountedPriceCents(priceCents))}</div>
    </div>
  );
}

export default function CatalogClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [discount, setDiscount] = useState<DiscountState>({ active: false });
  const [discountLoading, setDiscountLoading] = useState(true);

  const paperback = PRODUCTS.find((p) => p.id === 'paperback')!;
  const ebook = PRODUCTS.find((p) => p.id === 'ebook')!;
  const audio = PRODUCTS.find((p) => p.id === 'audio_preorder')!;

  const refQueryKey = searchParams.toString();

  useEffect(() => {
    let cancelled = false;

    async function resolveDiscount() {
      setDiscountLoading(true);
      try {
        const result = await resolveValidatedReferralFromBrowser(searchParams);
        if (!cancelled && result?.valid) {
          setDiscount({ active: true, code: result.code, namedReferral: true });
          return;
        }
        if (!cancelled && result?.serviceUnavailable && process.env.NODE_ENV === 'development') {
          console.warn('[catalog] Referral validation unavailable — is deepquill running on port 5055?');
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

  const trackingParams = useMemo(
    () => buildCatalogTrackingParams(searchParams),
    [searchParams],
  );

  const handleBuyClick = (product: ProductId) => {
    const params = new URLSearchParams(trackingParams);
    params.set('product', product);
    router.push(`/checkout?${params.toString()}`);
  };

  const buyPaperbackLabel = discount.active
    ? `Buy Direct — ${formatDiscountedPrice(paperback.priceCents)}`
    : `Buy Direct — ${paperback.displayPrice}`;

  const buyProductLabel = (product: (typeof PRODUCTS)[number]) => {
    if (!discount.active) {
      if (product.id === 'audio_preorder') return `Preorder Audio — ${product.displayPrice}`;
      if (product.id === 'ebook') return `Buy eBook — ${product.displayPrice}`;
      return `Buy ${product.title} — ${product.displayPrice}`;
    }
    const final = formatDiscountedPrice(product.priceCents);
    if (product.id === 'audio_preorder') return `Preorder Audio — ${final}`;
    if (product.id === 'ebook') return `Buy eBook — ${final}`;
    return `Buy ${product.title} — ${final}`;
  };

  return (
    <main className="catalog-shell">
      <div className="catalog-honeycomb" aria-hidden />
      <div className="catalog-content">
        <header className="catalog-hero">
          <p className="catalog-eyebrow">{CATALOG_HERO_EYEBROW}</p>
          <h1 className="catalog-headline">{CATALOG_HERO_HEADLINE}</h1>
          <p className="catalog-subline">{CATALOG_HERO_SUBLINE}</p>
          <p className="catalog-social">
            <span className="catalog-social-stars" aria-hidden>
              ★★★★★{' '}
            </span>
            {CATALOG_SOCIAL_PROOF}
          </p>
        </header>

        <div className="catalog-grid">
          {/* eBook — desktop left, mobile second */}
          <section className="catalog-card catalog-card--ebook" aria-labelledby="catalog-ebook-heading">
            <p className="catalog-card-label">eBook</p>
            <h2 id="catalog-ebook-heading" className="catalog-card-title">
              {ebook.title}
            </h2>
            <SecondaryPrice priceCents={ebook.priceCents} discount={discount} />
            <p className="catalog-tagline">{CATALOG_EBOOK_TAGLINE}</p>
            <button
              type="button"
              className="catalog-btn catalog-btn--soft"
              onClick={() => handleBuyClick('ebook')}
            >
              {buyProductLabel(ebook)}
            </button>
          </section>

          {/* Paperback — hero center desktop, first mobile */}
          <section
            className="catalog-card catalog-card--paperback"
            aria-labelledby="catalog-paperback-heading"
          >
            <div className="catalog-cover-wrap">
              <Image
                src={BOOK_COVER_SRC}
                alt="The Agnes Protocol — book cover"
                width={160}
                height={240}
                priority
                className="catalog-cover"
              />
            </div>

            <p className="catalog-card-label catalog-card-label--hero">{CATALOG_PAPERBACK_BADGE}</p>

            {discount.active && !discountLoading && (
              <div className="catalog-discount-badge">
                {discount.namedReferral
                  ? `Your reader discount is applied — Code: ${discount.code}`
                  : '15% reader discount applied'}
              </div>
            )}

            <h2 id="catalog-paperback-heading" className="catalog-card-title catalog-card-title--hero">
              {CATALOG_PAPERBACK_TITLE}
            </h2>

            <ul className="catalog-value-list">
              {CATALOG_PAPERBACK_VALUE_ITEMS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <PaperbackPrice priceCents={paperback.priceCents} discount={discount} />
            <p className="catalog-shipping-note">+ shipping at checkout</p>

            <button
              type="button"
              className="catalog-btn catalog-btn--primary"
              onClick={() => handleBuyClick('paperback')}
            >
              {buyPaperbackLabel}
            </button>

            {discount.active && discount.namedReferral && (
              <p className="catalog-referral-thanks">
                Your purchase supports the friend who recommended this book.
              </p>
            )}
          </section>

          {/* Audiobook preorder — desktop right, mobile third */}
          <section className="catalog-card catalog-card--audio" aria-labelledby="catalog-audio-heading">
            <p className="catalog-card-label">{CATALOG_AUDIO_LABEL}</p>
            <h2 id="catalog-audio-heading" className="catalog-card-title">
              Audiobook Preorder
            </h2>
            <SecondaryPrice priceCents={audio.priceCents} discount={discount} />
            <p className="catalog-tagline">{CATALOG_AUDIO_TAGLINE}</p>
            <button
              type="button"
              className="catalog-btn catalog-btn--secondary"
              onClick={() => handleBuyClick('audio_preorder')}
            >
              {buyProductLabel(audio)}
            </button>
          </section>
        </div>

        <p className="catalog-trust">{CATALOG_TRUST_NOTE}</p>
        <p className="catalog-footer-note">
          Secure checkout via Stripe · Instant eBook delivery by email · Paperback ships separately
        </p>
        <p className="catalog-footer-note" style={{ marginBottom: '2rem' }}>
          If you didn&apos;t receive an email, your purchase likely didn&apos;t complete. You can safely
          try again.
        </p>

        <SiteFooter variant="light" />
      </div>
    </main>
  );
}
