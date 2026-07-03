import Link from 'next/link';
import { Suspense } from 'react';
import ReaderDetailClient from './ReaderDetailClient';

export default async function ReaderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div
      style={{
        maxWidth: 800,
        margin: '0 auto',
        padding: '24px 16px 48px',
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        color: '#0f172a',
      }}
    >
      <p style={{ margin: '0 0 12px 0' }}>
        <Link href="/admin/readers" style={{ color: '#2563eb', fontSize: 14 }}>
          ← Reader Manager
        </Link>
      </p>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 20px 0' }}>Reader Detail</h1>
      <Suspense fallback={<p style={{ color: '#64748b', fontSize: 14 }}>Loading reader…</p>}>
        <ReaderDetailClient readerId={id} />
      </Suspense>
    </div>
  );
}
