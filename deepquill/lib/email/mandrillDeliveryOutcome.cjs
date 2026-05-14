/**
 * Normalize Mailchimp Transactional (Mandrill) `messages.send` response.
 * @param {any} emailResult
 * @returns {{ deliveryStatus: string, providerMessageId: string, rejectReason: string | null, queuedReason: string | null, rawStatus: string }}
 */
function normalizeEmailDeliveryOutcome(emailResult) {
  let outcome = {
    deliveryStatus: 'error',
    providerMessageId: 'unknown',
    rejectReason: null,
    queuedReason: null,
    rawStatus: 'unknown',
  };

  try {
    let firstResult = null;
    if (Array.isArray(emailResult) && emailResult.length > 0) {
      firstResult = emailResult[0];
    } else if (emailResult && typeof emailResult === 'object') {
      firstResult = emailResult;
    }

    if (firstResult) {
      const status = firstResult.status || 'unknown';
      outcome.rawStatus = status;
      outcome.providerMessageId = firstResult._id || firstResult.id || firstResult.messageId || 'unknown';
      outcome.rejectReason = firstResult.reject_reason || null;
      outcome.queuedReason = firstResult.queued_reason || null;

      if (status === 'sent') {
        outcome.deliveryStatus = 'sent';
      } else if (status === 'queued') {
        outcome.deliveryStatus = 'queued';
      } else if (status === 'rejected') {
        outcome.deliveryStatus = 'rejected';
      } else if (status === 'invalid' || status === 'error' || status === 'bounced') {
        outcome.deliveryStatus = 'error';
      } else {
        outcome.deliveryStatus = 'error';
      }
    } else {
      outcome.deliveryStatus = 'error';
    }
  } catch (err) {
    outcome.deliveryStatus = 'error';
    outcome.rejectReason = `Parse error: ${err.message}`;
  }

  return outcome;
}

module.exports = { normalizeEmailDeliveryOutcome };
