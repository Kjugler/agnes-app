// deepquill/api/stripe-session.cjs
// Retrieve Stripe checkout session (for agnes-next finalize route)

const { stripe } = require('../src/lib/stripe.cjs');

/**
 * POST /api/stripe/session
 * body: { sessionId: string }
 * 
 * Returns Stripe checkout session data
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { sessionId } = req.body || {};
    
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId required' });
    }

    console.log('[stripe-session] Retrieving session', { sessionId });

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    return res.status(200).json({
      session: {
        id: session.id,
        customer_email: session.customer_email,
        customer_details: session.customer_details,
        customer: session.customer,
        payment_status: session.payment_status,
        metadata: session.metadata,
      },
    });
  } catch (err) {
    console.error('[stripe-session] Error', {
      error: err?.message,
      code: err?.code,
    });
    
    return res.status(500).json({
      error: err?.message || 'Failed to retrieve session',
    });
  }
};

