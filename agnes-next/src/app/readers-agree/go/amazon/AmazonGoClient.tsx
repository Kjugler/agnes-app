'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import ReviewRedirectClient from '../ReviewRedirectClient';
import { buildAmazonProductUrl } from '@/lib/amazonAttribution';

export default function AmazonGoClient() {
  const searchParams = useSearchParams();
  const destinationUrl = useMemo(
    () => buildAmazonProductUrl({ searchParams }),
    [searchParams],
  );

  return (
      <ReviewRedirectClient
        heading="Opening Amazon…"
        destinationUrl={destinationUrl}
        retailerLabel="Amazon"
        retailerOrigin="amazon"
      />
  );
}
