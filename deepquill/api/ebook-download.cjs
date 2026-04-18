// deepquill/api/ebook-download.cjs
// Secure eBook download: token (fulfillment email) or session_id (purchase email / thank-you page)

const express = require('express');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { verifyToken } = require('../src/lib/fulfillmentToken.cjs');
const envConfig = require('../src/config/env.cjs');
const { stripe } = require('../src/lib/stripe.cjs');

const router = express.Router();

function getContentTypeForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.epub') return 'application/epub+zip';
  if (ext === '.mobi') return 'application/x-mobipocket-ebook';
  return 'application/octet-stream';
}

function getExpectedInternalProxySecret() {
  const raw = process.env.INTERNAL_PROXY_SECRET;
  if (raw == null) return '';
  return String(raw).trim();
}

function normalizeSessionId(raw) {
  let sessionId = raw;
  if (sessionId && typeof sessionId === 'string') {
    const match = sessionId.match(/^([^?&]+)/);
    if (match) sessionId = match[1];
    sessionId = sessionId.trim();
  }
  if (sessionId && sessionId.length > 66) {
    sessionId = sessionId.substring(0, 66);
  }
  return sessionId;
}

async function resolveProductTypeFromStripeSession(sessionId) {
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['customer', 'payment_intent'],
  });

  let productType = session.metadata?.product || null;

  if (!productType) {
    let lineItems = null;
    try {
      lineItems = await stripe.checkout.sessions.listLineItems(sessionId, {
        expand: ['data.price'],
      });
    } catch (err) {
      console.warn('[EBOOK_DOWNLOAD_SESSION] listLineItems failed', { error: err?.message });
    }
    const priceId = lineItems?.data?.[0]?.price?.id;
    if (priceId) {
      if (priceId === envConfig.STRIPE_PRICE_PAPERBACK) productType = 'paperback';
      else if (priceId === envConfig.STRIPE_PRICE_EBOOK) productType = 'ebook';
      else if (priceId === envConfig.STRIPE_PRICE_AUDIO_PREORDER) productType = 'audio_preorder';
    }
  }

  return { session, productType };
}

const EBOOK_ATTACHMENT_NAME = 'the-agnes-protocol.epub';

function setDownloadHeaders(res, { contentType, contentLength, contentDisposition }) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', contentDisposition);
  if (contentLength != null && contentLength !== '') {
    res.setHeader('Content-Length', String(contentLength));
  }
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

/**
 * Stream EPUB from Vercel Blob (or any HTTPS URL). Preferred when EBOOK_FILE_URL is set.
 */
async function streamEbookFromBlobUrl(res, url, logPayload) {
  let response;
  try {
    response = await fetch(url, { redirect: 'follow', cache: 'no-store' });
  } catch (err) {
    console.error('[EBOOK_DOWNLOAD] fetch failed:', err?.message);
    if (!res.headersSent) {
      return res.status(502).json({ error: 'EBook source unavailable' });
    }
    return;
  }

  if (!response.ok) {
    console.error('[EBOOK_DOWNLOAD] blob HTTP error', { status: response.status, url: url.slice(0, 80) });
    if (!res.headersSent) {
      return res.status(502).json({ error: 'EBook source unavailable' });
    }
    return;
  }

  const len = response.headers.get('content-length');
  setDownloadHeaders(res, {
    contentType: 'application/epub+zip',
    contentLength: len,
    contentDisposition: `attachment; filename="${EBOOK_ATTACHMENT_NAME}"`,
  });

  console.log('[EBOOK_DOWNLOAD]', {
    ...logPayload,
    source: 'EBOOK_FILE_URL',
    fileName: EBOOK_ATTACHMENT_NAME,
    fileSize: len ? Number(len) : undefined,
    contentType: 'application/epub+zip',
  });

  if (!response.body) {
    if (!res.headersSent) {
      return res.status(502).json({ error: 'EBook source empty' });
    }
    return;
  }

  try {
    const nodeReadable = Readable.fromWeb(response.body);
    nodeReadable.pipe(res);
    nodeReadable.on('error', (err) => {
      console.error('[EBOOK_DOWNLOAD] Blob stream error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream error' });
      } else {
        res.destroy(err);
      }
    });
  } catch (err) {
    console.error('[EBOOK_DOWNLOAD] fromWeb failed:', err?.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Stream setup failed' });
    }
  }
}

