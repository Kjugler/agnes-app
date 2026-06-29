import Link from 'next/link';
import ReadersAdminClient from './ReadersAdminClient';

export default function ReadersAdminPage() {
  return (
    <div
      style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '24px 16px 48px',
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        color: '#0f172a',
      }}
    >
      <p style={{ margin: '0 0 12px 0' }}>
        <Link href="/admin" style={{ color: '#2563eb', fontSize: 14 }}>
          ← Admin home
        </Link>
      </p>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px 0' }}>Reader Manager</h1>
      <p style={{ margin: '0 0 20px 0', fontSize: 14, color: '#64748b', maxWidth: 640 }}>
        Track readers from bookstores, gifts, events, ads, and referrals. Requires fulfillment login.
      </p>
      <ReadersAdminClient />
    </div>
  );
}
