// deepquill/server/prisma.cjs
// Prisma client singleton for deepquill

const path = require('path');
const fs = require('fs');

// Ensure DATABASE_URL is set
function ensureDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    // Default to dev.db in deepquill directory
    const dbPath = path.join(__dirname, '..', 'dev.db');
    process.env.DATABASE_URL = `file:${dbPath}`;
  }
}

// Initialize DATABASE_URL on module load
ensureDatabaseUrl();

const datasourceUrl = process.env.DATABASE_URL;
const dbPath = datasourceUrl.startsWith('file:') 
  ? datasourceUrl.replace('file:', '') 
  : null;

let prisma = null;

try {
  // Load Prisma Client
  const { PrismaClient } = require('@prisma/client');
  
  // Ensure DATABASE_URL is set before creating client
  ensureDatabaseUrl();
  
  // Force PrismaClient to use the env DATABASE_URL explicitly
  const finalDatasourceUrl = process.env.DATABASE_URL;
  
  // Create Prisma Client (standard local SQLite setup)
  prisma = globalThis.__prisma || new PrismaClient({
    datasourceUrl: finalDatasourceUrl,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
  
  // Reuse client across hot-reloads in dev
  if (process.env.NODE_ENV !== 'production') {
    globalThis.__prisma = prisma;
  }
  
  // Test connection (non-blocking, but log success)
  prisma.$connect()
    .then(() => {
      console.log('[PRISMA] ✅ Connected', { datasourceUrl, dbExists: dbPath ? fs.existsSync(dbPath) : 'unknown' });
    })
    .catch((err) => {
      console.warn('[PRISMA] Connection test failed:', err.message);
    });
  
} catch (error) {
  // Module not found or other initialization errors
  if (error.code === 'MODULE_NOT_FOUND') {
    console.error('[PRISMA] ❌ @prisma/client not installed');
    console.error('[PRISMA] Run: cd deepquill && npm install @prisma/client prisma && npx prisma generate');
  } else {
    console.error('[PRISMA] ❌ Failed to initialize:', error.message);
  }
  prisma = null;
}

module.exports = {
  prisma,
  datasourceUrl,
  dbPath,
  ensureDatabaseUrl,
};
