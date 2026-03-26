'use client';

import { useState, useEffect } from 'react';

type FulfillmentUser = {
  id: string;
  name: string;
  email: string;
};

type Order = {
  id: string;
  createdAt: string;
  shippingName: string | null;
  shippingAddressLine1: string | null;
  shippingAddressLine2: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingPostalCode: string | null;
  shippingCountry: string | null;
  shippingPhone: string | null;
};

export default function PrintLabelsPage() {
  const [user, setUser] = useState<FulfillmentUser | null>(null);
  const [helperOptions, setHelperOptions] = useState<FulfillmentUser[]>([]);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load active helpers from API
  const loadHelpers = async () => {
    try {
      const res = await fetch('/api/fulfillment/users?activeOnly=true');
      if (res.ok) {
        const data = await res.json();
        setHelperOptions(Array.isArray(data) ? data : []);
      }
    } catch {
      setHelperOptions([]);
    }
  };

  const selectHelper = (helper: FulfillmentUser) => {
    setUser(helper);
    localStorage.setItem('fulfillmentUserId', helper.id);
    localStorage.setItem('fulfillmentUserName', helper.name);
  };

  // Load next FIFO order (atomically claims reservation for current user)
  const loadNextOrder = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/fulfillment/next-for-label?fulfillmentUserId=${encodeURIComponent(user.id)}`);
      if (!response.ok) {
        throw new Error('Failed to load next order');
      }

      const data = await response.json();
      setCurrentOrder(data.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load order');
    } finally {
      setLoading(false);
    }
  };

  // Print label and assign to current user
  const handlePrintLabel = async () => {
    if (!user || !currentOrder) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/fulfillment/print-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: currentOrder.id,
          fulfillmentUserId: user.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to print label');
      }

      const data = await response.json();

      // Open label in new window for printing
      const labelWindow = window.open('', '_blank');
      if (labelWindow) {
        labelWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Shipping Label - Order ${data.order.id}</title>
              <style>
                body {
                  font-family: Arial, sans-serif;
                  padding: 20px;
                  max-width: 4in;
                }
                .label {
                  border: 2px solid #000;
                  padding: 15px;
                  margin-bottom: 20px;
                }
                .name {
                  font-weight: bold;
                  font-size: 16px;
                  margin-bottom: 10px;
                }
                .address {
                  line-height: 1.6;
                  font-size: 14px;
                }
                @media print {
                  body { margin: 0; padding: 10px; }
                  .label { page-break-after: always; }
                }
              </style>
            </head>
            <body>
              <div class="label">
                <div class="name">${data.order.shippingName}</div>
                <div class="address">
                  ${data.order.addressLine1}<br>
                  ${data.order.addressLine2 ? data.order.addressLine2 + '<br>' : ''}
                  ${data.order.city ? data.order.city + ', ' : ''}${data.order.state || ''} ${data.order.postalCode || ''}<br>
                  ${data.order.country || ''}
                </div>
              </div>
            </body>
          </html>
        `);
        labelWindow.document.close();
        setTimeout(() => {
          labelWindow.print();
        }, 250);
      }

      // Reload next order
      await loadNextOrder();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to print label');
    } finally {
      setLoading(false);
    }
  };

  // Skip current order: release reservation, then fetch next
  const handleSkip = async () => {
    if (!user || !currentOrder) {
      await loadNextOrder();
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/fulfillment/release-reservation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: currentOrder.id,
          fulfillmentUserId: user.id,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to release reservation');
      }
      await loadNextOrder();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to skip order');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHelpers();
  }, []);

  // Restore user from localStorage when helpers load
  useEffect(() => {
    if (helperOptions.length === 0) return;
    const savedUserId = localStorage.getItem('fulfillmentUserId');
    if (savedUserId) {
      const helper = helperOptions.find((h) => h.id === savedUserId);
      if (helper) {
        setUser(helper);
      }
    }
  }, [helperOptions]);

  // Load next order when user is set
  useEffect(() => {
    if (user) {
      loadNextOrder();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '16px' }}>
        <a href="/admin/fulfillment/labels" style={{ marginRight: '16px', fontWeight: 600 }}>Labels</a>
        <a href="/admin/fulfillment/ship" style={{ marginRight: '16px' }}>Ship</a>
        <a href="/admin/fulfillment/helpers">Helpers</a>
      </div>
      <h1 style={{ marginBottom: '24px' }}>Print Labels</h1>

      {/* Helper Selection */}
      {!user ? (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ marginBottom: '12px', fontSize: '18px' }}>
            Select Helper
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {helperOptions.length === 0 && !loading ? (
              <p style={{ color: '#666' }}>No active helpers. Add helpers in Admin → Fulfillment Helpers.</p>
            ) : null}
            {helperOptions.map((helper) => (
              <button
                key={helper.id}
                onClick={() => selectHelper(helper)}
                disabled={loading}
                style={{
                  padding: '12px 16px',
                  border: '1px solid #ccc',
                  borderRadius: '8px',
                  background: '#fff',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                }}
              >
                {helper.name} ({helper.email})
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: '24px' }}>
          <p>
            <strong>Helper:</strong> {user.name} ({user.email})
          </p>
          <button
            onClick={() => {
              setUser(null);
              localStorage.removeItem('fulfillmentUserId');
              localStorage.removeItem('fulfillmentUserName');
            }}
            style={{
              marginTop: '8px',
              padding: '6px 12px',
              fontSize: '14px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              background: '#f5f5f5',
              cursor: 'pointer',
            }}
          >
            Change Helper
          </button>
        </div>
      )}

      {/* Error Message */}
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

      {/* Current Order */}
      {user && (
        <div>
          {loading && !currentOrder ? (
            <p>Loading next order...</p>
          ) : currentOrder ? (
            <div
              style={{
                border: '1px solid #ccc',
                borderRadius: '8px',
                padding: '20px',
                background: '#f9f9f9',
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: '16px' }}>
                Next Order to Print
              </h2>

              <div style={{ marginBottom: '16px' }}>
                <p>
                  <strong>Order placed:</strong>{' '}
                  {new Date(currentOrder.createdAt).toLocaleDateString()}
                </p>
                <p>
                  <strong>Status:</strong> Pending
                </p>
              </div>

              <div
                style={{
                  background: '#fff',
                  padding: '16px',
                  borderRadius: '4px',
                  marginBottom: '16px',
                  border: '1px solid #ddd',
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                  {currentOrder.shippingName || 'N/A'}
                </div>
                <div style={{ lineHeight: '1.6' }}>
                  {currentOrder.shippingAddressLine1}
                  {currentOrder.shippingAddressLine2 && (
                    <>
                      <br />
                      {currentOrder.shippingAddressLine2}
                    </>
                  )}
                  <br />
                  {currentOrder.shippingCity && (
                    <>
                      {currentOrder.shippingCity}
                      {currentOrder.shippingState && `, ${currentOrder.shippingState}`}
                      {' '}
                    </>
                  )}
                  {currentOrder.shippingPostalCode}
                  {currentOrder.shippingCountry && (
                    <>
                      <br />
                      {currentOrder.shippingCountry}
                    </>
                  )}
                  {currentOrder.shippingPhone && (
                    <>
                      <br />
                      <br />
                      Phone: {currentOrder.shippingPhone}
                    </>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={handlePrintLabel}
                  disabled={loading}
                  style={{
                    padding: '12px 24px',
                    background: '#0070f3',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: '16px',
                    fontWeight: '600',
                  }}
                >
                  Print Label & Assign to Me
                </button>
                <button
                  onClick={handleSkip}
                  disabled={loading}
                  style={{
                    padding: '12px 24px',
                    background: '#f5f5f5',
                    color: '#333',
                    border: '1px solid #ccc',
                    borderRadius: '8px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: '16px',
                  }}
                >
                  Skip / Problem
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: '24px',
                textAlign: 'center',
                border: '1px solid #ccc',
                borderRadius: '8px',
                background: '#f9f9f9',
              }}
            >
              <p>No pending orders to print labels for.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

