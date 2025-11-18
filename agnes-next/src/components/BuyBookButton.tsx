'use client';

import { useState } from 'react';
import { readContestEmail } from '@/lib/identity';
import { startCheckout } from '@/lib/checkout';

type BuyBookButtonProps = {
  source?: string; // goes into Stripe metadata.source
  successPath?: string;
  cancelPath?: string;
  onRequireContestEntry?: () => void; // Callback when contest entry is required
  className?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
};

const defaultRequireContestEntry = () => {};

export function BuyBookButton({
  source = 'contest',
  successPath = '/contest/thank-you',
  cancelPath = '/contest',
  onRequireContestEntry = defaultRequireContestEntry,
  className,
  children,
  style,
}: BuyBookButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    
    if (loading) return; // Prevent double-clicks

    try {
      setLoading(true);

      const email = readContestEmail();
      if (!email) {
        alert('Before buying the book, please enter the contest so we know who to credit your points and rewards to.');
        onRequireContestEntry(); // Ask parent page to show the ContestEntryForm
        setLoading(false);
        return;
      }

      // Use the shared startCheckout function
      const path = typeof window !== 'undefined' ? window.location.pathname : '/contest';
      await startCheckout({
        qty: 1,
        source,
        path,
        successPath,
        cancelPath,
      });
    } catch (err: any) {
      setLoading(false);
      alert(err?.message || 'Could not start checkout.');
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={className}
      style={style}
    >
      {loading ? 'Loading...' : (children || 'Buy the Book')}
    </button>
  );
}

