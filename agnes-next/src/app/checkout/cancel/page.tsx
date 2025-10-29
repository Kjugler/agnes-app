'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CheckoutCancelRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/contest'); }, [router]);
  return <p style={{padding:16}}>Taking you back…</p>;
}
