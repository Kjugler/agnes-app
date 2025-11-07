// deepquill/api/create-checkout-session.cjs
const dotenv = require('dotenv');
const path = require('path');

// Load .env from deepquill/ directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Stripe } = require('stripe');

// Try both common names, fail loudly if missing
const apiKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY;
if (!apiKey) {
  throw new Error('Stripe API key missing. Set STRIPE_SECRET_KEY in deepquill/.env');
}

// Stripe v14–v16 supports this signature
const stripe = new Stripe(apiKey, { apiVersion: '2024-06-20' });

const PRICE_ID = process.env.STRIPE_PRICE_ID;

/**
 * POST /api/create-checkout-session
 * body: { qty?: number, successPath?: string, cancelPath?: string, metadata?: object }
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const qty = Math.max(1, Number(req.body?.qty || 1));
    const successPath = req.body?.successPath || '/contest/thank-you';
    const cancelPath  = req.body?.cancelPath  || '/contest';
    const metadata    = (req.body && req.body.metadata) || {};

    // We want users to land back on Next (port 3002)
    // Still allow overriding via body if you want different pages per flow.
    const origin = 'http://localhost:3002';

    const success_url = `${origin}${successPath}?session_id={CHECKOUT_SESSION_ID}`;
    const cancel_url  = `${origin}${cancelPath}`;

    const line_items = PRICE_ID
      ? [{ price: PRICE_ID, quantity: qty }]
      : [{
          price_data: {
            currency: 'usd',
            product_data: { name: 'The Agnes Protocol (Paperback)' },
            unit_amount: 2600, // $26.00
          },
          quantity: qty,
        }];

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      success_url,
      cancel_url,
      metadata,
      allow_promotion_codes: true,
      locale: 'en',            // quiet the "./en" warning in the browser
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('CHECKOUT_ERR', err);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
};
