// deepquill/src/lib/fulfillmentLogger.cjs
// Simple append-only fulfillment logging (no Prisma required)

const fs = require('fs');
const path = require('path');

const FULFILLMENTS_FILE = path.join(__dirname, '../../data/fulfillments.jsonl');

/**
 * Ensure data directory and file exist
 */
function ensureFileExists() {
  const dataDir = path.dirname(FULFILLMENTS_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Create file if it doesn't exist (don't overwrite if it does)
  if (!fs.existsSync(FULFILLMENTS_FILE)) {
    fs.writeFileSync(FULFILLMENTS_FILE, '', 'utf8');
  }
}

/**
 * Log a fulfillment event (append-only)
 * 
 * @param {Object} params
 * @param {string} params.type - e.g., "EBOOK_GRANT"
 * @param {string} params.email - Customer email
 * @param {string} params.sessionId - Stripe checkout session ID
 * @param {string} [params.paymentIntentId] - Stripe payment intent ID
 * @param {string} params.productPurchased - e.g., "paperback"
 * @param {string} params.grantProduct - e.g., "ebook"
 * @param {string} [params.ref] - Referral code if present
 * @param {string} [params.src] - Source tracking param
 * @param {string} [params.v] - Variant tracking param
 * @param {string} [params.origin] - Origin tracking param
 * @param {string} [params.status] - "queued" | "sent" | "failed" (default: "queued")
 * @param {string} [params.error] - Error message if status is "failed"
 */
function logFulfillment(params) {
  try {
    ensureFileExists();

    const record = {
      createdAt: new Date().toISOString(),
      type: params.type || 'EBOOK_GRANT',
      email: params.email,
      sessionId: params.sessionId,
      paymentIntentId: params.paymentIntentId || null,
      productPurchased: params.productPurchased,
      grantProduct: params.grantProduct,
      ref: params.ref || null,
      src: params.src || null,
      v: params.v || null,
      origin: params.origin || null,
      status: params.status || 'queued',
      error: params.error || null,
    };

    // Append as JSONL (one JSON object per line)
    const line = JSON.stringify(record) + '\n';
    fs.appendFileSync(FULFILLMENTS_FILE, line, 'utf8');

    console.log('[FULFILLMENT_LOG]', {
      type: record.type,
      email: record.email,
      sessionId: record.sessionId,
      productPurchased: record.productPurchased,
      grantProduct: record.grantProduct,
      status: record.status,
    });

    return record;
  } catch (error) {
    console.error('[FULFILLMENT_LOG] Failed to log fulfillment', {
      error: error.message,
      params,
    });
    throw error;
  }
}

/**
 * Update fulfillment status (finds by sessionId and updates status)
 * Note: This reads the entire file, updates matching records, and rewrites.
 * For high-volume scenarios, consider migrating to Prisma later.
 * 
 * @param {string} sessionId - Stripe checkout session ID
 * @param {string} status - New status ("sent" | "failed")
 * @param {string} [error] - Error message if status is "failed"
 */
function updateFulfillmentStatus(sessionId, status, error = null) {
  try {
    ensureFileExists();

    if (!fs.existsSync(FULFILLMENTS_FILE)) {
      console.warn('[FULFILLMENT_LOG] File does not exist, cannot update');
      return false;
    }

    const content = fs.readFileSync(FULFILLMENTS_FILE, 'utf8');
    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    
    let updated = false;
    const updatedLines = lines.map((line) => {
      try {
        const record = JSON.parse(line);
        if (record.sessionId === sessionId && record.status === 'queued') {
          record.status = status;
          if (error) {
            record.error = error;
          }
          updated = true;
          return JSON.stringify(record);
        }
        return line;
      } catch (err) {
        // Skip malformed lines
        return line;
      }
    });

    if (updated) {
      fs.writeFileSync(FULFILLMENTS_FILE, updatedLines.join('\n') + '\n', 'utf8');
      console.log('[FULFILLMENT_LOG] Updated status', { sessionId, status });
      return true;
    }

    return false;
  } catch (error) {
    console.error('[FULFILLMENT_LOG] Failed to update fulfillment status', {
      error: error.message,
      sessionId,
      status,
    });
    return false;
  }
}

/**
 * Read fulfillments (for debugging/admin)
 * 
 * @param {Object} [options]
 * @param {number} [options.limit] - Max records to return (default: 100)
 * @param {string} [options.status] - Filter by status
 * @returns {Array} Array of fulfillment records
 */
function readFulfillments(options = {}) {
  try {
    ensureFileExists();

    if (!fs.existsSync(FULFILLMENTS_FILE)) {
      return [];
    }

    const content = fs.readFileSync(FULFILLMENTS_FILE, 'utf8');
    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    
    let records = lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        return null;
      }
    }).filter((record) => record !== null);

    // Filter by status if provided
    if (options.status) {
      records = records.filter((r) => r.status === options.status);
    }

    // Sort by createdAt descending (newest first)
    records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Apply limit
    const limit = options.limit || 100;
    return records.slice(0, limit);
  } catch (error) {
    console.error('[FULFILLMENT_LOG] Failed to read fulfillments', {
      error: error.message,
    });
    return [];
  }
}

module.exports = {
  logFulfillment,
  updateFulfillmentStatus,
  readFulfillments,
};

