// deepquill/api/ebook-download.cjs
// Secure eBook download endpoint with token validation

const express = require('express');
const fs = require('fs');
const path = require('path');
const { verifyToken } = require('../src/lib/fulfillmentToken.cjs');
const envConfig = require('../src/config/env.cjs');

const router = express.Router();

/**
 * GET /api/ebook/download?token=...
 * 
 * Validates token and streams eBook file
 */
router.get('/ebook/download', async (req, res) => {
  try {
    const token = req.query.token;

    if (!token) {
      return res.status(401).json({ error: 'Token required' });
    }

    // Verify token
    const payload = verifyToken(token);
    if (!payload) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    // Check if file exists
    const filePath = envConfig.EBOOK_FILE_PATH;
    if (!filePath || !fs.existsSync(filePath)) {
      console.error('[EBOOK_DOWNLOAD] File not found:', filePath);
      return res.status(500).json({ error: 'EBook file not available' });
    }

    // Get file stats
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    const fileName = path.basename(filePath);

    // Set headers for file download
    res.setHeader('Content-Type', 'application/epub+zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Log download (for audit)
    console.log('[EBOOK_DOWNLOAD]', {
      email: payload.email,
      sessionId: payload.sessionId,
      fileName,
      fileSize,
    });

    // Stream file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on('error', (err) => {
      console.error('[EBOOK_DOWNLOAD] Stream error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'File read error' });
      }
    });
  } catch (err) {
    console.error('[EBOOK_DOWNLOAD] Error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download error' });
    }
  }
});

module.exports = router;

