'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { trackFunnelEvent, type FunnelEventType } from '@/lib/funnelTracking';

type BuyBookButtonProps = {
  source?: string;
  funnelEventType?: FunnelEventType;
  successPath?: string;
  cancelPath?: string;
  onRequireContestEntry?: () => void;
  className?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
};

export function BuyBookButton({
  source = 'catalog',
  funnelEventType,
  successPath = '/checkout/success',
  cancelPath = '/catalog',
  onRequireContestEntry,
  className,
  children,
  style,
}: BuyBookButtonProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();

    if (funnelEventType) {
      trackFunnelEvent(funnelEventType, { buttonSource: source }, { source, searchParams });
    }
    
    // Preserve tracking params
    const params = new URLSearchParams();
    const keysToPreserve = ['ref', 'src', 'v', 'origin', 'code', 'utm_source', 'utm_medium', 'utm_campaign'];
    
    keysToPreserve.forEach(key => {
      const value = searchParams.get(key);
      if (value) {
        params.set(key, value);
      }
    });
    
    // Route to catalog
    router.push(`/catalog${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={className}
      style={style}
    >
      {children || 'Buy the Book'}
    </button>
  );
}

