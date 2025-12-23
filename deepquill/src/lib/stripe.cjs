// deepquill/src/lib/stripe.cjs
// Single source of truth for Stripe client instance

const Stripe = require('stripe');
const { STRIPE_SECRET_KEY } = require('../config/env.cjs');

exports.stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-04-10',
});

