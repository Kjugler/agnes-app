// deepquill/lib/ledger/recordLedger.cjs
// Canonical ledger entry recording for all obligations (points, referral, fulfillment)

/**
 * Record a ledger entry (idempotent by sessionId+type+userId)
 * @param {Object} prismaClient - Prisma client instance (required)
 * @param {Object} params - { sessionId, userId, type, points?, amount?, currency?, note?, meta? }
 * @returns {Promise<Object>} Created/updated ledger entry
 */
async function recordLedgerEntry(prismaClient, { sessionId, userId, type, points = 0, amount = null, currency = null, note = null, meta = null }) {
  if (!prismaClient) {
    throw new Error('[LEDGER] prismaClient is required but was not provided');
  }

  if (!userId || !type) {
    throw new Error('[LEDGER] userId and type are required');
  }

  // Use amount if provided, otherwise use points
  const finalAmount = amount !== null ? amount : points;
  const finalCurrency = currency || (amount !== null ? 'usd' : 'points');

  try {
    // Idempotent upsert: unique constraint on [sessionId, type, userId]
    // If sessionId is null, we can't enforce idempotency (but still create entry)
    const ledgerData = {
      userId,
      type,
      points: points || 0,
      amount: finalAmount,
      currency: finalCurrency,
      note,
      meta: meta ? JSON.parse(JSON.stringify(meta)) : null, // Deep clone to avoid Prisma issues
    };

    // Only include sessionId if provided (for idempotency)
    if (sessionId) {
      ledgerData.sessionId = sessionId;
    }

    let ledgerEntry;
    if (sessionId) {
      // Use upsert for idempotency when sessionId is present
      ledgerEntry = await prismaClient.ledger.upsert({
        where: {
          uniq_ledger_type_session_user: {
            sessionId,
            type,
            userId,
          },
        },
        update: {
          // Update existing entry (shouldn't happen in normal flow, but handle gracefully)
          points: ledgerData.points,
          amount: ledgerData.amount,
          currency: ledgerData.currency,
          note: ledgerData.note,
          meta: ledgerData.meta,
        },
        create: ledgerData,
      });
    } else {
      // No sessionId - just create (not idempotent, but still record)
      ledgerEntry = await prismaClient.ledger.create({
        data: ledgerData,
      });
    }

    console.log('[LEDGER] UPSERT OK', {
      type,
      sessionId: sessionId || 'none',
      userId,
      points: ledgerEntry.points,
      amount: ledgerEntry.amount,
      currency: ledgerEntry.currency,
      note: ledgerEntry.note || 'none',
    });

    return ledgerEntry;
  } catch (error) {
    // Handle unique constraint violation (idempotency)
    if (error.code === 'P2002') {
      console.log('[LEDGER] Entry already exists (idempotent)', {
        sessionId,
        type,
        userId,
      });
      // Fetch and return existing entry
      if (sessionId) {
        return await prismaClient.ledger.findUnique({
          where: {
            uniq_ledger_type_session_user: {
              sessionId,
              type,
              userId,
            },
          },
        });
      }
    }

    console.error('[LEDGER] Error recording ledger entry', {
      error: error.message,
      sessionId,
      type,
      userId,
      stack: error.stack,
    });
    throw error;
  }
}

module.exports = {
  recordLedgerEntry,
};
