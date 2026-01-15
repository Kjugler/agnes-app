#!/usr/bin/env node
/**
 * DB Inspection Script
 * Finds and inspects all SQLite databases in the repo
 */

const fs = require('fs');
const path = require('path');

// Try to load better-sqlite3
let Database = null;
let sqliteAvailable = false;

try {
  // Try from deepquill first (most likely to have it)
  const deepquillPath = path.join(__dirname, '..', 'deepquill', 'node_modules', 'better-sqlite3');
  if (fs.existsSync(deepquillPath)) {
    Database = require(deepquillPath);
    sqliteAvailable = true;
    console.log('[INFO] Using better-sqlite3 from deepquill/node_modules\n');
  } else {
    // Try from root node_modules
    Database = require('better-sqlite3');
    sqliteAvailable = true;
    console.log('[INFO] Using better-sqlite3 from root node_modules\n');
  }
} catch (err) {
  console.error('[ERROR] Could not load better-sqlite3');
  console.error('Please run: cd deepquill && npm install');
  process.exit(1);
}

const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * Recursively find all .db, .sqlite, .sqlite3 files
 */
function findDatabaseFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules and .git
      if (file !== 'node_modules' && file !== '.git' && !file.startsWith('.')) {
        findDatabaseFiles(filePath, fileList);
      }
    } else if (file.match(/\.(db|sqlite|sqlite3)$/i)) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

/**
 * Inspect a single database file
 */
function inspectDatabase(dbPath) {
  const result = {
    path: dbPath,
    isValid: false,
    tables: [],
    counts: {
      User: null,
      Purchase: null,
      ReferralConversion: null,
    },
  };
  
  try {
    const db = new Database(dbPath, { readonly: true });
    
    // Get all tables
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all();
    
    result.tables = tables.map(t => t.name);
    result.isValid = true;
    
    // Count rows in key tables
    const keyTables = ['User', 'Purchase', 'ReferralConversion'];
    keyTables.forEach(tableName => {
      if (result.tables.includes(tableName)) {
        try {
          const count = db.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get();
          result.counts[tableName] = count.count;
        } catch (err) {
          result.counts[tableName] = 'ERROR';
        }
      }
    });
    
    db.close();
  } catch (err) {
    result.error = err.message;
  }
  
  return result;
}

/**
 * Read .env file and extract DATABASE_URL
 */
function readEnvFile(envPath) {
  const results = [];
  
  if (!fs.existsSync(envPath)) {
    return results;
  }
  
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      const match = line.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/);
      if (match) {
        let dbUrl = match[1].trim();
        // Remove quotes if present
        dbUrl = dbUrl.replace(/^["']|["']$/g, '');
        results.push({
          file: envPath,
          line: index + 1,
          value: dbUrl,
        });
      }
    });
  } catch (err) {
    // Ignore read errors
  }
  
  return results;
}

/**
 * Resolve a DATABASE_URL to an absolute path
 */
function resolveDatabaseUrl(dbUrl, envFileDir) {
  if (!dbUrl) return null;
  
  // Handle file: protocol
  if (dbUrl.startsWith('file:')) {
    let filePath = dbUrl.replace(/^file:/, '');
    
    // Remove query params if present
    filePath = filePath.split('?')[0];
    
    // Handle relative paths
    if (filePath.startsWith('./') || filePath.startsWith('../') || !path.isAbsolute(filePath)) {
      filePath = path.resolve(envFileDir, filePath);
    }
    
    // Normalize path separators for Windows
    return path.normalize(filePath);
  }
  
  // If it's already an absolute path (Windows)
  if (path.isAbsolute(dbUrl)) {
    return path.normalize(dbUrl);
  }
  
  // Try relative to env file directory
  return path.resolve(envFileDir, dbUrl);
}

// Main execution
console.log('='.repeat(80));
console.log('DATABASE FORENSICS REPORT');
console.log('='.repeat(80));
console.log();

// Step 1: Find all database files
console.log('Step 1: Searching for database files...');
const dbFiles = findDatabaseFiles(REPO_ROOT);
console.log(`Found ${dbFiles.length} database file(s):\n`);
dbFiles.forEach((file, idx) => {
  const relPath = path.relative(REPO_ROOT, file);
  const size = fs.statSync(file).size;
  console.log(`  ${idx + 1}. ${relPath} (${(size / 1024).toFixed(2)} KB)`);
});
console.log();

