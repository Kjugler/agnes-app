// deepquill/lib/ordersStore.cjs
const path = require('path');
const fs = require('fs');

const DATA_FILE = path.join(__dirname, '..', 'data', 'orders.json');

function loadState() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.warn('[ORDERS-STORE] Failed to load state, using defaults:', e.message);
  }
  // Default state if file doesn't exist
  return { lastOrderId: 10480, orders: [] };
}

function saveState(state) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    console.error('[ORDERS-STORE] Failed to save state:', e.message);
    throw e;
  }
}

function createOrderFromStripeSession(session) {
  // session: Stripe checkout.session.completed event.data.object
  const state = loadState();
  
  // Increment lastOrderId
  const newOrderId = state.lastOrderId + 1;
  state.lastOrderId = newOrderId;

  // Extract address with preference: shipping_details.address || customer_details.address
  const addr =
    session.shipping_details?.address ||
    session.customer_details?.address || null;
  const customerDetails = session.customer_details || {};
  const shipping = session.shipping_details || {};

  // Build order record
  const order = {
    id: newOrderId,
    stripeSessionId: session.id,
    stripePaymentIntentId: session.payment_intent || null,
    createdAt: new Date().toISOString(),
    status: 'pending_shipment',
    email: customerDetails.email || session.customer_email || null,
    name: customerDetails.name || shipping.name || null,
    address: addr && {
      line1: addr.line1 || '',
      line2: addr.line2 || '',
      city: addr.city || '',
      state: addr.state || '',
      postalCode: addr.postal_code || '',
      country: addr.country || '',
    },
    // from metadata, if present:
    apCode: session.metadata?.apCode || session.metadata?.referralCode || null,
    contestUserId: session.metadata?.contestUserId || null,
    amountTotal: session.amount_total || null,
    currency: session.currency || 'usd',
  };

  // Push into state.orders
  state.orders.push(order);

  // Save state
  saveState(state);

  return order;
}

function getOrderById(orderId) {
  const state = loadState();
  const numericId = Number(orderId);
  return state.orders.find(o => o.id === numericId || o.id === orderId) || null;
}

module.exports = {
  createOrderFromStripeSession,
  getOrderById,
};

