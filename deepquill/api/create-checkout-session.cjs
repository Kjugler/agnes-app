// deepquill/api/create-checkout-session.cjs
const Stripe = require('stripe');
const dotenv = require('dotenv');
dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-04-10',
});

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

    // We want users to land back on Next (via ngrok dev domain)
    // Still allow overriding via body if you want different pages per flow.
    const origin = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agnes-dev.ngrok-free.app';

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
      shipping_address_collection: {
        allowed_countries: ['US'], // ok to expand later
      },
      phone_number_collection: { enabled: true },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('CHECKOUT_ERR', err);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
};