// Step 2: Read .env files for DATABASE_URL
console.log('Step 2: Reading DATABASE_URL from .env files...\n');
const envFiles = [
  path.join(REPO_ROOT, 'deepquill', '.env'),
  path.join(REPO_ROOT, 'deepquill', '.env.local'),
  path.join(REPO_ROOT, 'agnes-next', '.env'),
  path.join(REPO_ROOT, 'agnes-next', '.env.local'),
];

const envDbUrls = [];
envFiles.forEach(envFile => {
  const relPath = path.relative(REPO_ROOT, envFile);
  const urls = readEnvFile(envFile);
  if (urls.length > 0) {
    urls.forEach(url => {
      const resolved = resolveDatabaseUrl(url.value, path.dirname(envFile));
      envDbUrls.push({
        source: relPath,
        raw: url.value,
        resolved: resolved,
      });
    });
  }
});

if (envDbUrls.length > 0) {
  console.log('Found DATABASE_URL entries:');
  envDbUrls.forEach((entry, idx) => {
    console.log(`  ${idx + 1}. ${entry.source}`);
    console.log(`     Raw: ${entry.raw}`);
    console.log(`     Resolved: ${entry.resolved || '(could not resolve)'}`);
    console.log();
  });
} else {
  console.log('  No DATABASE_URL found in .env files\n');
}

// Step 3: Inspect each database
console.log('Step 3: Inspecting databases...\n');
const inspections = dbFiles.map(dbPath => inspectDatabase(dbPath));

// Step 4: Print summary table
console.log('='.repeat(80));
console.log('SUMMARY TABLE');
console.log('='.repeat(80));
console.log();

// Calculate column widths
const colWidths = {
  path: 50,
  tables: 8,
  hasUser: 10,
  userCount: 12,
  purchaseCount: 14,
  referralCount: 18,
};

// Print header
const header = [
  'DB Path'.padEnd(colWidths.path),
  'Tables'.padEnd(colWidths.tables),
  'Has User'.padEnd(colWidths.hasUser),
  'User Count'.padEnd(colWidths.userCount),
  'Purchase Count'.padEnd(colWidths.purchaseCount),
  'ReferralConversion'.padEnd(colWidths.referralCount),
].join(' | ');
console.log(header);
console.log('-'.repeat(header.length));

// Print rows
inspections.forEach(inspection => {
  const relPath = path.relative(REPO_ROOT, inspection.path);
  const displayPath = relPath.length > colWidths.path - 3 
    ? '...' + relPath.slice(-(colWidths.path - 3))
    : relPath;
  
  const tablesCount = inspection.isValid ? inspection.tables.length : 'ERROR';
  const hasUser = inspection.isValid && inspection.tables.includes('User') ? 'Y' : 'N';
  const userCount = inspection.counts.User !== null 
    ? String(inspection.counts.User) 
    : (inspection.isValid ? 'MISSING' : 'ERROR');
  const purchaseCount = inspection.counts.Purchase !== null 
    ? String(inspection.counts.Purchase) 
    : (inspection.isValid ? 'MISSING' : 'ERROR');
  const referralCount = inspection.counts.ReferralConversion !== null 
    ? String(inspection.counts.ReferralConversion) 
    : (inspection.isValid ? 'MISSING' : 'ERROR');
  
  const row = [
    displayPath.padEnd(colWidths.path),
    String(tablesCount).padEnd(colWidths.tables),
    hasUser.padEnd(colWidths.hasUser),
    userCount.padEnd(colWidths.userCount),
    purchaseCount.padEnd(colWidths.purchaseCount),
    referralCount.padEnd(colWidths.referralCount),
  ].join(' | ');
  
  console.log(row);
});

console.log();

// Step 5: Detailed table listing
console.log('='.repeat(80));
console.log('DETAILED TABLE LISTS');
console.log('='.repeat(80));
console.log();

