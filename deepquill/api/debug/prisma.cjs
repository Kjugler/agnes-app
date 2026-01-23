// deepquill/api/debug/prisma.cjs
// Dev-only debug endpoint to list tables and show DB path

const { prisma } = require('../../server/prisma.cjs');

module.exports = async function handler(req, res) {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).end();
  }

  try {
    const tables = await prisma.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
    );
    res.json({
      cwd: process.cwd(),
      databaseUrl: process.env.DATABASE_URL,
      tables,
    });
  } catch (e) {
    res.status(500).json({
      cwd: process.cwd(),
      databaseUrl: process.env.DATABASE_URL,
      error: String(e?.message || e),
    });
  }
};
