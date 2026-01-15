// deepquill/src/lib/prisma.cjs
// Singleton Prisma client with bulletproof SQLite adapter initialization
// Guarantees DATABASE_URL is always set before any Prisma operations

const path = require('path');
const Database = require('better-sqlite3');
const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');

let prismaSingleton = null;

/**
 * Determine the root database path
 * Always resolves relative to deepquill folder (process.cwd() when running from deepquill/)
 */
function getDbPath() {
  const dbPath = path.resolve(process.cwd(), 'dev.db');
  if (!dbPath || typeof dbPath !== 'string' || dbPath.trim().length === 0) {
    throw new Error(`Database path is invalid. process.cwd()=${process.cwd()}`);
  }
  return dbPath;
}

/**
 * Ensure DATABASE_URL is always set before any Prisma operations
 * This is CRITICAL - PrismaClient and adapter read it during initialization AND queries
 */
function ensureDatabaseUrl() {
  if (!process.env.DATABASE_URL || typeof process.env.DATABASE_URL !== 'string') {
    const dbPath = getDbPath();
    const databaseUrl = `file:${dbPath}`;
    process.env.DATABASE_URL = databaseUrl;
    console.log('[PRISMA] Ensured DATABASE_URL fallback:', databaseUrl);
  }
}

/**
 * Get Prisma client singleton
 * Guarantees DATABASE_URL is set before initialization and every access
 */
function getPrisma() {
  // CRITICAL: Always ensure DATABASE_URL is set BEFORE any Prisma operations
  // The adapter reads it during queries, not just initialization
  ensureDatabaseUrl();
  
  // Return singleton if already initialized
  if (prismaSingleton) {
    return prismaSingleton;
  }

  // Initialize singleton
  try {
    const dbPath = getDbPath();
    const databaseUrl = process.env.DATABASE_URL; // Should be set by ensureDatabaseUrl()
    
    // Log initialization with explicit DATABASE_URL value
    console.log('[PRISMA_INIT] DATABASE_URL =', databaseUrl);
    console.log('[PRISMA_INIT] dbPath =', dbPath);
    console.log('[PRISMA_INIT] process.cwd() =', process.cwd());
    
    // Validate DATABASE_URL is set and valid
    if (!databaseUrl || typeof databaseUrl !== 'string') {
      throw new Error(`DATABASE_URL is not set or invalid: ${String(databaseUrl)}`);
    }
    
    // Validate dbPath
    if (!dbPath || typeof dbPath !== 'string') {
      throw new Error(`Database path is not a valid string: ${String(dbPath)}`);
    }
    
    // Create better-sqlite3 Database instance
    const db = new Database(dbPath);
    
    // Create Prisma adapter (it may read DATABASE_URL internally during connect())
    const adapter = new PrismaBetterSqlite3(db);
    
    // Create PrismaClient with adapter
    // IMPORTANT: Even with adapter, PrismaClient reads DATABASE_URL internally
    // We've guaranteed it's set above, so this will never be undefined
    prismaSingleton = new PrismaClient({ adapter });
    
    // Keep DATABASE_URL set permanently - NEVER unset it
    // The adapter/client needs it for the lifetime of the process
    
    console.log('[PRISMA_INIT] ✅ Prisma client initialized successfully');
    console.log('[PRISMA_INIT] ✅ DATABASE_URL =', databaseUrl);
    
    return prismaSingleton;
  } catch (err) {
    console.error('[PRISMA_INIT] ❌ Failed to initialize Prisma client', {
      error: err.message,
      stack: err.stack,
      cwd: process.cwd(),
      databaseUrl: process.env.DATABASE_URL,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
    });
    throw err;
  }
}

module.exports = { getPrisma };

