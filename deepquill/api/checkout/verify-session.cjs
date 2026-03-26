// deepquill/api/checkout/verify-session.cjs
// Verify Stripe checkout session and return details

const { stripe } = require('../../src/lib/stripe.cjs');

/**
 * Trimmed INTERNAL_PROXY_SECRET only. Empty string = do not validate x-internal-proxy.
 * Aligned with agnes-next getInternalProxySecretTrimmed(): no implicit dev-only-secret fallback,
 * so local/dev stays quiet when the secret is intentionally unset on both sides.
 */
function getExpectedInternalProxySecret() {
  const raw = process.env.INTERNAL_PROXY_SECRET;
  if (raw == null) return '';
  const t = String(raw).trim();
  return t;
}

/**
 * Verify Stripe checkout session
 * GET /api/checkout/verify-session?session_id=cs_xxx
 *
 * Validates x-internal-proxy when an expected secret is in effect (see getExpectedInternalProxySecret).
 */
async function handleVerifySession(req, res) {
  try {
    // Stripe key sanity check (prevent test/live confusion)
    const stripeKey = process.env.STRIPE_SECRET_KEY || '';
    const stripeMode = stripeKey.startsWith('sk_test') ? 'test' : stripeKey.startsWith('sk_live') ? 'live' : 'unknown';
    console.log('[STRIPE] mode:', stripeMode);

    const expectedSecret = getExpectedInternalProxySecret();
    const providedSecret = String(req.headers['x-internal-proxy'] || '').trim();
    if (expectedSecret && providedSecret !== expectedSecret) {
      const inProd = process.env.NODE_ENV === 'production';
      if (inProd) {
        return res.status(403).json({
          ok: false,
          error: 'forbidden',
          message: 'Invalid proxy secret',
        });
      }
      console.warn(
        '[verify-session] proxy secret mismatch (dev: request allowed). Set the same INTERNAL_PROXY_SECRET in agnes-next and deepquill, or leave unset on both.'
      );
    }

    // Support both GET (query param) and POST (body)
    let sessionId = req.method === 'GET' 
      ? (req.query?.session_id || req.query?.sessionId)
      : (req.body?.session_id || req.body?.sessionId);

    // Clean up malformed session_id (handle cases where query param is duplicated)
    if (sessionId && typeof sessionId === 'string') {
      // Remove any trailing query parameters (e.g., "cs_xxx?session_id=cs_xxx")
      const match = sessionId.match(/^([^?&]+)/);
      if (match) {
        sessionId = match[1];
      }
      // Trim whitespace
      sessionId = sessionId.trim();
    }

    if (!sessionId || typeof sessionId !== 'string' || sessionId.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'session_id required',
        received: {
          query: req.query,
          url: req.url,
          originalUrl: req.originalUrl,
        },
      });
    }

    // Validate session_id format (Stripe session IDs are typically 66 chars or less)
    if (sessionId.length > 66) {
      console.warn('[verify-session] Session ID too long, truncating', {
        originalLength: sessionId.length,
        original: sessionId.substring(0, 80),
      });
      sessionId = sessionId.substring(0, 66);
    }

    console.log('[verify-session] verifying', { session_id: sessionId });

    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer', 'payment_intent'],
    });

    // Retrieve line items separately (they need to be expanded with data)
    let lineItems = null;
    try {
      lineItems = await stripe.checkout.sessions.listLineItems(sessionId, {
        expand: ['data.price'],
      });
    } catch (err) {
      console.warn('[verify-session] Failed to retrieve line items:', err.message);
    }

    // Determine payment status
    const paid = session.payment_status === 'paid';
    const email = session.customer_details?.email || session.customer_email || null;

    // Extract order ID from metadata if available
    const orderId = session.metadata?.orderId || null;

    // When paid: look up Purchase -> userId -> hasContestJoin for fast "See Progress" on thank-you/contest handoff
    let contestJoined = null;
    if (paid) {
      try {
        const { prisma, ensureDatabaseUrl } = require('../../server/prisma.cjs');
        const { hasContestJoin } = require('../../lib/contest/hasContestJoin.cjs');
        ensureDatabaseUrl();
        if (prisma) {
          const purchase = await prisma.purchase.findUnique({
            where: { sessionId },
            select: { userId: true },
          });
          if (purchase?.userId) {
            contestJoined = await hasContestJoin(prisma, purchase.userId);
          }
        }
      } catch (e) {
        console.warn('[verify-session] contestJoined lookup failed (non-blocking)', { error: e?.message });
      }
    }

    // Extract product type from metadata or line items
    let productType = session.metadata?.product || null;
    if (!productType && lineItems?.data?.length > 0) {
      // Try to infer from price ID
      const priceId = lineItems.data[0].price?.id;
      if (priceId) {
        // Map price IDs to product types (from create-checkout-session.cjs)
        const envConfig = require('../../src/config/env.cjs');
        if (priceId === envConfig.STRIPE_PRICE_PAPERBACK) productType = 'paperback';
        else if (priceId === envConfig.STRIPE_PRICE_EBOOK) productType = 'ebook';
        else if (priceId === envConfig.STRIPE_PRICE_AUDIO_PREORDER) productType = 'audio_preorder';
      }
    }

    return res.json({
      ok: true,
      paid,
      email,
      orderId,
      sessionId: session.id,
      paymentStatus: session.payment_status,
      customerEmail: session.customer_details?.email || session.customer_email,
      amountTotal: session.amount_total,
      currency: session.currency,
      productType, // product type (paperback, ebook, audio_preorder)
      contestJoined: contestJoined === true, // true when Purchase exists and user has CONTEST_JOIN
    });
  } catch (err) {
    console.error('[verify-session] Error', {
      error: err?.message,
      code: err?.code,
    });

    // Handle Stripe-specific errors
    if (err.type === 'StripeInvalidRequestError') {
      return res.status(404).json({
        ok: false,
        error: 'Session not found',
        message: err.message,
      });
    }

    return res.status(500).json({
      ok: false,
      error: 'server_error',
      message: err?.message || 'Failed to verify session',
    });
  }
}

module.exports = handleVerifySession;
