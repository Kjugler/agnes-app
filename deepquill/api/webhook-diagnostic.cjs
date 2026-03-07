// deepquill/api/webhook-diagnostic.cjs
// Diagnostic endpoint to check webhook status and manually trigger processing

const { prisma } = require('../server/prisma.cjs');
const { ensureDatabaseUrl } = require('../server/prisma.cjs');
const { stripe } = require('../src/lib/stripe.cjs');

async function handleWebhookDiagnostic(req, res) {
  try {
    ensureDatabaseUrl();
    
    const { sessionId, action } = req.query;
    
    if (action === 'check') {
      // Check if Purchase exists for sessionId
      if (!sessionId) {
        return res.status(400).json({ error: 'sessionId query parameter required' });
      }
      
      const purchase = await prisma.purchase.findUnique({
        where: { sessionId },
        include: {
          user: {
            select: { id: true, email: true, points: true },
          },
        },
      });
      
      const ledgerEntries = await prisma.ledger.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
      });
      
      // Try to fetch session from Stripe
      let stripeSession = null;
      try {
        stripeSession = await stripe.checkout.sessions.retrieve(sessionId, {
          expand: ['customer', 'payment_intent'],
        });
      } catch (stripeErr) {
        console.warn('[webhook-diagnostic] Failed to fetch Stripe session', { error: stripeErr.message });
      }
      
      return res.json({
        sessionId,
        purchase: purchase ? {
          id: purchase.id,
          userId: purchase.userId,
          amount: purchase.amount,
          currency: purchase.currency,
          createdAt: purchase.createdAt,
          user: purchase.user,
        } : null,
        ledgerEntries: ledgerEntries.map(e => ({
          type: e.type,
          points: e.points,
          usd: e.usd,
          createdAt: e.createdAt,
        })),
        stripeSession: stripeSession ? {
          id: stripeSession.id,
          payment_status: stripeSession.payment_status,
          amount_total: stripeSession.amount_total,
          customer_email: stripeSession.customer_details?.email || stripeSession.customer_email,
          metadata: stripeSession.metadata,
        } : null,
        status: purchase ? 'processed' : 'not_processed',
      });
    }
    
    if (action === 'trigger' && sessionId) {
      // Manual webhook trigger (for testing/debugging)
      // This would require re-implementing the webhook logic, which is complex
      // Instead, return instructions
      return res.json({
        message: 'Manual webhook trigger not implemented. Use Stripe CLI to replay the event:',
        instructions: [
          `1. Run: stripe events resend evt_<event_id>`,
          `2. Or use Stripe Dashboard to manually trigger the webhook`,
          `3. Or use: stripe trigger checkout.session.completed --override checkout_session_id=${sessionId}`,
        ],
        sessionId,
      });
    }
    
    return res.json({
      usage: {
        check: '/api/webhook-diagnostic?action=check&sessionId=cs_test_...',
        help: '/api/webhook-diagnostic?action=help',
      },
    });
    
  } catch (error) {
    console.error('[webhook-diagnostic] Error', error);
    return res.status(500).json({ error: error.message });
  }
}

module.exports = handleWebhookDiagnostic;