inspections.forEach(inspection => {
  const relPath = path.relative(REPO_ROOT, inspection.path);
  console.log(`${relPath}:`);
  if (!inspection.isValid) {
    console.log(`  ERROR: ${inspection.error || 'Invalid database'}`);
  } else if (inspection.tables.length === 0) {
    console.log('  (empty database)');
  } else {
    inspection.tables.forEach(table => {
      const count = inspection.counts[table];
      if (count !== null && count !== undefined) {
        console.log(`  - ${table}: ${count} rows`);
      } else {
        console.log(`  - ${table}`);
      }
    });
  }
  console.log();
});

// Step 6: Recommendations
console.log('='.repeat(80));
console.log('RECOMMENDATIONS');
console.log('='.repeat(80));
console.log();

// Find databases with historical data
const databasesWithData = inspections.filter(insp => 
  insp.isValid && (
    (insp.counts.User !== null && insp.counts.User > 0) ||
    (insp.counts.Purchase !== null && insp.counts.Purchase > 0) ||
    (insp.counts.ReferralConversion !== null && insp.counts.ReferralConversion > 0)
  )
);

if (databasesWithData.length === 0) {
  console.log('❌ No database contains historical data.');
  console.log('   Recommendation: This is a clean reset. Recommend seeding with test data.');
} else {
  // Find the database with the most data
  const richestDb = databasesWithData.reduce((max, db) => {
    const maxTotal = (max.counts.User || 0) + (max.counts.Purchase || 0) + (max.counts.ReferralConversion || 0);
    const dbTotal = (db.counts.User || 0) + (db.counts.Purchase || 0) + (db.counts.ReferralConversion || 0);
    return dbTotal > maxTotal ? db : max;
  });
  
  const richestPath = path.relative(REPO_ROOT, richestDb.path);
  console.log(`✅ Historical data found in: ${richestPath}`);
  console.log(`   - Users: ${richestDb.counts.User || 0}`);
  console.log(`   - Purchases: ${richestDb.counts.Purchase || 0}`);
  console.log(`   - ReferralConversions: ${richestDb.counts.ReferralConversion || 0}`);
  console.log();
  
  // Check what deepquill is using
  const deepquillEnv = envDbUrls.find(e => e.source.includes('deepquill'));
  if (deepquillEnv && deepquillEnv.resolved) {
    const deepquillDbPath = path.normalize(deepquillEnv.resolved);
    const deepquillDb = inspections.find(insp => 
      path.normalize(insp.path) === deepquillDbPath
    );
    
    if (deepquillDb) {
      const deepquillRelPath = path.relative(REPO_ROOT, deepquillDb.path);
      console.log(`📌 Deepquill is using: ${deepquillRelPath}`);
      
      if (path.normalize(richestDb.path) === deepquillDbPath) {
        console.log('   ✅ Deepquill is already using the database with historical data!');
      } else {
        console.log('   ⚠️  Deepquill is NOT using the database with historical data.');
        console.log(`   Recommendation: Repoint deepquill DATABASE_URL to: ${richestPath}`);
      }
    } else {
      console.log(`📌 Deepquill DATABASE_URL points to: ${deepquillEnv.resolved}`);
      console.log('   ⚠️  This file was not found in the scan.');
    }
  } else {
    console.log('📌 Deepquill DATABASE_URL: Not found or could not be resolved');
  }
  
  console.log();
  
  // Check agnes-next
  const agnesNextEnv = envDbUrls.find(e => e.source.includes('agnes-next'));
  if (agnesNextEnv && agnesNextEnv.resolved) {
    const agnesNextDbPath = path.normalize(agnesNextEnv.resolved);
    const agnesNextDb = inspections.find(insp => 
      path.normalize(insp.path) === agnesNextDbPath
    );
    
    if (agnesNextDb) {
      const agnesNextRelPath = path.relative(REPO_ROOT, agnesNextDb.path);
      console.log(`📌 Agnes-next is using: ${agnesNextRelPath}`);
    } else {
      console.log(`📌 Agnes-next DATABASE_URL points to: ${agnesNextEnv.resolved}`);
      console.log('   ⚠️  This file was not found in the scan.');
    }
  }
}

console.log();
console.log('='.repeat(80));

