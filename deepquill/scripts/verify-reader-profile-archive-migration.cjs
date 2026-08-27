#!/usr/bin/env node
/**
 * Checkpoint 5J-C3: additive archive-reason migration applies as #49 after
 * the existing 48 migrations on a disposable database. Does not copy or
 * access production. Refuses deepquill/dev.db.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEEPQUILL_ROOT = path.join(__dirname, '..');
const DEV_DB = path.join(DEEPQUILL_ROOT, 'dev.db');
const MIGRATIONS_DIR = path.join(DEEPQUILL_ROOT, 'prisma', 'migrations');
const TARGET = '20260827120000_reader_profile_archive_reason';

function isCanonicalDevDb(url) {
  const raw = String(url || '');
  const normalized = raw.replace(/\\/g, '/').toLowerCase();
  if (!raw) return false;
  if (normalized.includes('/temp/') || normalized.includes('/tmp/')) return false;
  if (normalized.includes('deepquill/dev.db')) return true;
  if (/file:\.?\/?dev\.db$/.test(normalized)) return true;
  try {
    const withoutFile = raw.replace(/^file:/i, '').replace(/\?.*$/, '');
    const resolved = path.resolve(DEEPQUILL_ROOT, withoutFile);
    if (path.resolve(resolved) === path.resolve(DEV_DB)) return true;
  } catch {
    return false;
  }
  return false;
}

function refuseDevDb(url) {
  if (!String(url || '').startsWith('file:')) throw new Error('DATABASE_URL must be a sqlite file: URL');
  if (isCanonicalDevDb(url)) {
    throw new Error('Refusing to run against the normal local deepquill/dev.db');
  }
}

function listMigrationFolders(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((row) => row.isDirectory() && /^\d{14}_/.test(row.name))
    .map((row) => row.name)
    .sort();
}

function migrateDeploy(cwd, fileUrl) {
  const prismaCli = path.join(DEEPQUILL_ROOT, 'node_modules', 'prisma', 'build', 'index.js');
  const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', path.join(cwd, 'schema.prisma')], {
    cwd,
    env: { ...process.env, DATABASE_URL: fileUrl },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy failed: ${(result.stderr || result.stdout || '').slice(-2000)}`);
  }
  return result.stdout || '';
}

function copySchemaAndMigrations(destRoot, names) {
  fs.mkdirSync(path.join(destRoot, 'migrations'), { recursive: true });
  fs.copyFileSync(path.join(DEEPQUILL_ROOT, 'prisma', 'schema.prisma'), path.join(destRoot, 'schema.prisma'));
  for (const name of names) {
    const from = path.join(MIGRATIONS_DIR, name);
    const to = path.join(destRoot, 'migrations', name);
    fs.cpSync(from, to, { recursive: true });
  }
  const lockFrom = path.join(MIGRATIONS_DIR, 'migration_lock.toml');
  if (fs.existsSync(lockFrom)) {
    fs.copyFileSync(lockFrom, path.join(destRoot, 'migrations', 'migration_lock.toml'));
  }
}

async function main() {
  const all = listMigrationFolders(MIGRATIONS_DIR);
  assert.strictEqual(all.length, 49, `expected 49 migrations, found ${all.length}`);
  assert.strictEqual(all[all.length - 1], TARGET);
  const first48 = all.slice(0, 48);
  assert.ok(!first48.includes(TARGET));

  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, TARGET, 'migration.sql'), 'utf8');
  assert.match(sql, /ALTER TABLE "ReaderProfile" ADD COLUMN "archiveReasonCode" TEXT/);
  assert.match(sql, /ALTER TABLE "ReaderProfile" ADD COLUMN "archiveDetails" TEXT/);
  assert.match(sql, /ALTER TABLE "ReaderProfile" ADD COLUMN "archivePriorStatus" TEXT/);
  assert.doesNotMatch(sql, /DROP TABLE|CREATE TABLE|DELETE FROM|UPDATE |TRIGGER|RENAME /i);
  assert.doesNotMatch(sql, /INSERT INTO/i);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-5jc3-mig-'));
  const schemaDir = path.join(tmpDir, 'prisma');
  const dbPath = path.join(tmpDir, 'mig.db');
  const fileUrl = `file:${dbPath.replace(/\\/g, '/')}`;
  refuseDevDb(fileUrl);

  copySchemaAndMigrations(schemaDir, first48);
  migrateDeploy(schemaDir, fileUrl);

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: fileUrl } } });
  async function countTable(table) {
    const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM "${table}"`);
    return Number(rows[0].c);
  }
  try {
    const applied48 = await prisma.$queryRawUnsafe(
      'SELECT migration_name FROM _prisma_migrations ORDER BY finished_at ASC, migration_name ASC',
    );
    assert.strictEqual(applied48.length, 48);
    assert.notStrictEqual(applied48[applied48.length - 1].migration_name, TARGET);

    const token = `mig${Date.now()}`.slice(0, 22);
    const userId = `usr_${token}`;
    const profileId = `rp_${token}`;
    const purchaseId = `pur_${token}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" ("id", "email", "code", "referralCode", "fname", "lname", "createdAt")
       VALUES (?, ?, ?, ?, 'Migration', 'Fixture', CURRENT_TIMESTAMP)`,
      userId,
      `${token}@migrate.test`,
      token,
      token.toUpperCase(),
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ReaderProfile" ("id", "userId", "source", "readerType", "status", "createdAt", "updatedAt")
       VALUES (?, ?, 'Website', 'purchased', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      profileId,
      userId,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Purchase" ("id", "userId", "sessionId", "amount", "currency", "source", "createdAt")
       VALUES (?, ?, ?, 2499, 'usd', 'stripe', CURRENT_TIMESTAMP)`,
      purchaseId,
      userId,
      `cs_${token}`,
    );
    const amountsBefore = (await prisma.$queryRawUnsafe('SELECT amount FROM "Purchase" ORDER BY id')).map((row) =>
      Number(row.amount),
    );
    const countsBefore = {
      users: await countTable('User'),
      profiles: await countTable('ReaderProfile'),
      purchases: await countTable('Purchase'),
      purchaseAmount: amountsBefore,
    };

    fs.cpSync(path.join(MIGRATIONS_DIR, TARGET), path.join(schemaDir, 'migrations', TARGET), { recursive: true });
    migrateDeploy(schemaDir, fileUrl);

    const applied49 = await prisma.$queryRawUnsafe(
      'SELECT migration_name FROM _prisma_migrations ORDER BY finished_at ASC, migration_name ASC',
    );
    assert.strictEqual(applied49.length, 49);
    assert.strictEqual(applied49[48].migration_name, TARGET);

    const amountsAfter = (await prisma.$queryRawUnsafe('SELECT amount FROM "Purchase" ORDER BY id')).map((row) =>
      Number(row.amount),
    );
    const countsAfter = {
      users: await countTable('User'),
      profiles: await countTable('ReaderProfile'),
      purchases: await countTable('Purchase'),
      purchaseAmount: amountsAfter,
    };
    assert.deepStrictEqual(countsAfter, countsBefore);

    const profile = await prisma.readerProfile.findUnique({ where: { id: profileId } });
    assert.strictEqual(profile.status, 'active');
    assert.strictEqual(profile.archiveReasonCode, null);
    assert.strictEqual(profile.archiveDetails, null);
    assert.strictEqual(profile.archivePriorStatus, null);
    const purchase = await prisma.purchase.findFirst({ where: { userId } });
    assert.strictEqual(purchase.amount, 2499);
    assert.strictEqual(purchase.saleStatus, 'live');

    console.log('ok  archive-reason migration is additive #49 and leaves existing rows null');
  } finally {
    await prisma.$disconnect();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
