'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function CheckoutSuccessRedirect() {
  const router = useRouter();
  const qp = useSearchParams();

  useEffect(() => {
    const sid = qp.get('session_id') || '';
    router.replace(`/contest/thank-you${sid ? `?session_id=${encodeURIComponent(sid)}` : ''}`);
  }, [router, qp]);

  return <p style={{padding:16}}>Finishing up your order…</p>;
}
