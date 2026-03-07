import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import EntryClient from './EntryClient';

// ✅ B) Backwards compatibility: /entry redirects to /start preserving query params
export default function EntryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // In Next.js 15+, searchParams is a Promise
  // For backwards compatibility redirect, we need to handle this server-side
  // But since this is a client component wrapper, we'll handle redirect in EntryClient
  // However, middleware can also handle this redirect more efficiently
  
  return (
    <Suspense fallback={null}>
      <EntryClient />
    </Suspense>
  );
}
