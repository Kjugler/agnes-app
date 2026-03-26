'use client';

import React, { useState, useEffect } from 'react';

type PaymentRecord = {
  id: string;
  amountCents: number;
  paidAt: string;
  note: string | null;
};

type HelperSummary = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  shippedCount: number;
  earnedCents: number;
  paidCents: number;
  balanceCents: number;
  recentPayments?: PaymentRecord[];
};

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function FulfillmentHelpersPage() {
  const [helpers, setHelpers] = useState<HelperSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [paymentHelperId, setPaymentHelperId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [expandedHelperId, setExpandedHelperId] = useState<string | null>(null);
  const [toggleLoadingId, setToggleLoadingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const loadHelpers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/fulfillment/users');
      if (!res.ok) throw new Error('Failed to load helpers');
      const data = await res.json();
      setHelpers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load helpers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHelpers();
  }, []);

  const handleAddHelper = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim() || !addEmail.trim()) return;
    setAddSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/fulfillment/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName.trim(), email: addEmail.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add helper');
      }
      setAddName('');
      setAddEmail('');
      await loadHelpers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add helper');
    } finally {
      setAddSubmitting(false);
    }
  };

  const handleToggleActive = async (helper: HelperSummary) => {
    setError(null);
    setToggleLoadingId(helper.id);
    try {
      const res = await fetch(`/api/fulfillment/user/${helper.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !helper.active }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update');
      }
      await loadHelpers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setToggleLoadingId(null);
    }
  };

  const filteredHelpers = helpers.filter((h) => {
    if (statusFilter === 'active') return h.active;
    if (statusFilter === 'inactive') return !h.active;
    return true;
  });

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentHelperId || !paymentAmount.trim()) return;
    const amount = parseFloat(paymentAmount.trim());
    if (isNaN(amount) || amount <= 0) {
      setError('Enter a valid amount');
      return;
    }
    const amountCents = Math.round(amount * 100);
    setPaymentSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/fulfillment/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fulfillmentUserId: paymentHelperId,
          amountCents,
          note: paymentNote.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to record payment');
      }
      setPaymentHelperId(null);
      setPaymentAmount('');
      setPaymentNote('');
      await loadHelpers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setPaymentSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ marginBottom: '16px' }}>
        <a href="/admin/fulfillment/labels" style={{ marginRight: '16px' }}>Labels</a>
        <a href="/admin/fulfillment/ship" style={{ marginRight: '16px' }}>Ship</a>
        <span style={{ marginRight: '16px', fontWeight: 600 }}>Helpers</span>
      </div>
      <h1 style={{ marginBottom: '24px' }}>Fulfillment Helpers</h1>

      {error && (
        <div
          style={{
            padding: '12px',
            background: '#fee',
            border: '1px solid #fcc',
            borderRadius: '8px',
            marginBottom: '24px',
            color: '#c00',
          }}
        >
          {error}
        </div>
      )}

      {/* Add Helper Form */}
      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '24px',
          background: '#f9f9f9',
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: '16px', fontSize: '18px' }}>Add Helper</h2>
        <form onSubmit={handleAddHelper} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Name</label>
            <input
              type="text"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="Helper name"
              style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '160px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Email</label>
            <input
              type="email"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              placeholder="helper@example.com"
              style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '200px' }}
            />
          </div>
          <button
            type="submit"
            disabled={addSubmitting || !addName.trim() || !addEmail.trim()}
            style={{
              padding: '8px 20px',
              background: '#0070f3',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: addSubmitting ? 'not-allowed' : 'pointer',
            }}
          >
            {addSubmitting ? 'Adding...' : 'Add Helper'}
          </button>
        </form>
      </div>

      {/* Record Payment */}
      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '24px',
          background: '#f0f9ff',
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: '16px', fontSize: '18px' }}>Record Payment</h2>
        <form onSubmit={handleRecordPayment} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Helper</label>
            <select
              value={paymentHelperId || ''}
              onChange={(e) => setPaymentHelperId(e.target.value || null)}
              style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '200px' }}
            >
              <option value="">Select helper</option>
              {helpers.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} {h.balanceCents > 0 ? `(balance: ${formatDollars(h.balanceCents)})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Amount ($)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              placeholder="0.00"
              style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc', width: '100px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Note (optional)</label>
            <input
              type="text"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              placeholder="e.g. Venmo 3/21"
              style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '120px' }}
            />
          </div>
          <button
            type="submit"
            disabled={paymentSubmitting || !paymentHelperId || !paymentAmount.trim()}
            style={{
              padding: '8px 20px',
              background: '#059669',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: paymentSubmitting ? 'not-allowed' : 'pointer',
            }}
          >
            {paymentSubmitting ? 'Recording...' : 'Record Payment'}
          </button>
        </form>
      </div>

      {/* Helpers Table */}
      <div style={{ border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#f5f5f5', flexWrap: 'wrap', gap: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Helpers & Earnings</h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', color: '#666' }}>Show:</span>
            {(['all', 'active', 'inactive'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                style={{
                  padding: '6px 12px',
                  fontSize: '13px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  background: statusFilter === f ? '#0070f3' : '#fff',
                  color: statusFilter === f ? '#fff' : '#333',
                  cursor: 'pointer',
                }}
              >
                {f === 'all' ? 'All' : f === 'active' ? 'Active only' : 'Inactive only'}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <p style={{ padding: '24px' }}>Loading...</p>
        ) : helpers.length === 0 ? (
          <p style={{ padding: '24px', color: '#666' }}>No helpers yet. Add one above.</p>
        ) : filteredHelpers.length === 0 ? (
          <p style={{ padding: '24px', color: '#666' }}>No helpers match this filter.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9f9f9' }}>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Name</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Email</th>
                  <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>Shipped</th>
                  <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>Earned</th>
                  <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>Paid</th>
                  <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>Balance</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Payments</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredHelpers.map((h) => (
                  <React.Fragment key={h.id}>
                    <tr style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '12px' }}>{h.name}</td>
                      <td style={{ padding: '12px' }}>{h.email}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            background: h.active ? '#d1fae5' : '#fee2e2',
                            color: h.active ? '#065f46' : '#991b1b',
                          }}
                        >
                          {h.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>{h.shippedCount}</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>{formatDollars(h.earnedCents)}</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>{formatDollars(h.paidCents)}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: h.balanceCents > 0 ? 600 : 400 }}>
                        {formatDollars(h.balanceCents)}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {(h.recentPayments?.length ?? 0) > 0 ? (
                          <button
                            type="button"
                            onClick={() => setExpandedHelperId((prev) => (prev === h.id ? null : h.id))}
                            style={{
                              padding: '4px 8px',
                              fontSize: '12px',
                              border: '1px solid #ccc',
                              borderRadius: '4px',
                              background: '#fff',
                              cursor: 'pointer',
                            }}
                          >
                            {expandedHelperId === h.id ? 'Hide' : 'View'} ({h.recentPayments?.length ?? 0})
                          </button>
                        ) : (
                          <span style={{ color: '#999', fontSize: '13px' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(h)}
                          disabled={toggleLoadingId === h.id}
                          style={{
                            padding: '6px 12px',
                            fontSize: '13px',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            background: toggleLoadingId === h.id ? '#eee' : '#fff',
                            cursor: toggleLoadingId === h.id ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {toggleLoadingId === h.id
                            ? h.active
                              ? 'Deactivating...'
                              : 'Activating...'
                            : h.active
                              ? 'Deactivate'
                              : 'Activate'}
                        </button>
                      </td>
                    </tr>
                    {expandedHelperId === h.id && (h.recentPayments?.length ?? 0) > 0 && (
                      <tr key={`${h.id}-payments`} style={{ background: '#fafafa' }}>
                        <td colSpan={9} style={{ padding: '12px 12px 12px 48px', borderBottom: '1px solid #eee' }}>
                          <div style={{ fontSize: '14px', marginBottom: '8px' }}>Recent payments</div>
                          <table style={{ width: 'auto', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                              <tr style={{ color: '#666' }}>
                                <th style={{ padding: '4px 12px 4px 0', textAlign: 'left' }}>Date</th>
                                <th style={{ padding: '4px 12px', textAlign: 'right' }}>Amount</th>
                                <th style={{ padding: '4px 12px', textAlign: 'left' }}>Note</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(h.recentPayments ?? []).map((p) => (
                                <tr key={p.id}>
                                  <td style={{ padding: '4px 12px 4px 0' }}>
                                    {new Date(p.paidAt).toLocaleDateString()}
                                  </td>
                                  <td style={{ padding: '4px 12px', textAlign: 'right' }}>
                                    {formatDollars(p.amountCents)}
                                  </td>
                                  <td style={{ padding: '4px 12px', color: '#666' }}>{p.note || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ marginTop: '16px', fontSize: '14px', color: '#666' }}>
        Earnings: $2.00 per book shipped. Balance = Earned − Paid.
      </p>
    </div>
  );
}
