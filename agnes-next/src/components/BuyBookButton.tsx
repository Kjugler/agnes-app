'use client';

import { useRouter, useSearchParams } from 'next/navigation';

type BuyBookButtonProps = {
  source?: string; // preserved for compatibility but not used
  successPath?: string; // preserved for compatibility but not used
  cancelPath?: string; // preserved for compatibility but not used
  onRequireContestEntry?: () => void; // preserved for compatibility but not used
  className?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
};

export function BuyBookButton({
  source = 'contest',
  successPath = '/contest/thank-you',
  cancelPath = '/contest',
  onRequireContestEntry,
  className,
  children,
  style,
}: BuyBookButtonProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    
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

