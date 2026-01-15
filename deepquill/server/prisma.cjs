// deepquill/server/prisma.cjs
// Single Prisma client singleton with better-sqlite3 adapter
// Sets DATABASE_URL explicitly BEFORE adapter initialization to prevent .replace() errors

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');

/**
 * Resolve database file path deterministically
 * Defaults to dev.db in deepquill root, or uses PRISMA_DB_PATH env var
 */
function getDbPath() {
  if (process.env.PRISMA_DB_PATH) {
    return path.resolve(process.env.PRISMA_DB_PATH);
  }
  // Default: dev.db in deepquill root (process.cwd() when running from deepquill/)
  return path.resolve(process.cwd(), 'dev.db');
}

/**
 * Build datasource URL explicitly
 * Ensures forward slashes on Windows (file:///C:/path/to/db.db)
 */
function buildDatasourceUrl(dbPath) {
  // Normalize path separators to forward slashes for datasource URL
  const normalizedPath = dbPath.replace(/\\/g, '/');
  return `file:${normalizedPath}`;
}

// Initialize singleton
const dbPath = getDbPath();
const datasourceUrl = buildDatasourceUrl(dbPath);

// CRITICAL: Set DATABASE_URL BEFORE creating the adapter
// The adapter reads DATABASE_URL from process.env during connect(), and if it's undefined,
// it tries to call .replace() on undefined, which crashes
// NOTE: process.env doesn't accept getter/setter descriptors, so we must set it directly
// We'll set it MULTIPLE times to ensure it's always available
process.env.DATABASE_URL = datasourceUrl;
if (typeof globalThis !== 'undefined') {
  globalThis.DATABASE_URL = datasourceUrl;
}

// CRITICAL: Use setInterval to continuously ensure DATABASE_URL is set
// This is a workaround for the adapter reading DATABASE_URL during async operations
// We'll check every 100ms and reset it if it's been cleared
const DATABASE_URL_WATCHDOG = setInterval(() => {
  if (process.env.DATABASE_URL !== datasourceUrl) {
    process.env.DATABASE_URL = datasourceUrl;
    if (typeof globalThis !== 'undefined') {
      globalThis.DATABASE_URL = datasourceUrl;
    }
  }
}, 100);

// Store the interval ID so we can clear it if needed (though we probably won't)
if (typeof globalThis !== 'undefined') {
  globalThis.__deepquillDatabaseUrlWatchdog = DATABASE_URL_WATCHDOG;
}

// Create singleton PrismaClient with adapter
// Use globalThis to persist across hot-reloads in dev
if (!globalThis.__deepquillPrisma) {
  // CRITICAL: DATABASE_URL MUST be set before creating the adapter
  // The adapter reads DATABASE_URL from process.env during connect()
  // We ensure it's set before every operation via the Proxy wrapper below
  
  // CRITICAL: Ensure DATABASE_URL is set RIGHT NOW before creating adapter
  process.env.DATABASE_URL = datasourceUrl;
  if (typeof globalThis !== 'undefined') {
    globalThis.DATABASE_URL = datasourceUrl;
  }
  
  // Create Prisma adapter factory with correct config
  // PrismaBetterSqlite3 is actually PrismaBetterSqlite3AdapterFactory
  // It expects (config, options) where config MUST have a 'url' property
  // The factory's connect() method calls createBetterSQLite3Client(this.#config)
  // So we MUST pass { url: datasourceUrl } in the config to prevent .replace() error
  const adapter = new PrismaBetterSqlite3(
    { url: datasourceUrl }, // CRITICAL: Config must include url (this becomes this.#config)
    {} // Options (empty for now)
  );
  
  // Patch the factory's connect() method to ensure DATABASE_URL is set
  // Even though we passed url in config, we'll ensure it's set in env too
  const originalFactoryConnect = adapter.connect.bind(adapter);
  adapter.connect = function(...args) {
    // Ensure DATABASE_URL is set before connect()
    process.env.DATABASE_URL = datasourceUrl;
    if (typeof globalThis !== 'undefined') {
      globalThis.DATABASE_URL = datasourceUrl;
    }
    
    // Call original connect - it should work because this.#config.url is set
    const result = originalFactoryConnect(...args);
    
    if (result && typeof result.then === 'function') {
      return result.then(
        (value) => {
          process.env.DATABASE_URL = datasourceUrl;
          return value;
        },
        (error) => {
          process.env.DATABASE_URL = datasourceUrl;
          throw error;
        }
      );
    }
    return result;
  };
  
  // Create PrismaClient with adapter
  // CRITICAL: PrismaClient constructor AND adapter factory read DATABASE_URL internally
  // We MUST ensure it's set before creating PrismaClient
  // Set it MULTIPLE times to ensure it's available even during async operations
  process.env.DATABASE_URL = datasourceUrl;
  process.env.DATABASE_URL = datasourceUrl; // Set twice to be extra sure
  if (typeof globalThis !== 'undefined') {
    globalThis.DATABASE_URL = datasourceUrl;
    globalThis.DATABASE_URL = datasourceUrl; // Set twice to be extra sure
  }
  
  // CRITICAL: Use a synchronous wrapper to ensure DATABASE_URL is set during PrismaClient construction
  // PrismaClient constructor might read DATABASE_URL asynchronously, so we need to ensure it's set
  let prismaClient;
  try {
    // Set DATABASE_URL synchronously right before PrismaClient constructor
    process.env.DATABASE_URL = datasourceUrl;
    prismaClient = new PrismaClient({ adapter });
  } finally {
    // Ensure DATABASE_URL is STILL set after PrismaClient creation
    process.env.DATABASE_URL = datasourceUrl;
    if (typeof globalThis !== 'undefined') {
      globalThis.DATABASE_URL = datasourceUrl;
    }
  }
  
  globalThis.__deepquillPrisma = prismaClient;
  
  console.log('[PRISMA_SINGLETON] ✅ Initialized with better-sqlite3 adapter');
  console.log('[PRISMA_SINGLETON] DATABASE_URL =', datasourceUrl);
  console.log('[PRISMA_SINGLETON] process.env.DATABASE_URL =', process.env.DATABASE_URL);
  console.log('[PRISMA_SINGLETON] dbPath =', dbPath);
  console.log('[PRISMA_SINGLETON] dbExists =', fs.existsSync(dbPath));
}

