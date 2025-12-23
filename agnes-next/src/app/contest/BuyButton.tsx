'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export default function BuyButton() {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onClick() {
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
      onClick={onClick}
      className="px-4 py-2 rounded bg-green-500 text-black font-semibold"
    >
      Buy the Book — $26
    </button>
  );
}
