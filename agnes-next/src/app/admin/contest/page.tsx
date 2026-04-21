import type { CSSProperties } from 'react';
import Link from 'next/link';

const linkStyle: CSSProperties = {
  display: 'inline-block',
  padding: '8px 14px',
  border: '1px solid #ccc',
  borderRadius: 6,
  background: '#f8fafc',
  color: '#0f172a',
  textDecoration: 'none',
  fontSize: 14,
};

const descStyle: React.CSSProperties = {
  margin: '4px 0 16px 0',
  fontSize: 13,
  color: '#64748b',
  lineHeight: 1.4,
};

export default function ContestAdminIndexPage() {
  return (
    <div
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '32px 20px 48px',
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
      }}
    >
      <p style={{ margin: '0 0 16px 0' }}>
        <Link href="/admin" style={{ color: '#2563eb', fontSize: 14 }}>
          ← Admin home
        </Link>
      </p>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px 0' }}>Contest admin</h1>
      <p style={{ margin: '0 0 20px 0', fontSize: 14, color: '#64748b' }}>Internal tools for contest ops.</p>

      <Link href="/admin/contest/daily-summary" style={linkStyle}>
        Daily summary
      </Link>
      <p style={descStyle}>Job status, regenerate day, edit display overrides.</p>

      <Link href="/admin/contest/contest-users" style={linkStyle}>
        Contest users
      </Link>
      <p style={descStyle}>Analytics-style roster and search (proxied from DeepQuill).</p>

      <Link href="/admin/contest/live" style={linkStyle}>
        Live stats
      </Link>
      <p style={{ ...descStyle, marginBottom: 0 }}>Current live-stats JSON for the hub display.</p>
    </div>
  );
}