// CRITICAL: Create a Proxy wrapper that ensures DATABASE_URL is set before ANY property access
// This catches all Prisma operations (user.findUnique, purchase.create, etc.)
// and ensures DATABASE_URL is set before the adapter tries to connect
const prismaRaw = globalThis.__deepquillPrisma;

// Proxy wrapper to ensure DATABASE_URL is always set before Prisma operations
// This is CRITICAL because the adapter reads DATABASE_URL during async connect() calls
const prisma = new Proxy(prismaRaw, {
  get(target, prop) {
    // Before ANY property access, ensure DATABASE_URL is set
    process.env.DATABASE_URL = datasourceUrl;
    if (typeof globalThis !== 'undefined') {
      globalThis.DATABASE_URL = datasourceUrl;
    }
    
    const value = target[prop];
    
    // Special handling for Prisma's transaction and query methods
    if (prop === '$transaction' || prop === '$queryRaw' || prop === '$queryRawUnsafe' || prop === '$executeRaw' || prop === '$executeRawUnsafe') {
      return function(...args) {
        // Ensure DATABASE_URL is set right before the transaction/query
        process.env.DATABASE_URL = datasourceUrl;
        if (typeof globalThis !== 'undefined') {
          globalThis.DATABASE_URL = datasourceUrl;
        }
        return value.apply(target, args);
      };
    }
    
    // If it's a function (like user.findUnique, purchase.create, etc.), wrap it
    if (typeof value === 'function') {
      return function(...args) {
        // Ensure DATABASE_URL is set right before the function call
        // This is critical because the adapter reads it during async connect()
        process.env.DATABASE_URL = datasourceUrl;
        if (typeof globalThis !== 'undefined') {
          globalThis.DATABASE_URL = datasourceUrl;
        }
        return value.apply(target, args);
      };
    }
    
    // If it's an object (like prisma.user, prisma.purchase), return a Proxy for that too
    if (value && typeof value === 'object' && value !== null) {
      return new Proxy(value, {
        get(objTarget, objProp) {
          // Ensure DATABASE_URL is set before accessing nested properties
          process.env.DATABASE_URL = datasourceUrl;
          if (typeof globalThis !== 'undefined') {
            globalThis.DATABASE_URL = datasourceUrl;
          }
          const objValue = objTarget[objProp];
          // If it's a function, wrap it too
          if (typeof objValue === 'function') {
            return function(...args) {
              process.env.DATABASE_URL = datasourceUrl;
              if (typeof globalThis !== 'undefined') {
                globalThis.DATABASE_URL = datasourceUrl;
              }
              return objValue.apply(objTarget, args);
            };
          }
          return objValue;
        }
      });
    }
    
    return value;
  }
});

// Helper function to ensure DATABASE_URL is set (call before any Prisma query)
// CRITICAL: The adapter reads DATABASE_URL during async connect() calls
// We must ensure it's ALWAYS set, even if something clears process.env
function ensureDatabaseUrl() {
  // Always set it unconditionally - the adapter might read it at any time during async operations
  // Set it MULTIPLE times to ensure it's available even during async operations
  process.env.DATABASE_URL = datasourceUrl;
  process.env.DATABASE_URL = datasourceUrl; // Set twice to be extra sure
  if (typeof globalThis !== 'undefined') {
    globalThis.DATABASE_URL = datasourceUrl;
    globalThis.DATABASE_URL = datasourceUrl; // Set twice to be extra sure
  }
  
  // Also set it on process itself as a backup
  if (process.DATABASE_URL !== datasourceUrl) {
    process.DATABASE_URL = datasourceUrl;
  }
}

// CRITICAL: Wrap all Prisma operations to ensure DATABASE_URL is set
// This function wraps any Prisma query/operation to ensure DATABASE_URL is set before execution
function withDatabaseUrl(fn) {
  return async function(...args) {
    // Set DATABASE_URL synchronously before the function
    ensureDatabaseUrl();
    // Also set it right before awaiting (in case of async operations)
    const result = fn.apply(this, args);
    if (result && typeof result.then === 'function') {
      // If it's a Promise, ensure DATABASE_URL is set during its execution
      return result.then(
        (value) => {
          ensureDatabaseUrl();
          return value;
        },
        (error) => {
          ensureDatabaseUrl();
          throw error;
        }
      );
    }
    return result;
  };
}

module.exports = { prisma, dbPath, datasourceUrl, ensureDatabaseUrl, withDatabaseUrl };
