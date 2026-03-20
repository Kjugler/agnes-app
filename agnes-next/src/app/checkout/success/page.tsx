'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function CheckoutSuccessClient() {
  const router = useRouter();
  const qp = useSearchParams();

  useEffect(() => {
    const sid = qp.get('session_id') || '';
    router.replace(`/contest/thank-you${sid ? `?session_id=${encodeURIComponent(sid)}` : ''}`);
  }, [router, qp]);

  return <p style={{padding:16}}>Finishing up your order…</p>;
}

export default function CheckoutSuccessRedirect() {
  return (
    <Suspense fallback={<p style={{padding:16}}>Loading…</p>}>
      <CheckoutSuccessClient />
    </Suspense>
  );
}
