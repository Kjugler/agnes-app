// deepquill/api/ebook-download.cjs
// Secure eBook download endpoint - verifies purchase before serving file

const express = require('express');
const path = require('path');
const fs = require('fs');
const { stripe } = require('../src/lib/stripe.cjs');
const envConfig = require('../src/config/env.cjs');

// eBook delivery mode: 'sample' serves placeholder PDF, 'production' serves real file
const EBOOK_DELIVERY_MODE = process.env.EBOOK_DELIVERY_MODE || 'production';

const router = express.Router();

/**
 * GET /api/ebook/download?session_id=...
 * 
 * Verifies Stripe session payment, then serves eBook file
 */
router.get('/download', async (req, res) => {
  try {
    const sessionId = req.query.session_id;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'session_id required' });
    }

    console.log('[ebook-download] Request received', { sessionId });

    // Retrieve Stripe session to verify purchase
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch (err) {
      console.error('[ebook-download] Failed to retrieve Stripe session', {
        sessionId,
        error: err.message,
      });
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    // Verify payment status
    if (session.payment_status !== 'paid') {
      console.warn('[ebook-download] Payment not completed', {
        sessionId,
        paymentStatus: session.payment_status,
      });
      return res.status(403).json({ error: 'Payment not completed' });
    }

    // Verify product is eBook
    const metadata = session.metadata || {};
    const product = metadata.product;
    if (product !== 'ebook' && product !== 'paperback') {
      // Paperback buyers get free eBook, so allow both
      console.warn('[ebook-download] Product mismatch', {
        sessionId,
        product,
      });
      return res.status(403).json({ error: 'This download is only available for eBook purchases' });
    }

    // Extract customer email for verification (optional - can verify via cookie in agnes-next)
    const customerEmail = session.customer_details?.email || session.customer_email;

    console.log('[ebook-download] Purchase verified', {
      sessionId,
      product,
      customerEmail: customerEmail || 'not provided',
    });

    // Determine file path based on delivery mode
    let ebookPath = null;
    
    if (EBOOK_DELIVERY_MODE === 'sample') {
      // Sample mode: serve placeholder PDF
      ebookPath = path.join(__dirname, '..', 'assets', 'ebooks', 'the-agnes-protocol-sample.pdf');
      console.log('[ebook-download] Using sample mode, serving placeholder PDF');
    } else {
      // Production mode: use configured path or fallback to real file
      ebookPath = envConfig.EBOOK_FILE_PATH;
      
      // If EBOOK_FILE_PATH is set, resolve it relative to project root
      if (ebookPath) {
        // If it's a relative path (like "assets/ebook/the-agnes-protocol.epub"), resolve from project root
        if (!path.isAbsolute(ebookPath)) {
          ebookPath = path.join(__dirname, '..', ebookPath);
        }
      }
      
      // If no path set or file doesn't exist, try fallbacks
      if (!ebookPath || !fs.existsSync(ebookPath)) {
        // Try the actual file location
        ebookPath = path.join(__dirname, '..', 'assets', 'ebook', 'the-agnes-protocol.epub');
        if (!fs.existsSync(ebookPath)) {
          // Fallback to assets/ebooks sample
          ebookPath = path.join(__dirname, '..', 'assets', 'ebooks', 'the-agnes-protocol-sample.pdf');
        }
      }
    }

    // Check if file exists
    if (!fs.existsSync(ebookPath)) {
      console.error('[ebook-download] eBook file not found', { ebookPath });
      
      // Return placeholder page if file doesn't exist
      return res.status(200).send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your eBook Download</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0a0a0a;
      color: #f5f5f5;
      font-family: Arial, Helvetica, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .container {
      max-width: 600px;
      padding: 40px;
      text-align: center;
    }
    h1 {
      font-size: 28px;
      margin-bottom: 20px;
      color: #00ff7f;
    }
    p {
      font-size: 16px;
      line-height: 1.6;
      color: #d0d0d0;
      margin-bottom: 16px;
    }
    .icon {
      font-size: 64px;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">📚</div>
    <h1>Your purchase is verified.</h1>
    <p>Your download will be available shortly.</p>
    <p>We'll email you again when it's live.</p>
    <p style="margin-top: 30px; font-size: 14px; color: #999;">
      If you have questions, contact us at <a href="mailto:hello@theagnesprotocol.com" style="color: #00ff7f;">hello@theagnesprotocol.com</a>
    </p>
  </div>
</body>
</html>
      `);
    }

    // Set headers for file download
    const filename = path.basename(ebookPath);
    // Determine content type based on file extension
    const ext = path.extname(ebookPath).toLowerCase();
    const contentType = ext === '.epub' ? 'application/epub+zip' : 
                        ext === '.pdf' ? 'application/pdf' : 
                        'application/octet-stream';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Stream file
    const fileStream = fs.createReadStream(ebookPath);
    fileStream.pipe(res);

    console.log('[ebook-download] File served', {
      sessionId,
      filename,
    });
  } catch (err) {
    console.error('[ebook-download] Error', {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ error: 'Failed to process download request' });
  }
});

module.exports = router;
