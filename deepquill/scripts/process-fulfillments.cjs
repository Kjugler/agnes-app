// deepquill/scripts/process-fulfillments.cjs
// Worker script to process queued eBook fulfillments and send emails

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { readFulfillments, updateFulfillmentStatus } = require('../src/lib/fulfillmentLogger.cjs');
const { signToken } = require('../src/lib/fulfillmentToken.cjs');
const { buildEbookFulfillmentEmail } = require('../src/lib/fulfillmentEmail.cjs');
const envConfig = require('../src/config/env.cjs');

const LOCK_FILE = path.join(__dirname, '../data/fulfillments.lock');
const LOCK_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

// Load env vars
const {
  MAILCHIMP_TRANSACTIONAL_KEY,
  MAILCHIMP_FROM_EMAIL,
} = process.env;

/**
 * Check if lock file exists and is fresh
 */
function isLocked() {
  if (!fs.existsSync(LOCK_FILE)) {
    return false;
  }

  try {
    const stats = fs.statSync(LOCK_FILE);
    const age = Date.now() - stats.mtimeMs;
    return age < LOCK_MAX_AGE_MS;
  } catch (err) {
    return false;
  }
}

/**
 * Create lock file
 */
function createLock() {
  try {
    const lockDir = path.dirname(LOCK_FILE);
    if (!fs.existsSync(lockDir)) {
      fs.mkdirSync(lockDir, { recursive: true });
    }
    fs.writeFileSync(LOCK_FILE, JSON.stringify({
      pid: process.pid,
      startedAt: new Date().toISOString(),
    }), 'utf8');
  } catch (err) {
    console.error('[FULFILLMENT_WORKER] Failed to create lock file:', err.message);
  }
}

/**
 * Remove lock file
 */
function removeLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch (err) {
    console.error('[FULFILLMENT_WORKER] Failed to remove lock file:', err.message);
  }
}

/**
 * Create email transporter
 */
function createTransporter() {
  if (!MAILCHIMP_TRANSACTIONAL_KEY || !MAILCHIMP_FROM_EMAIL) {
    console.warn('[FULFILLMENT_WORKER] Email service not configured');
    return null;
  }

  return nodemailer.createTransport({
    host: 'smtp.mandrillapp.com',
    port: 587,
    secure: false,
    auth: {
      user: 'DeepQuill LLC',
      pass: MAILCHIMP_TRANSACTIONAL_KEY,
    },
  });
}

/**
 * Process a single fulfillment record
 */
async function processFulfillment(fulfillment, transporter) {
  const { email, sessionId, productPurchased, grantProduct } = fulfillment;

  console.log('[FULFILLMENT_WORKER] Processing fulfillment', {
    sessionId,
    email,
    productPurchased,
    grantProduct,
  });

  // Validate required fields
  if (!email || !sessionId) {
    const error = 'Missing email or sessionId';
    console.error('[FULFILLMENT_WORKER]', error, fulfillment);
    await updateFulfillmentStatus(sessionId, 'failed', error);
    return false;
  }

  // Only process EBOOK_GRANT fulfillments
  if (fulfillment.type !== 'EBOOK_GRANT' || grantProduct !== 'ebook') {
    console.log('[FULFILLMENT_WORKER] Skipping non-eBook fulfillment', {
      type: fulfillment.type,
      grantProduct,
    });
    return false;
  }

  try {
    // Generate secure download token
    const token = signToken({ email, sessionId });
    const downloadUrl = `${envConfig.SITE_URL}/api/ebook/download?token=${encodeURIComponent(token)}`;

    // Build email
    const { subject, text, html } = buildEbookFulfillmentEmail({
      email,
      downloadUrl,
      ttlDays: envConfig.EBOOK_LINK_TTL_DAYS,
    });

    // Apply global test contest banner (includes subject modification)
    const { applyGlobalEmailBanner } = require('../src/lib/emailBanner.cjs');
    const { html: htmlWithBanner, text: textWithBanner, subject: finalSubject } = applyGlobalEmailBanner({ 
      html, 
      text, 
      subject 
    });

    // Send email
    if (!transporter) {
      throw new Error('Email transporter not configured');
    }

    const mailOptions = {
      from: MAILCHIMP_FROM_EMAIL,
      to: email,
      subject: finalSubject || subject,
      text: textWithBanner,
      html: htmlWithBanner,
      replyTo: 'hello@theagnesprotocol.com',
    };

    await transporter.sendMail(mailOptions);

    console.log('[FULFILLMENT_WORKER] Email sent successfully', {
      sessionId,
      email,
    });

    // Update status to sent
    await updateFulfillmentStatus(sessionId, 'sent');
    return true;
  } catch (error) {
    console.error('[FULFILLMENT_WORKER] Failed to process fulfillment', {
      sessionId,
      email,
      error: error.message,
    });

    // Update status to failed
    await updateFulfillmentStatus(sessionId, 'failed', error.message);
    return false;
  }
}

/**
 * Main worker function
 */
async function main() {
  console.log('[FULFILLMENT_WORKER] Starting fulfillment worker...');

  // Check for lock
  if (isLocked()) {
    console.log('[FULFILLMENT_WORKER] Another worker is running (lock file exists), exiting');
    process.exit(0);
  }

  // Create lock
  createLock();

  // Cleanup lock on exit
  process.on('exit', removeLock);
  process.on('SIGINT', () => {
    removeLock();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    removeLock();
    process.exit(0);
  });

  try {
    // Read queued fulfillments
    const fulfillments = readFulfillments({ status: 'queued', limit: 100 });
    
    if (fulfillments.length === 0) {
      console.log('[FULFILLMENT_WORKER] No queued fulfillments found');
      removeLock();
      process.exit(0);
    }

    console.log('[FULFILLMENT_WORKER] Found', fulfillments.length, 'queued fulfillments');

    // Filter to only EBOOK_GRANT type
    const ebookFulfillments = fulfillments.filter(
      (f) => f.type === 'EBOOK_GRANT' && f.grantProduct === 'ebook'
    );

    if (ebookFulfillments.length === 0) {
      console.log('[FULFILLMENT_WORKER] No eBook fulfillments to process');
      removeLock();
      process.exit(0);
    }

    console.log('[FULFILLMENT_WORKER] Processing', ebookFulfillments.length, 'eBook fulfillments');

    // Create email transporter
    const transporter = createTransporter();
    if (!transporter) {
      console.error('[FULFILLMENT_WORKER] Cannot proceed without email transporter');
      removeLock();
      process.exit(1);
    }

    // Process each fulfillment
    let successCount = 0;
    let failCount = 0;

    for (const fulfillment of ebookFulfillments) {
      const success = await processFulfillment(fulfillment, transporter);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }

      // Small delay between emails to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log('[FULFILLMENT_WORKER] Completed', {
      total: ebookFulfillments.length,
      success: successCount,
      failed: failCount,
    });
  } catch (error) {
    console.error('[FULFILLMENT_WORKER] Fatal error:', error.message, error.stack);
    process.exit(1);
  } finally {
    removeLock();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((err) => {
    console.error('[FULFILLMENT_WORKER] Unhandled error:', err);
    removeLock();
    process.exit(1);
  });
}

module.exports = { main };

