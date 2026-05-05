'use client';

import { useEffect } from 'react';
import ChapterReaderClient from '@/app/sample-chapters/read/[id]/ChapterReaderClient';

const REF_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export default function Chapter9ReadPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = (params.get('ref') || '').trim();
    if (!ref || ref === '...') return;
    const encoded = encodeURIComponent(ref);
    document.cookie = `ref=${encoded}; path=/; max-age=${REF_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
    document.cookie = `ap_ref=${encoded}; path=/; max-age=${REF_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
  }, []);

  return <ChapterReaderClient chapterId="9" />;
}
