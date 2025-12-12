'use client';

import { useState, useEffect } from 'react';

type FulfillmentUser = {
  id: string;
  name: string;
  email: string;
};

type OrderToShip = {
  id: string;
  createdAt: string;
  labelPrintedAt: string | null;
  shippingName: string | null;
  shippingAddressLine1: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingPostalCode: string | null;
  shippingCountry: string | null;
};

export default function ShipBooksPage() {
  const [user, setUser] = useState<FulfillmentUser | null>(null);
  const [orders, setOrders] = useState<OrderToShip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shippingOrderId, setShippingOrderId] = useState<string | null>(null);

  // Static helper options (can be made dynamic later)
  const helperOptions = [
    { name: 'Carly Jugler', email: 'carly@example.com' },
    { name: 'Denise', email: 'denise@example.com' },
  ];

  // Load or create fulfillment user
  const selectHelper = async (name: string, email: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/fulfillment/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });

      if (!response.ok) {
        throw new Error('Failed to create/load helper');
      }

      const fulfillmentUser = await response.json();
      setUser(fulfillmentUser);
      localStorage.setItem('fulfillmentUserId', fulfillmentUser.id);
      localStorage.setItem('fulfillmentUserName', fulfillmentUser.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load helper');
    } finally {
      setLoading(false);
    }
  };

  // Load orders to ship
  const loadOrdersToShip = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/fulfillment/to-ship?fulfillmentUserId=${user.id}`
      );
      if (!response.ok) {
        throw new Error('Failed to load orders');
      }

      const data = await response.json();
      setOrders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  // Mark order as shipped
  const handleMarkShipped = async (orderId: string) => {
    if (!user) return;

    setShippingOrderId(orderId);
    setError(null);
    try {
      const response = await fetch('/api/fulfillment/mark-shipped', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          fulfillmentUserId: user.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to mark as shipped');
      }

      // Remove order from list
      setOrders(orders.filter((o) => o.id !== orderId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as shipped');
    } finally {
      setShippingOrderId(null);
    }
  };

  // Calculate order age in days
  const getOrderAge = (createdAt: string): number => {
    const created = new Date(createdAt);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - created.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Load user from localStorage on mount
  useEffect(() => {
    const savedUserId = localStorage.getItem('fulfillmentUserId');
    const savedUserName = localStorage.getItem('fulfillmentUserName');
    if (savedUserId && savedUserName) {
      // Try to find the helper in the list
      const helper = helperOptions.find((h) => h.name === savedUserName);
      if (helper) {
        selectHelper(helper.name, helper.email);
      }
    }
  }, []);

  // Load orders when user is set
  useEffect(() => {
    if (user) {
      loadOrdersToShip();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '24px' }}>Ship Books</h1>

      {/* Helper Selection */}
      {!user ? (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ marginBottom: '12px', fontSize: '18px' }}>
            Select Helper
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {helperOptions.map((helper) => (
              <button
                key={helper.email}
                onClick={() => selectHelper(helper.name, helper.email)}
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

      {/* Orders Table */}
      {user && (
        <div>
          {loading && orders.length === 0 ? (
            <p>Loading orders...</p>
          ) : orders.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  background: '#fff',
                  border: '1px solid #ddd',
                }}
              >
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                      Name
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                      City / State
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                      Label Printed
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                      Order Age
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '12px' }}>
                        {order.shippingName || 'N/A'}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {order.shippingCity || ''}
                        {order.shippingCity && order.shippingState && ', '}
                        {order.shippingState || ''}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {order.labelPrintedAt
                          ? new Date(order.labelPrintedAt).toLocaleDateString()
                          : 'N/A'}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {getOrderAge(order.createdAt)} day
                        {getOrderAge(order.createdAt) !== 1 ? 's' : ''} old
                      </td>
                      <td style={{ padding: '12px' }}>
                        <button
                          onClick={() => handleMarkShipped(order.id)}
                          disabled={shippingOrderId === order.id}
                          style={{
                            padding: '8px 16px',
                            background:
                              shippingOrderId === order.id
                                ? '#ccc'
                                : '#0070f3',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor:
                              shippingOrderId === order.id
                                ? 'not-allowed'
                                : 'pointer',
                            fontSize: '14px',
                          }}
                        >
                          {shippingOrderId === order.id
                            ? 'Shipping...'
                            : 'Mark as Shipped'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
              <p>No orders to ship.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

