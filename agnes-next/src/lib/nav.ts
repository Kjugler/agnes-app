'use client';

import { useRouter } from 'next/navigation';

export function useSafeBack(fallback: string = '/contest') {
  const router = useRouter();

  return () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallback);
    }
  };
}