function streamEbookFile(res, filePath, logPayload) {
  if (!filePath || !fs.existsSync(filePath)) {
    console.error('[EBOOK_DOWNLOAD] File not found:', filePath);
    return res.status(500).json({ error: 'EBook file not available' });
  }

  const stats = fs.statSync(filePath);
  const fileSize = stats.size;
  const contentType = getContentTypeForFile(filePath);
  const fileName =
    path.extname(filePath).toLowerCase() === '.epub' ? EBOOK_ATTACHMENT_NAME : path.basename(filePath);

  setDownloadHeaders(res, {
    contentType,
    contentLength: fileSize,
    contentDisposition: `attachment; filename="${fileName}"`,
  });

  console.log('[EBOOK_DOWNLOAD]', { ...logPayload, source: 'EBOOK_FILE_PATH', fileName, fileSize, contentType });

  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);

  fileStream.on('error', (err) => {
    console.error('[EBOOK_DOWNLOAD] Stream error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'File read error' });
    }
  });
}

/**
 * If EBOOK_FILE_URL is set, stream from remote; else local EBOOK_FILE_PATH.
 */
async function deliverEbook(res, logPayload) {
  const blobUrl = envConfig.EBOOK_FILE_URL;
  if (blobUrl) {
    await streamEbookFromBlobUrl(res, blobUrl, logPayload);
    return;
  }
  streamEbookFile(res, envConfig.EBOOK_FILE_PATH, logPayload);
}

/**
 * GET /api/ebook/download?token=...
 *
 * Validates token and streams eBook file (paperback fulfillment emails).
 */
router.get('/ebook/download', async (req, res) => {
  try {
    const token = req.query.token;

    if (!token) {
      return res.status(401).json({ error: 'Token required' });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    await deliverEbook(res, {
      mode: 'token',
      email: payload.email,
      sessionId: payload.sessionId,
    });
  } catch (err) {
    console.error('[EBOOK_DOWNLOAD] Error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download error' });
    }
  }
});

/**
 * GET /api/ebook/download-by-session?session_id=...
 *
 * Validates Stripe Checkout session (paid ebook or paperback bundle) and streams the same file.
 * Intended to be called only from agnes-next (x-internal-proxy when INTERNAL_PROXY_SECRET is set).
 */
router.get('/ebook/download-by-session', async (req, res) => {
  try {
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
        '[ebook-download-by-session] proxy secret mismatch (dev: request allowed). Align INTERNAL_PROXY_SECRET on agnes-next and deepquill.'
      );
    }

    let sessionId = req.query.session_id || req.query.sessionId;
    sessionId = normalizeSessionId(sessionId);

    if (!sessionId || typeof sessionId !== 'string' || sessionId.length === 0) {
      return res.status(400).json({ ok: false, error: 'session_id required' });
    }

    const { session, productType } = await resolveProductTypeFromStripeSession(sessionId);

    const paid = session.payment_status === 'paid';
    if (!paid) {
      return res.status(403).json({ ok: false, error: 'payment_not_completed' });
    }

    if (productType !== 'ebook' && productType !== 'paperback') {
      return res.status(403).json({ ok: false, error: 'ebook_not_entitled' });
    }

    await deliverEbook(res, {
      mode: 'session',
      sessionId: session.id,
      productType,
      customerEmail: session.customer_details?.email || session.customer_email,
    });
  } catch (err) {
    console.error('[EBOOK_DOWNLOAD_SESSION] Error:', err?.message);
    if (err?.type === 'StripeInvalidRequestError') {
      return res.status(404).json({ ok: false, error: 'session_not_found', message: err.message });
    }
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: 'download_error', message: err?.message || 'Unknown error' });
    }
  }
});

module.exports = router;

