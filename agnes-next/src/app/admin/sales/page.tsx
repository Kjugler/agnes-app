'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type LedgerRow = {
  orderDate: string;
  buyerName: string;
  buyerEmail: string;
  productTypeLabel: string;
  productType: string;
  amount: string;
  saleStatus: string;
  shippingStatusLabel: string;
  shippingStatusKey: string;
  countsForPointsLabel: string;
  countsForShippingLabel: string;
  sessionId: string;
  orderId: string | null;
  purchaseId: string;
  userId?: string;
};

type LedgerResponse = {
  ok: boolean;
  rows?: LedgerRow[];
  meta?: { rowCount?: number; totalInRange?: number; capped?: boolean; maxRows?: number; fulfillmentDbSplit?: string };
  range?: { start: string; end: string };
  error?: string;
};

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function defaultRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { start: ymd(start), end: ymd(end) };
}

export default function SalesLedgerPage() {
  const initial = defaultRange();
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [product, setProduct] = useState('all');
  const [saleStatus, setSaleStatus] = useState('all');
  const [shipping, setShipping] = useState('all');
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const s = start;
    const e = end;
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams({
        start: s,
        end: e,
        product,
        saleStatus,
        shipping,
      });
      const res = await fetch(`/api/admin/sales-ledger?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const json = (await res.json()) as LedgerResponse;
      if (!res.ok) {
        setErr(json.error || `HTTP ${res.status}`);
        setData(null);
        return;
      }
      setData(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [start, end, product, saleStatus, shipping]);

  const runResend = useCallback(
    async (kind: 'confirmation' | 'ebook' | 'claim', purchaseId: string, userId: string) => {
      setActionNote(null);
      let path: string;
      if (kind === 'confirmation') {
        path = `/api/admin/purchases/${encodeURIComponent(purchaseId)}/resend-confirmation`;
      } else if (kind === 'ebook') {
        path = `/api/admin/purchases/${encodeURIComponent(purchaseId)}/resend-ebook-link`;
      } else {
        path = `/api/admin/users/${encodeURIComponent(userId)}/send-claim-profile-email`;
      }
      try {
        const res = await fetch(path, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string; deliveryStatus?: string; rejectReason?: string | null };
        if (!res.ok || !json.ok) {
          const detail =
            json.rejectReason && json.deliveryStatus === 'rejected'
              ? `Provider rejected: ${json.rejectReason}`
              : json.error || json.deliveryStatus || `HTTP ${res.status}`;
          setActionNote(`Failed (${kind}): ${detail}`);
          return;
        }
        setActionNote(`Sent (${kind}) · ${json.deliveryStatus || 'ok'}`);
      } catch (e) {
        setActionNote(`Failed (${kind}): ${e instanceof Error ? e.message : 'request error'}`);
      }
    },
    []
  );

  useEffect(() => {
    if (!start || !end) return;
    load();
  }, [start, end, product, saleStatus, shipping, load]);

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
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px 0' }}>Sales Ledger</h1>
      <p style={{ margin: '0 0 20px 0', fontSize: 14, color: '#64748b', maxWidth: 640 }}>
        View recent sales, product type, live vs beta status, fulfillment status, and points/shipping eligibility
        (DeepQuill Purchase + Order, same sources as fulfillment and contest rules).
      </p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'flex-end',
          marginBottom: 20,
          padding: 16,
          background: '#f8fafc',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, gap: 4 }}>
          Start date
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            style={{ padding: 6, fontSize: 14 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, gap: 4 }}>
          End date
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            style={{ padding: 6, fontSize: 14 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, gap: 4 }}>
          Product
          <select
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            style={{ padding: 6, fontSize: 14, minWidth: 120 }}
          >
            <option value="all">All</option>
            <option value="paperback">Paperback</option>
            <option value="ebook">eBook</option>
            <option value="audio_preorder">Audio preorder</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, gap: 4 }}>
          Sale status
          <select
            value={saleStatus}
            onChange={(e) => setSaleStatus(e.target.value)}
            style={{ padding: 6, fontSize: 14, minWidth: 120 }}
          >
            <option value="all">All</option>
            <option value="live">Live</option>
            <option value="archived_beta">Archived beta</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, gap: 4 }}>
          Shipping status
          <select
            value={shipping}
            onChange={(e) => setShipping(e.target.value)}
            style={{ padding: 6, fontSize: 14, minWidth: 130 }}
          >
            <option value="all">All</option>
            <option value="na">N/A</option>
            <option value="open">Open</option>
            <option value="label_printed">Label printed</option>
            <option value="shipped">Shipped</option>
            <option value="archived_beta">Archived beta</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => load()}
          style={{ padding: '8px 14px', fontSize: 14, cursor: 'pointer' }}
        >
          Refresh
        </button>
      </div>

      {err && (
        <p style={{ color: '#b91c1c', fontSize: 14, marginBottom: 12 }} role="alert">
          {err} (Set fulfillment token via Fulfillment auth if 401.)
        </p>
      )}
      {actionNote && (
        <p style={{ fontSize: 14, marginBottom: 12, color: actionNote.startsWith('Failed') ? '#b91c1c' : '#15803d' }}>
          {actionNote}
        </p>
      )}
      {loading && <p style={{ fontSize: 14, color: '#64748b' }}>Loading…</p>}

      {data?.ok && data.meta && (
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
          {data.meta.rowCount ?? 0} row(s) shown
          {data.range ? ` · ${data.range.start.slice(0, 10)} → ${data.range.end.slice(0, 10)}` : ''}
          {data.meta.capped ? ` · (hit cap ${data.meta.maxRows}, narrow date range)` : ''}
          {data.meta.fulfillmentDbSplit === 'separate' ? ' · Orders: separate fulfillment DB' : ''}
        </p>
      )}

      {data?.ok && data.rows && (
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
            }}
          >
            <thead>
              <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                <th style={th}>Order date</th>
                <th style={th}>Buyer</th>
                <th style={th}>Email</th>
                <th style={th}>Product</th>
                <th style={th}>Amount</th>
                <th style={th}>Sale status</th>
                <th style={th}>Shipping</th>
                <th style={th}>Points</th>
                <th style={th}>Ship</th>
                <th style={th}>Session / order id</th>
                <th style={th}>Resend</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.purchaseId} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={td}>{r.orderDate?.replace('T', ' ').slice(0, 19)} UTC</td>
                  <td style={td}>{r.buyerName}</td>
                  <td style={td}>{r.buyerEmail}</td>
                  <td style={td}>{r.productTypeLabel}</td>
                  <td style={td}>{r.amount}</td>
                  <td style={td}>{r.saleStatus}</td>
                  <td style={td}>{r.shippingStatusLabel}</td>
                  <td style={td}>{r.countsForPointsLabel}</td>
                  <td style={td}>{r.countsForShippingLabel}</td>
                  <td style={{ ...td, fontSize: 11, wordBreak: 'break-all', maxWidth: 220 }}>
                    {r.sessionId}
                    {r.orderId ? (
                      <>
                        <br />
                        <span style={{ color: '#64748b' }}>order: {r.orderId}</span>
                      </>
                    ) : null}
                  </td>
                  <td style={{ ...td, minWidth: 140 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => runResend('confirmation', r.purchaseId, r.userId || '')}
                        style={btn}
                      >
                        Confirmation
                      </button>
                      {r.productType === 'ebook' || r.productType === 'paperback' ? (
                        <button
                          type="button"
                          onClick={() => runResend('ebook', r.purchaseId, r.userId || '')}
                          style={btn}
                        >
                          eBook link
                        </button>
                      ) : null}
                      {r.userId ? (
                        <button
                          type="button"
                          onClick={() => runResend('claim', r.purchaseId, r.userId as string)}
                          style={btn}
                        >
                          Claim email
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: 28, fontSize: 13, color: '#64748b', lineHeight: 1.5, maxWidth: 720 }}>
        <strong>Helper-only routes (not implemented):</strong> to limit helpers to label/ship only, you would add
        a separate auth role (e.g. helper JWT or cookie), middleware that allows only{' '}
        <code style={{ fontSize: 12 }}>/fulfillment/helpers</code>, <code style={{ fontSize: 12 }}>…/labels</code>,{' '}
        <code style={{ fontSize: 12 }}>…/ship</code>, and route groups under e.g.{' '}
        <code style={{ fontSize: 12 }}>/app/fulfillment/(helpers)/...</code> without linking to <code style={{ fontSize: 12 }}>/admin</code>.{' '}
        Current fulfillment pages reuse the same token as admin proxy calls.
      </p>
    </div>
  );
}

const th: CSSProperties = { padding: '8px 10px', fontWeight: 600, color: '#334155' };
const td: CSSProperties = { padding: '8px 10px', verticalAlign: 'top' };
const btn: CSSProperties = {
  padding: '4px 8px',
  fontSize: 12,
  cursor: 'pointer',
  textAlign: 'left' as const,
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  background: '#fff',
};
