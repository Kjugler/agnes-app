// deepquill/api/email/purchase-confirmation-status.cjs
// Get email delivery status for purchase confirmation by session_id

const { prisma } = require('../../server/prisma.cjs');
const { ensureDatabaseUrl } = require('../../server/prisma.cjs');

async function handleEmailDeliveryStatus(req, res) {
  try {
    ensureDatabaseUrl();
    
    // Express.js query parsing - accept both session_id and sessionId
    let sessionId = req.query?.session_id || req.query?.sessionId;
    
    // Fallback: parse from URL if query not populated
    if (!sessionId && req.url) {
      try {
        const protocol = req.protocol || 'http';
        const host = req.get('host') || req.headers.host || 'localhost:5055';
        const url = new URL(req.originalUrl || req.url, `${protocol}://${host}`);
        sessionId = url.searchParams.get('session_id') || url.searchParams.get('sessionId');
      } catch (urlErr) {
        const match1 = req.url.match(/[?&]session_id=([^&]+)/);
        const match2 = req.url.match(/[?&]sessionId=([^&]+)/);
        if (match1) {
          sessionId = decodeURIComponent(match1[1]);
        } else if (match2) {
          sessionId = decodeURIComponent(match2[1]);
        }
      }
    }

    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'missing_session_id',
        message: 'session_id query parameter is required',
      });
    }

    const trimmedSessionId = sessionId.trim();

    console.log('[email/purchase-confirmation-status] Fetching delivery status for session_id', trimmedSessionId);

    // Find EMAIL_PURCHASE_CONFIRMATION ledger entry for this session
    let ledgerEntry;
    try {
      ledgerEntry = await prisma.ledger.findFirst({
        where: {
          sessionId: trimmedSessionId,
          type: 'EMAIL_PURCHASE_CONFIRMATION',
        },
        select: {
          meta: true,
          createdAt: true,
        },
      });
    } catch (err) {
      console.error('[email/purchase-confirmation-status] Error finding ledger entry', {
        error: err?.message,
        sessionId: trimmedSessionId,
      });
      throw err;
    }

    if (!ledgerEntry) {
      // No email delivery record yet - return null delivery (not an error)
      console.log('[email/purchase-confirmation-status] No delivery record found for session_id', trimmedSessionId);
      return res.json({
        ok: true,
        sessionId: trimmedSessionId,
        delivery: null,
      });
    }

    // Normalize meta (defensive: meta may be object, JSON string, or Prisma JsonValue)
    let meta = ledgerEntry.meta;
    if (typeof meta === 'string') {
      try {
        meta = JSON.parse(meta);
      } catch (parseErr) {
        console.warn('[email/purchase-confirmation-status] Failed to parse meta as JSON', {
          sessionId: trimmedSessionId,
          error: parseErr.message,
        });
        meta = {};
      }
    }
    if (!meta || typeof meta !== 'object') {
      meta = {};
    }

    // Extract emailDelivery from meta structure: { emailDelivery: { ... } } or direct { deliveryStatus, ... }
    const emailDelivery = meta?.emailDelivery || meta;
    
    // Ensure we have a valid object structure (not array, not null, not primitive)
    if (!emailDelivery || typeof emailDelivery !== 'object' || Array.isArray(emailDelivery)) {
      console.warn('[email/purchase-confirmation-status] Invalid emailDelivery structure', {
        sessionId: trimmedSessionId,
        metaType: typeof meta,
        hasEmailDelivery: !!meta?.emailDelivery,
        emailDeliveryType: typeof emailDelivery,
        isArray: Array.isArray(emailDelivery),
      });
      return res.json({
        ok: true,
        sessionId: trimmedSessionId,
        delivery: null,
      });
    }

    // Normalize deliveryStatus: must be one of sent|queued|rejected|error, else default to "error"
    let deliveryStatus = emailDelivery?.deliveryStatus;
    const validStatuses = ['sent', 'queued', 'rejected', 'error'];
    if (!deliveryStatus || typeof deliveryStatus !== 'string' || !validStatuses.includes(deliveryStatus)) {
      console.warn('[email/purchase-confirmation-status] Invalid deliveryStatus, defaulting to error', {
        sessionId: trimmedSessionId,
        receivedStatus: deliveryStatus,
        receivedType: typeof deliveryStatus,
      });
      deliveryStatus = 'error';
    }

    // Build normalized response with delivery status
    const delivery = {
      deliveryStatus: deliveryStatus,
      rejectReason: emailDelivery?.rejectReason || null,
      queuedReason: emailDelivery?.queuedReason || null,
      attemptedAt: emailDelivery?.attemptedAt || ledgerEntry.createdAt?.toISOString() || null,
      email: emailDelivery?.email || null,
      providerMessageId: emailDelivery?.providerMessageId || null,
    };

    console.log('[email/purchase-confirmation-status] Delivery status found', {
      sessionId: trimmedSessionId,
      deliveryStatus: delivery.deliveryStatus,
    });

    return res.json({
      ok: true,
      sessionId: trimmedSessionId,
      delivery,
    });
  } catch (err) {
    console.error('[email/purchase-confirmation-status] Error fetching delivery status', {
      error: err?.message,
      stack: err?.stack,
    });
    return res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: err?.message || 'Failed to fetch email delivery status',
    });
  }
}

module.exports = handleEmailDeliveryStatus;
