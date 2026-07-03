import Link from 'next/link';
import ReaderDetailClient from './ReaderDetailClient';

export default async function ReaderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const initialEdit = sp.edit === '1';

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
      <ReaderDetailClient key={id} readerId={id} initialEdit={initialEdit} />
    </div>
  );
}
