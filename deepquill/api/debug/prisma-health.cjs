// deepquill/api/debug/prisma-health.cjs
// Dev-only health check endpoint to verify Prisma is working

const express = require('express');
const router = express.Router();
const { prisma, datasourceUrl } = require('../../server/prisma.cjs');

router.get('/prisma-health', async (req, res) => {
  // Dev-only endpoint
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    // Simple health check: count users
    const userCount = await prisma.user.count();
    
    return res.json({
      ok: true,
      userCount,
      databaseUrl: process.env.DATABASE_URL || datasourceUrl,
      prismaAvailable: true,
    });
  } catch (err) {
    console.error('[DEBUG] Prisma health check failed:', err);
    return res.status(500).json({
      ok: false,
      error: err.message,
      databaseUrl: process.env.DATABASE_URL || datasourceUrl,
      prismaAvailable: false,
    });
  }
});

module.exports = router;

