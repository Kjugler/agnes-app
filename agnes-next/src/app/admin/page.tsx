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

const descStyle: CSSProperties = {
  margin: '4px 0 16px 0',
  fontSize: 13,
  color: '#64748b',
  lineHeight: 1.4,
};

const sectionTitle: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  margin: '24px 0 12px 0',
  color: '#0f172a',
};

export default function AdminHubPage() {
  return (
    <div
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '32px 20px 48px',
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        color: '#0f172a',
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px 0' }}>DeepQuill Admin Console</h1>
      <p style={{ margin: '0 0 24px 0', fontSize: 14, color: '#b45309', fontWeight: 500 }}>
        Internal Use Only
      </p>

      <h2 style={sectionTitle}>Sales &amp; diagnostics</h2>
      <Link href="/admin/sales" style={linkStyle}>
        Sales Ledger
      </Link>
      <p style={descStyle}>
        View recent sales, product type, live vs beta status, fulfillment status, and points/shipping
        eligibility.
      </p>

      <h2 style={sectionTitle}>Fulfillment</h2>
      <Link href="/admin/fulfillment/labels" style={linkStyle}>
        Print labels
      </Link>
      <p style={descStyle}>Claim orders and print shipping labels.</p>
      <Link href="/admin/fulfillment/ship" style={linkStyle}>
        Ship
      </Link>
      <p style={descStyle}>Mark printed orders as shipped.</p>

      <h2 style={sectionTitle}>Contest / Users</h2>
      <Link href="/admin/contest" style={linkStyle}>
        Contest admin
      </Link>
      <p style={descStyle}>Daily summary, contest users, and related tools.</p>
      <Link href="/admin/contest/live" style={linkStyle}>
        Live contest stats
      </Link>
      <p style={descStyle}>Rock-concert metrics (books claimed, leader snapshot).</p>

      <h2 style={sectionTitle}>Operations</h2>
      <Link href="/admin/ops/archive-beta-sales-once" style={linkStyle}>
        Beta archive (TEMPORARY)
      </Link>
      <p style={descStyle}>
        One-time beta purchase archive. API:{' '}
        <code style={{ fontSize: 12 }}>POST /api/admin/ops/archive-beta-sales-once</code>
      </p>
      <Link href="/signal-room/admin" style={linkStyle}>
        Signal Room admin
      </Link>
      <p style={descStyle}>Moderation and Signal Room operations.</p>

      <h2 style={sectionTitle}>System</h2>
      <Link href="/admin/fulfillment/auth" style={linkStyle}>
        Fulfillment auth
      </Link>
      <p style={{ ...descStyle, marginBottom: 0 }}>Save fulfillment token for label/ship tools.</p>
    </div>
  );
}
