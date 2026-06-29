import Link from 'next/link';
import { Suspense } from 'react';
import TextAFriendLandingClient from './TextAFriendLandingClient';

export default function TextAFriendPage() {
  return (
    <div
      style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '32px 16px 48px',
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        color: '#0f172a',
      }}
    >
      <p style={{ margin: '0 0 12px 0' }}>
        <Link href="/contest/score" style={{ color: '#2563eb', fontSize: 14 }}>
          ← Reader Sharing Tools
        </Link>
      </p>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px 0' }}>Text a Friend</h1>
      <p style={{ fontSize: 15, color: '#64748b', margin: '0 0 24px 0', lineHeight: 1.5 }}>
        Recommend the book to someone you know — we&apos;ll open your text message with everything
        ready to send.
      </p>
      <Suspense fallback={<p style={{ fontSize: 14, color: '#64748b' }}>Loading…</p>}>
        <TextAFriendLandingClient />
      </Suspense>
    </div>
  );
}
