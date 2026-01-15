#!/usr/bin/env node
/**
 * One-Time Merge: Historical DB → deepquill/dev.db
 * Merges users and referral conversions from agnes-next/prisma/prisma/dev.db
 * into deepquill/dev.db while preserving existing purchases.
 */

const fs = require('fs');
const path = require('path');

// Load better-sqlite3
let Database = null;
try {
  const deepquillPath = path.join(__dirname, '..', 'deepquill', 'node_modules', 'better-sqlite3');
  if (fs.existsSync(deepquillPath)) {
    Database = require(deepquillPath);
  } else {
    Database = require('better-sqlite3');
  }
} catch (err) {
  console.error('[ERROR] Could not load better-sqlite3');
  console.error('Please run: cd deepquill && npm install');
  process.exit(1);
}

const REPO_ROOT = path.resolve(__dirname, '..');
const SOURCE_DB = path.join(REPO_ROOT, 'agnes-next', 'prisma', 'prisma', 'dev.db');
const TARGET_DB = path.join(REPO_ROOT, 'deepquill', 'dev.db');

// Create timestamped backup filename
function createBackupPath(targetPath) {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.dirname(targetPath);
  const basename = path.basename(targetPath, path.extname(targetPath));
  const ext = path.extname(targetPath);
  return path.join(dir, `${basename}.backup.${timestamp}${ext}`);
}

// Get table schema info
function getTableInfo(db, tableName) {
  try {
    const info = db.prepare(`PRAGMA table_info("${tableName}")`).all();
    return {
      columns: info.map(col => ({
        name: col.name,
        type: col.type,
        notnull: col.notnull === 1,
        dflt_value: col.dflt_value,
        pk: col.pk === 1,
      })),
      primaryKey: info.filter(col => col.pk === 1).map(col => col.name),
    };
  } catch (err) {
    return null;
  }
}

