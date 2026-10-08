#!/usr/bin/env node
/**
 * Disposable-DB checks for Reader Manager PATCH source preservation.
 * Refuses deepquill/dev.db. Never touches production records.
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const express = require('express');

const DEEPQUILL_ROOT = path.join(__dirname, '..');
const DEV_DB = path.join(DEEPQUILL_ROOT, 'dev.db');
const AGNES_NEXT_ROOT = path.join(DEEPQUILL_ROOT, '..', 'agnes-next');

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

function migrateDisposable() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-rm-patch-src-'));
  const dbPath = path.join(tmpDir, 'patch-source.db');
  const fileUrl = `file:${dbPath.replace(/\\/g, '/')}`;
  refuseDevDb(fileUrl);
  const prismaCli = path.join(DEEPQUILL_ROOT, 'node_modules', 'prisma', 'build', 'index.js');
  const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: DEEPQUILL_ROOT,
    env: { ...process.env, DATABASE_URL: fileUrl },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy failed: ${(result.stderr || result.stdout || '').slice(-1500)}`);
  }
  return { tmpDir, dbPath, fileUrl };
}

const disposable = migrateDisposable();
process.env.DATABASE_URL = disposable.fileUrl;
process.env.NODE_ENV = 'test';
process.env.ADMIN_KEY = process.env.ADMIN_KEY || 'reader-manager-patch-source-test-key';

const {
  isValidReaderSource,
  isAcceptedPatchReaderSource,
  READER_SOURCES,
} = require('../lib/readers/readerConstants.cjs');
const adminReadersRouter = require('../server/routes/adminReaders.cjs');
const { prisma } = require('../server/prisma.cjs');

const suffix = `rmps${Date.now()}`;
let passed = 0;
let failed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`ok  ${name}`);
    })
    .catch((err) => {
      failed += 1;
      console.error(`FAIL ${name}: ${err && err.message}`);
    });
}

function scan(rel) {
  return fs.readFileSync(path.join(DEEPQUILL_ROOT, rel), 'utf8');
}

async function createReader(label, source) {
  const token = `${suffix}${label}`.replace(/[^a-z0-9]/gi, '').slice(0, 22);
  return prisma.user.create({
    data: {
      email: `${token}@agnes.patch`,
      code: token,
      referralCode: token.toUpperCase(),
      firstName: label,
      fname: label,
      lname: 'Reader',
      readerProfile: {
        create: {
          source,
          readerType: 'interested',
          status: 'active',
          notes: `Original notes for ${label}`,
        },
      },
    },
    include: { readerProfile: true },
  });
}

function patchBody(user, overrides) {
  return {
    firstName: user.firstName || user.fname || '',
    lastName: user.lname || '',
    email: user.email,
    phone: user.phone || '',
    source: user.readerProfile.source || '',
    notes: user.readerProfile.notes || '',
    smsConsentGranted: false,
    smsConsentSource: '',
    smsConsentNotes: '',
    ...overrides,
  };
}

function readersReq(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'x-admin-key': process.env.ADMIN_KEY,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = { parseError: text.slice(0, 400) };
          }
          resolve({ status: res.statusCode, json });
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');

  const app = express();
  app.use(express.json());
  app.use('/api/admin/readers', adminReadersRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    await check('POST create still rejects non-allowlisted sources', () => {
      const postSrc = scan('server/routes/adminReaders.cjs');
      const postBlock = postSrc.slice(postSrc.indexOf("router.post('/',"), postSrc.indexOf("router.patch('/:id'"));
      assert.match(postBlock, /source && !isValidReaderSource\(source\)/);
      assert.doesNotMatch(postBlock, /isAcceptedPatchReaderSource/);
    });

    await check('helper preserves unchanged historical sources and rejects new illegal sources', () => {
      assert.equal(isAcceptedPatchReaderSource('Jody Concierge', 'Jody Concierge'), true);
      assert.equal(isAcceptedPatchReaderSource('readers-agree-v2', 'readers-agree-v2'), true);
      assert.equal(isAcceptedPatchReaderSource('Website', 'Website'), true);
      assert.equal(isAcceptedPatchReaderSource('Amazon', 'Jody Concierge'), true);
      assert.equal(isAcceptedPatchReaderSource('not-a-real-source', 'Jody Concierge'), false);
      assert.equal(isAcceptedPatchReaderSource('Jody Concierge', 'Website'), false);
      assert.equal(isValidReaderSource('Jody Concierge'), false);
      assert.equal(isValidReaderSource('readers-agree-v2'), false);
      assert.equal(READER_SOURCES.includes('Jody Concierge'), false);
      assert.equal(READER_SOURCES.includes('readers-agree-v2'), false);
    });

    const jody = await createReader('jody', 'Jody Concierge');
    const agree = await createReader('agree', 'readers-agree-v2');
    const website = await createReader('web', 'Website');
    const changeToAllowed = await createReader('chgok', 'Jody Concierge');
    const changeToIllegal = await createReader('chgbad', 'readers-agree-v2');

    await check('existing Jody Concierge reader + unrelated field edit succeeds and source remains', async () => {
      const res = await readersReq(port, 'PATCH', `/api/admin/readers/${jody.readerProfile.id}`, patchBody(jody, {
        notes: 'Updated Jody notes without changing source',
        firstName: 'JodyKept',
      }));
      assert.strictEqual(res.status, 200, JSON.stringify(res.json));
      assert.strictEqual(res.json.ok, true);
      assert.strictEqual(res.json.reader.source, 'Jody Concierge');
      assert.strictEqual(res.json.reader.firstName, 'JodyKept');
      assert.match(res.json.reader.notes, /Updated Jody notes/);
      const stored = await prisma.readerProfile.findUnique({ where: { id: jody.readerProfile.id } });
      assert.strictEqual(stored.source, 'Jody Concierge');
    });

    await check('existing readers-agree-v2 reader + unrelated field edit succeeds and source remains', async () => {
      const res = await readersReq(port, 'PATCH', `/api/admin/readers/${agree.readerProfile.id}`, patchBody(agree, {
        notes: 'Updated agree notes without changing source',
        lastName: 'KeptV2',
      }));
      assert.strictEqual(res.status, 200, JSON.stringify(res.json));
      assert.strictEqual(res.json.reader.source, 'readers-agree-v2');
      assert.strictEqual(res.json.reader.lastName, 'KeptV2');
      const stored = await prisma.readerProfile.findUnique({ where: { id: agree.readerProfile.id } });
      assert.strictEqual(stored.source, 'readers-agree-v2');
    });

    await check('existing allowlisted source + edit succeeds', async () => {
      const res = await readersReq(port, 'PATCH', `/api/admin/readers/${website.readerProfile.id}`, patchBody(website, {
        notes: 'Website reader notes updated',
        firstName: 'WebKept',
      }));
      assert.strictEqual(res.status, 200, JSON.stringify(res.json));
      assert.strictEqual(res.json.reader.source, 'Website');
      assert.strictEqual(res.json.reader.firstName, 'WebKept');
    });

    await check('attempt to change source to an arbitrary non-allowlisted value is rejected', async () => {
      const res = await readersReq(port, 'PATCH', `/api/admin/readers/${changeToIllegal.readerProfile.id}`, patchBody(changeToIllegal, {
        source: 'not-a-real-source',
        notes: 'Should not persist because source is illegal',
      }));
      assert.strictEqual(res.status, 400, JSON.stringify(res.json));
      assert.strictEqual(res.json.ok, false);
      assert.strictEqual(res.json.error, 'Invalid reader source');
      const stored = await prisma.readerProfile.findUnique({ where: { id: changeToIllegal.readerProfile.id } });
      assert.strictEqual(stored.source, 'readers-agree-v2');
      assert.strictEqual(stored.notes, changeToIllegal.readerProfile.notes);
    });

    await check('attempt to change source to an allowed manual source succeeds', async () => {
      const res = await readersReq(port, 'PATCH', `/api/admin/readers/${changeToAllowed.readerProfile.id}`, patchBody(changeToAllowed, {
        source: 'Amazon',
        notes: 'Moved to Amazon after bookstore conversation',
      }));
      assert.strictEqual(res.status, 200, JSON.stringify(res.json));
      assert.strictEqual(res.json.reader.source, 'Amazon');
      const stored = await prisma.readerProfile.findUnique({ where: { id: changeToAllowed.readerProfile.id } });
      assert.strictEqual(stored.source, 'Amazon');
    });
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
    try {
      fs.rmSync(disposable.tmpDir, { recursive: true, force: true });
    } catch {
      // ignore temp cleanup
    }
  }

  const addClient = fs.readFileSync(
    path.join(AGNES_NEXT_ROOT, 'src', 'app', 'admin', 'readers', 'ReadersAdminClient.tsx'),
    'utf8',
  );
  await check('Add Reader source allowlist is unchanged', () => {
    assert.match(addClient, /READER_SOURCES\.map/);
    assert.doesNotMatch(addClient, /readerSourceSelectOptions/);
    assert.doesNotMatch(addClient, /Jody Concierge|readers-agree-v2/);
  });

  if (failed) {
    console.error(`\n${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`\n${passed} passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