// Get all tables in a database
function getTables(db) {
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'
    ORDER BY name
  `).all();
  return tables.map(t => t.name);
}

// Get common columns between two schemas
function getCommonColumns(sourceInfo, targetInfo) {
  const sourceCols = new Set(sourceInfo.columns.map(c => c.name));
  const targetCols = new Set(targetInfo.columns.map(c => c.name));
  const common = Array.from(sourceCols).filter(col => targetCols.has(col));
  
  return common.map(colName => {
    const sourceCol = sourceInfo.columns.find(c => c.name === colName);
    const targetCol = targetInfo.columns.find(c => c.name === colName);
    return {
      name: colName,
      source: sourceCol,
      target: targetCol,
    };
  });
}

// Main merge function
function mergeDatabases() {
  console.log('='.repeat(80));
  console.log('DATABASE MERGE: Historical → Deepquill');
  console.log('='.repeat(80));
  console.log();
  console.log(`Source: ${path.relative(REPO_ROOT, SOURCE_DB)}`);
  console.log(`Target: ${path.relative(REPO_ROOT, TARGET_DB)}`);
  console.log();

  // Verify files exist
  if (!fs.existsSync(SOURCE_DB)) {
    console.error(`[ERROR] Source database not found: ${SOURCE_DB}`);
    process.exit(1);
  }
  if (!fs.existsSync(TARGET_DB)) {
    console.error(`[ERROR] Target database not found: ${TARGET_DB}`);
    process.exit(1);
  }

  // Open databases
  const sourceDb = new Database(SOURCE_DB, { readonly: true });
  const targetDb = new Database(TARGET_DB);

  try {
    // Step 1: Create backup
    console.log('Step 1: Creating backup...');
    const backupPath = createBackupPath(TARGET_DB);
    fs.copyFileSync(TARGET_DB, backupPath);
    console.log(`✅ Backup created: ${path.relative(REPO_ROOT, backupPath)}`);
    console.log();

    // Step 2: Discover tables
    console.log('Step 2: Discovering tables...');
    const sourceTables = getTables(sourceDb);
    const targetTables = getTables(targetDb);
    const commonTables = sourceTables.filter(t => targetTables.includes(t));
    
    console.log(`Source tables: ${sourceTables.length}`);
    console.log(`Target tables: ${targetTables.length}`);
    console.log(`Common tables: ${commonTables.length}`);
    console.log(`Common: ${commonTables.join(', ')}`);
    console.log();

    // Step 3: Merge Users (critical - must happen first for FK mapping)
    console.log('Step 3: Merging Users...');
    const userMapping = new Map(); // sourceUserId -> targetUserId
    
    if (!commonTables.includes('User')) {
      console.log('⚠️  User table not found in both databases. Cannot proceed.');
      return;
    }

    const sourceUserInfo = getTableInfo(sourceDb, 'User');
    const targetUserInfo = getTableInfo(targetDb, 'User');
    const userColumns = getCommonColumns(sourceUserInfo, targetUserInfo);
    
    console.log(`Common User columns: ${userColumns.map(c => c.name).join(', ')}`);
    
    // Check if email column exists in both
    const hasEmail = userColumns.some(c => c.name === 'email');
    if (!hasEmail) {
      console.log('⚠️  Email column not found in both User tables. Cannot dedupe by email.');
      console.log('   Proceeding with ID-based merge (may create duplicates).');
    }

    // Get all source users
    const sourceUsers = sourceDb.prepare('SELECT * FROM User').all();
    console.log(`Found ${sourceUsers.length} users in source`);
    
    // Get existing target users by email (if email exists)
    const targetUsersByEmail = new Map();
    if (hasEmail) {
      const targetUsers = targetDb.prepare('SELECT id, email FROM User').all();
      targetUsers.forEach(u => {
        if (u.email) {
          targetUsersByEmail.set(u.email.toLowerCase().trim(), u.id);
        }
      });
      console.log(`Found ${targetUsers.length} users in target (${targetUsersByEmail.size} with emails)`);
    }

    let usersInserted = 0;
    let usersMatched = 0;

    const insertUsers = targetDb.transaction((sourceUsers) => {
      for (const sourceUser of sourceUsers) {
        let targetUserId = null;
        let isNew = false;

        // Check if user exists by email
        if (hasEmail && sourceUser.email) {
          const normalizedEmail = String(sourceUser.email).toLowerCase().trim();
          targetUserId = targetUsersByEmail.get(normalizedEmail);
        }

        if (targetUserId) {
          // User exists - map source ID to target ID
          userMapping.set(sourceUser.id, targetUserId);
          usersMatched++;
        } else {
          // Insert new user
          // Build insert columns: include common columns + required target columns
          const insertCols = [];
          const insertValues = [];
          
          // Add common columns
          for (const col of userColumns) {
            // Skip id if it's auto-generated
            if (col.name === 'id') {
              const targetCol = col.target;
              if (targetCol.type && targetCol.type.toUpperCase().includes('TEXT')) {
                insertCols.push(col.name);
                insertValues.push(sourceUser[col.name] || null);
              }
              // Otherwise skip - let target generate ID
              continue;
            }
            
            insertCols.push(col.name);
            let value = sourceUser[col.name];
            
            // Handle null/undefined
            if (value === null || value === undefined) {
              // Check if target column is NOT NULL and has no default
              if (col.target.notnull && !col.target.dflt_value) {
                // Provide default value based on column type/name
                if (col.name === 'updatedAt' || col.name === 'updated_at') {
                  // Use createdAt if available, otherwise current timestamp
                  value = sourceUser.createdAt || sourceUser.created_at || new Date().toISOString();
                } else if (col.name === 'points' || col.name === 'referralEarningsCents' || col.name === 'associateBalanceCents') {
                  value = 0;
                } else if (col.name === 'earnedPurchaseBook' || col.name === 'rabbit1Completed') {
                  value = false;
                } else if (col.target.type && col.target.type.toUpperCase().includes('INT')) {
                  value = 0;
                } else {
                  value = '';
                }
              }
              insertValues.push(value);
            } else {
              // Handle dates - convert to ISO string if needed
              if (value instanceof Date) {
                insertValues.push(value.toISOString());
              } else {
                insertValues.push(value);
              }
            }
          }
          
          // Add any required target columns that don't exist in source
          for (const targetCol of targetUserInfo.columns) {
            if (!insertCols.includes(targetCol.name) && targetCol.notnull && !targetCol.dflt_value) {
              // Required column missing from source - provide default
              insertCols.push(targetCol.name);
              if (targetCol.name === 'updatedAt' || targetCol.name === 'updated_at') {
                insertValues.push(sourceUser.createdAt || sourceUser.created_at || new Date().toISOString());
              } else if (targetCol.type && targetCol.type.toUpperCase().includes('INT')) {
                insertValues.push(0);
              } else if (targetCol.type && targetCol.type.toUpperCase().includes('BOOL')) {
                insertValues.push(false);
              } else {
                insertValues.push('');
              }
            }
          }

          const placeholders = insertCols.map(() => '?').join(', ');
          const values = insertValues;

          const insertSql = `INSERT INTO User (${insertCols.join(', ')}) VALUES (${placeholders})`;
          
          try {
            const result = targetDb.prepare(insertSql).run(...values);
            targetUserId = result.lastInsertRowid.toString();
            
            // If we preserved the ID, use it
            if (insertCols.includes('id') && sourceUser.id) {
              // For TEXT IDs, we need to get the actual inserted value
              const inserted = targetDb.prepare('SELECT id FROM User WHERE rowid = ?').get(result.lastInsertRowid);
              targetUserId = inserted.id;
            }
            
            userMapping.set(sourceUser.id, targetUserId);
            usersInserted++;
          } catch (err) {
            console.error(`  ⚠️  Failed to insert user ${sourceUser.email || sourceUser.id}: ${err.message}`);
            // Continue with next user
          }
        }
      }
    });
    
    insertUsers(sourceUsers);

    console.log(`✅ Users merged: ${usersInserted} inserted, ${usersMatched} matched`);
    console.log(`   Total users in target: ${targetDb.prepare('SELECT COUNT(*) as count FROM User').get().count}`);
    console.log();

    // Step 4: Merge ReferralConversions
    console.log('Step 4: Merging ReferralConversions...');
    let referralConversionsInserted = 0;
    
    if (commonTables.includes('ReferralConversion')) {
      const sourceRefInfo = getTableInfo(sourceDb, 'ReferralConversion');
      const targetRefInfo = getTableInfo(targetDb, 'ReferralConversion');
      const refColumns = getCommonColumns(sourceRefInfo, targetRefInfo);
      
      // Get existing ReferralConversions in target for deduplication
      const existingRefs = new Set();
      const targetRefs = targetDb.prepare('SELECT * FROM ReferralConversion').all();
      targetRefs.forEach(ref => {
        // Create a dedupe key from likely unique columns
        const key = [
          ref.stripeSessionId || '',
          ref.referrerUserId || '',
          ref.buyerEmail || '',
        ].join('|');
        if (key) existingRefs.add(key);
      });

      const sourceRefs = sourceDb.prepare('SELECT * FROM ReferralConversion').all();
      console.log(`Found ${sourceRefs.length} ReferralConversions in source`);
      
      const insertRefs = targetDb.transaction((sourceRefs) => {
        for (const sourceRef of sourceRefs) {
          // Check for duplicates
          const dedupeKey = [
            sourceRef.stripeSessionId || '',
            sourceRef.referrerUserId || '',
            sourceRef.buyerEmail || '',
          ].join('|');
          
          if (dedupeKey && existingRefs.has(dedupeKey)) {
            continue; // Skip duplicate
          }

          // Map user IDs
          const insertCols = refColumns
            .filter(col => {
              // Skip id if auto-generated
              if (col.name === 'id') {
                const targetCol = col.target;
                return targetCol.type && targetCol.type.toUpperCase().includes('TEXT');
              }
              return true;
            })
            .map(col => col.name);

          const placeholders = insertCols.map(() => '?').join(', ');
          const values = insertCols.map(colName => {
            let value = sourceRef[colName];
            
            // Map user foreign keys
            if (colName.includes('UserId') || colName.includes('userId') || colName === 'referrerUserId' || colName === 'buyerUserId') {
              if (value && userMapping.has(value)) {
                value = userMapping.get(value);
              } else if (value && !userMapping.has(value)) {
                // User ID not in mapping - skip this row or set to null?
                console.log(`  ⚠️  ReferralConversion references unmapped user ID: ${value}`);
                value = null;
              }
            }
            
            if (value === null || value === undefined) return null;
            if (value instanceof Date) return value.toISOString();
            return value;
          });

          const insertSql = `INSERT INTO ReferralConversion (${insertCols.join(', ')}) VALUES (${placeholders})`;
          
          try {
            targetDb.prepare(insertSql).run(...values);
            referralConversionsInserted++;
            if (dedupeKey) existingRefs.add(dedupeKey);
          } catch (err) {
            console.error(`  ⚠️  Failed to insert ReferralConversion: ${err.message}`);
          }
        }
      });
      
      insertRefs(sourceRefs);
      
      console.log(`✅ ReferralConversions merged: ${referralConversionsInserted} inserted`);
    } else {
      console.log('⚠️  ReferralConversion table not found in both databases. Skipping.');
    }
    console.log();

    // Step 5: Merge other common tables (optional)
    console.log('Step 5: Merging other common tables...');
    const otherTables = commonTables.filter(t => 
      t !== 'User' && 
      t !== 'ReferralConversion' && 
      t !== 'Purchase' // Explicitly skip Purchase - we want to keep target's purchases
    );
    
    const otherTableCounts = {};
    
    for (const tableName of otherTables) {
      try {
        const sourceInfo = getTableInfo(sourceDb, tableName);
        const targetInfo = getTableInfo(targetDb, tableName);
        const columns = getCommonColumns(sourceInfo, targetInfo);
        
        if (columns.length === 0) {
          console.log(`  ⚠️  ${tableName}: No common columns. Skipping.`);
          continue;
        }

        // Check if table has user foreign keys
        const userFkColumns = columns.filter(col => 
          col.name.includes('UserId') || 
          col.name.includes('userId') || 
          col.name === 'referrerUserId' ||
          col.name === 'buyerUserId' ||
          col.name === 'customerId'
        );

        // Get existing rows for deduplication (by primary key if available)
        const existingRows = new Set();
        const pkCols = targetInfo.primaryKey;
        if (pkCols.length > 0) {
          const targetRows = targetDb.prepare(`SELECT ${pkCols.join(', ')} FROM "${tableName}"`).all();
          targetRows.forEach(row => {
            const key = pkCols.map(col => String(row[col] || '')).join('|');
            if (key) existingRows.add(key);
          });
        }

        const sourceRows = sourceDb.prepare(`SELECT * FROM "${tableName}"`).all();
        let inserted = 0;
        let skipped = 0;

        const insertRows = targetDb.transaction((sourceRows) => {
          for (const sourceRow of sourceRows) {
            // Dedupe by primary key
            if (pkCols.length > 0) {
              const key = pkCols.map(col => String(sourceRow[col] || '')).join('|');
              if (key && existingRows.has(key)) {
                skipped++;
                continue;
              }
            }

            // Filter rows: only migrate if they reference migrated users
            if (userFkColumns.length > 0) {
              const hasMappedUser = userFkColumns.some(col => {
                const userId = sourceRow[col.name];
                return userId && userMapping.has(userId);
              });
              if (!hasMappedUser) {
                skipped++;
                continue; // Skip rows that don't reference any migrated users
              }
            }

            const insertCols = columns
              .filter(col => {
                if (col.name === 'id') {
                  const targetCol = col.target;
                  return targetCol.type && targetCol.type.toUpperCase().includes('TEXT');
                }
                return true;
              })
              .map(col => col.name);

            const placeholders = insertCols.map(() => '?').join(', ');
            const values = insertCols.map(colName => {
              let value = sourceRow[colName];
              
              // Map user foreign keys
              if (userFkColumns.some(col => col.name === colName)) {
                if (value && userMapping.has(value)) {
                  value = userMapping.get(value);
                } else if (value && !userMapping.has(value)) {
                  // Skip this row if it references an unmapped user
                  return null; // Will cause insert to fail, which we'll catch
                }
              }
              
              if (value === null || value === undefined) return null;
              if (value instanceof Date) return value.toISOString();
              return value;
            });

            const insertSql = `INSERT INTO "${tableName}" (${insertCols.join(', ')}) VALUES (${placeholders})`;
            
            try {
              targetDb.prepare(insertSql).run(...values);
              inserted++;
              if (pkCols.length > 0) {
                const key = pkCols.map(col => String(sourceRow[col] || '')).join('|');
                if (key) existingRows.add(key);
              }
            } catch (err) {
              skipped++;
              // Silently skip errors (likely duplicates or constraint violations)
            }
          }
        });
        
        insertRows(sourceRows);

        otherTableCounts[tableName] = { inserted, skipped };
        if (inserted > 0 || skipped > 0) {
          console.log(`  ${tableName}: ${inserted} inserted, ${skipped} skipped`);
        }
      } catch (err) {
        console.log(`  ⚠️  ${tableName}: Error - ${err.message}`);
      }
    }
    console.log();

    // Step 6: Final summary
    console.log('='.repeat(80));
    console.log('MERGE COMPLETE');
    console.log('='.repeat(80));
    console.log();
    console.log('Summary:');
    console.log(`  Users: ${usersInserted} inserted, ${usersMatched} matched`);
    console.log(`  ReferralConversions: ${referralConversionsInserted} inserted`);
    console.log();
    console.log('Other tables:');
    for (const [table, counts] of Object.entries(otherTableCounts)) {
      if (counts.inserted > 0 || counts.skipped > 0) {
        console.log(`  ${table}: ${counts.inserted} inserted, ${counts.skipped} skipped`);
      }
    }
    console.log();
    console.log(`✅ Backup saved: ${path.relative(REPO_ROOT, backupPath)}`);
    console.log(`✅ Target database updated: ${path.relative(REPO_ROOT, TARGET_DB)}`);
    console.log();

  } catch (err) {
    console.error('[ERROR] Merge failed:', err);
    console.error(err.stack);
    process.exit(1);
  } finally {
    sourceDb.close();
    targetDb.close();
  }
}

// Run the merge
mergeDatabases();

