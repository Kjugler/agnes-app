#!/usr/bin/env node
/**
 * Disposable-DB checks for Checkpoint 5F-A actor-list and audit-history GET contracts.
 * Requires DATABASE_URL on a temp SQLite file. Refuses deepquill/dev.db.
 */
process.env.NODE_ENV = 'test';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const createAdminReaderLifecycleRouter = require('../server/routes/adminReaderLifecycle.cjs');
const createAdminReaderLifecycleWriteRouter = require('../server/routes/adminReaderLifecycleWrite.cjs');
const {
  listLifecycleActors,
  listReaderAuditHistory,
  sanitizeAuditSummary,
  asReadOnlyPrisma,
  DEFAULT_PAGE_SIZE,
  AUDIT_SUMMARY_SCALAR_KEYS,
  AUDIT_BLOCKED_KEYS,
  AUDIT_MAX_SUMMARY_DEPTH,
} = require('../lib/readers/readerLifecycleRead.cjs');

const url = process.env.DATABASE_URL || '';
const normalized = url.replace(/\\/g, '/').toLowerCase();
if (!url.startsWith('file:')) throw new Error('DATABASE_URL must be a sqlite file: URL');
if (normalized.includes('deepquill/dev.db') && !normalized.includes('/temp/') && !normalized.includes('/tmp/')) {
  throw new Error('Refusing to run against the normal local deepquill/dev.db');
}

const ADMIN_KEY = 'checkpoint5fa-synthetic-admin-key';
process.env.ADMIN_KEY = ADMIN_KEY;
const FORBIDDEN = 'Forbidden - x-admin-key required in production';
const prisma = new PrismaClient();
const suffix = `cp5fa${Date.now()}`;
const basePath = '/api/admin/reader-lifecycle';
let failed = 0;
let passed = 0;
let server;

const ADMIN_REASON = 'Administrative correction summary only';
const POISON = Object.freeze({
  name: 'Victim Reader Name',
  email: 'victim.audit@example.test',
  helperEmail: `inactive-${suffix}@fulfillment.test`,
  activeEmail: `kris-${suffix}@fulfillment.test`,
  phone: '+15550109999',
  details: 'SECRET_EVIDENCE_DETAILS_DO_NOT_LEAK',
  replacementDetails: 'SECRET_REPLACEMENT_DETAILS',
  notes: 'CRM note must not leak through audit JSON',
  stripeSessionId: 'cs_poison_session_5fa',
  otherUserId: 'user_unrelated_customer_5fa',
  originRef: 'idem-secret-key-5fa',
  token: 'fulfillment-token-should-not-appear',
  nestedReason: 'NESTED_SNAPSHOT_REASON_MUST_NOT_LEAK',
  credential: 'admin-password-secret-value',
});

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`ok  ${name}`);
    })
    .catch((err) => {
      failed += 1;
      console.error(`FAIL ${name}: ${err && err.stack ? err.stack : err}`);
    });
}

function canonicalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return String(value);
  if (Buffer.isBuffer(value)) return value.toString('hex');
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  if (value === undefined) return null;
  return value;
}

function normalizeRows(rows) {
  return rows
    .map((row) => canonicalize(row))
    .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
}

async function snapshotTables() {
  const tables = {
    User: await prisma.user.findMany(),
    ReaderProfile: await prisma.readerProfile.findMany(),
    Purchase: await prisma.purchase.findMany(),
    Order: await prisma.order.findMany(),
    ReaderEvidence: await prisma.readerEvidence.findMany(),
    ReaderCommunication: await prisma.readerCommunication.findMany(),
    ReaderIdentityReview: await prisma.readerIdentityReview.findMany(),
    ReaderContactDecision: await prisma.readerContactDecision.findMany(),
    ReaderAdminAudit: await prisma.readerAdminAudit.findMany(),
    ReaderMutationIdempotency: await prisma.readerMutationIdempotency.findMany(),
    FulfillmentUser: await prisma.fulfillmentUser.findMany(),
  };
  const normalized = {};
  const rowCounts = {};
  for (const [name, rows] of Object.entries(tables)) {
    normalized[name] = normalizeRows(rows);
    rowCounts[name] = normalized[name].length;
  }
  const json = JSON.stringify(normalized);
  return {
    hash: crypto.createHash('sha256').update(json).digest('hex'),
    rowCounts,
    byteLength: Buffer.byteLength(json),
  };
}

function collectKeys(value, acc = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, acc);
  } else if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      acc.add(key);
      collectKeys(nested, acc);
    }
  }
  return acc;
}

function assertNoPoison(payload, label) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  for (const [name, snippet] of Object.entries(POISON)) {
    assert.ok(!text.includes(snippet), `${label} leaked ${name}: ${snippet}`);
  }
  for (const token of [
    ADMIN_KEY,
    'webhookSecret',
    'client_secret',
    'STRIPE_SECRET',
    POISON.token,
    POISON.nestedReason,
    '__proto__',
    '"prototype"',
    '"constructor"',
  ]) {
    assert.ok(!text.includes(token), `${label} leaked ${token}`);
  }
}

function withCapturedLogs(fn) {
  const logs = [];
  const original = console.error;
  console.error = (...args) => {
    logs.push(args.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(' '));
  };
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.error = original;
    })
    .then((value) => ({ value, logs: logs.join('\n') }));
}

function poisonSnapshot() {
  const polluted = {
    id: 'ev_poison',
    kind: 'manual_amazon',
    status: 'disputed',
    reason: POISON.nestedReason,
    Reason: POISON.nestedReason,
    EMAIL: POISON.email,
    Phone: POISON.phone,
    name: POISON.name,
    notes: POISON.notes,
    details: POISON.details,
    stripeSessionId: POISON.stripeSessionId,
    otherUserId: POISON.otherUserId,
    originRef: POISON.originRef,
    credential: POISON.credential,
    replacement: [
      { email: POISON.email, kind: 'manual_bn', reason: POISON.nestedReason },
    ],
    extra: { email: POISON.email },
  };
  Object.defineProperty(polluted, '__proto__', {
    value: { email: POISON.email, kind: 'pwned' },
    enumerable: true,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(polluted, 'constructor', {
    value: { token: POISON.credential },
    enumerable: true,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(polluted, 'prototype', {
    value: { phone: POISON.phone },
    enumerable: true,
    configurable: true,
    writable: true,
  });
  return polluted;
}

function assertNoStore(res) {
  assert.match(String(res.headers['cache-control'] || ''), /no-store/i);
}

function request({ method = 'GET', path: urlPath, headers = {}, body, query }) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const qs = query
      ? '?' +
        Object.entries(query)
          .filter(([, v]) => v != null)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&')
      : '';
    const req = http.request(
      {
        hostname: addr.address === '::' ? '127.0.0.1' : addr.address,
        port: addr.port,
        path: `${urlPath}${qs}`,
        method,
        headers: {
          Connection: 'close',
          ...headers,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, headers: res.headers, text, json });
        });
      },
    );
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

function get(urlPath, opts = {}) {
  const headers = {};
  if (opts.key === undefined) headers['x-admin-key'] = ADMIN_KEY;
  else if (opts.key !== null) headers['x-admin-key'] = opts.key;
  return request({
    method: 'GET',
    path: urlPath,
    headers,
    query: opts.query,
  });
}

function auditSources() {
  const readSrc = fs.readFileSync(path.join(__dirname, '../lib/readers/readerLifecycleRead.cjs'), 'utf8');
  const getSrc = fs.readFileSync(path.join(__dirname, '../server/routes/adminReaderLifecycle.cjs'), 'utf8');
  const writeSrc = fs.readFileSync(path.join(__dirname, '../server/routes/adminReaderLifecycleWrite.cjs'), 'utf8');
  const fulfillmentSrc = fs.readFileSync(path.join(__dirname, '../server/routes/fulfillment.cjs'), 'utf8');
  const writes = readSrc.match(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g) || [];
  assert.strictEqual(writes.length, 0, `read service write-like calls: ${writes.join(', ')}`);
  assert.match(getSrc, /router\.get\('\/actors'/);
  assert.match(getSrc, /router\.get\('\/readers\/:readerProfileId\/audit-history'/);
  assert.match(getSrc, /if \(req\.method !== 'GET'\)/);
  assert.doesNotMatch(getSrc, /createReaderLifecycleWriteService/);
  assert.doesNotMatch(getSrc, /\/api\/fulfillment\/users/);
  assert.doesNotMatch(getSrc, /require\(.+(sendEmail|nodemailer|mailchimp|fulfillmentAuth)/);
  assert.doesNotMatch(readSrc, /require\(.+(sendEmail|nodemailer|mailchimp|adminEmailSend)/);
  assert.match(writeSrc, /router\.post\('\/readers\/:readerProfileId\/evidence'/);
  assert.match(fulfillmentSrc, /router\.get\('\/users'/);
  assert.doesNotMatch(getSrc, /fulfillmentAuth/);
  assert.doesNotMatch(
    readSrc,
    /const AUDIT_SUMMARY_SCALAR_KEYS = Object\.freeze\(\[[^\]]*'\s*reason\s*'/s,
  );
}

async function createUser(label) {
  const token = `${suffix}${label}`.replace(/[^a-z0-9]/gi, '').slice(0, 20);
  return prisma.user.create({
    data: {
      email: `${token}@example.net`,
      code: token,
      referralCode: token.toUpperCase(),
      fname: label,
      lname: 'Reader',
      readerProfile: {
        create: { source: 'Website', readerType: 'interested', status: 'active' },
      },
    },
    include: { readerProfile: true },
  });
}

async function seed() {
  const helperA = await prisma.fulfillmentUser.create({
    data: { name: 'Kris', email: POISON.activeEmail, active: true },
  });
  const helperB = await prisma.fulfillmentUser.create({
    data: { name: 'Denise', email: `denise-${suffix}@fulfillment.test`, active: true },
  });
  const inactive = await prisma.fulfillmentUser.create({
    data: { name: 'Inactive Helper', email: POISON.helperEmail, active: false },
  });
  const readerA = await createUser('ra');
  const readerB = await createUser('rb');
  const stamp = new Date('2026-08-20T12:00:00.000Z');
  const auditsA = [];
  for (let i = 0; i < 5; i += 1) {
    auditsA.push(
      await prisma.readerAdminAudit.create({
        data: {
          relatedUserId: readerA.id,
          actorType: 'admin',
          actorLabel: helperA.name,
          actorId: helperA.id,
          action: 'evidence.add_provisional',
          entityType: 'ReaderEvidence',
          entityId: `ev_a_${i}`,
          reason: `Synthetic audit row ${i} for pagination`,
          createdAt: new Date(stamp.getTime() + i * 1000),
          afterJson: {
            id: `ev_a_${i}`,
            kind: 'manual_amazon',
            status: 'provisional',
            sourceLabel: 'Amazon',
          },
        },
      }),
    );
  }
  const historical = await prisma.readerAdminAudit.create({
    data: {
      relatedUserId: readerA.id,
      actorType: 'admin',
      actorLabel: 'Historical Helper Name',
      actorId: inactive.id,
      action: 'contact_decision.suppress',
      entityType: 'ReaderContactDecision',
      entityId: 'cd_historical',
      reason: 'Recorded while helper was still active',
      createdAt: new Date(stamp.getTime() + 8000),
      afterJson: {
        id: 'cd_historical',
        decision: 'suppress',
        actorLabel: 'Historical Helper Name',
        actorId: inactive.id,
      },
    },
  });
  const poisoned = await prisma.readerAdminAudit.create({
    data: {
      relatedUserId: readerA.id,
      actorType: 'admin',
      actorLabel: helperA.name,
      actorId: helperA.id,
      action: 'evidence.replace_disputed',
      entityType: 'ReaderEvidence',
      entityId: 'ev_poison',
      reason: ADMIN_REASON,
      createdAt: new Date(stamp.getTime() + 9000),
      beforeJson: {
        id: 'ev_poison',
        kind: 'manual_amazon',
        status: 'disputed',
        details: POISON.details,
        email: POISON.email,
        phone: POISON.phone,
        notes: POISON.notes,
        name: POISON.name,
        reason: POISON.nestedReason,
        Reason: POISON.nestedReason,
        EMAIL: POISON.email,
        Phone: POISON.phone,
        stripeSessionId: POISON.stripeSessionId,
        otherUserId: POISON.otherUserId,
        originRef: POISON.originRef,
        credential: POISON.credential,
        userId: readerA.id,
      },
      afterJson: {
        originalId: 'ev_poison',
        reason: POISON.nestedReason,
        Reason: POISON.nestedReason,
        EMAIL: POISON.email,
        name: POISON.name,
        constructor: { token: POISON.credential },
        prototype: { phone: POISON.phone },
        replacement: {
          id: 'ev_poison_new',
          kind: 'manual_bn',
          status: 'provisional',
          details: POISON.replacementDetails,
          email: POISON.email,
          reason: POISON.nestedReason,
        },
        opener: {
          actorType: 'admin',
          actorLabel: 'Historical Helper Name',
          actorId: inactive.id,
          email: POISON.helperEmail,
          reason: POISON.nestedReason,
        },
      },
    },
  });
  const tieStamp = new Date(stamp.getTime() + 6000);
  const sameTime = [];
  for (const id of ['aud_tie_a', 'aud_tie_b', 'aud_tie_c']) {
    sameTime.push(
      await prisma.readerAdminAudit.create({
        data: {
          id,
          relatedUserId: readerA.id,
          actorType: 'admin',
          actorLabel: helperA.name,
          actorId: helperA.id,
          action: 'evidence.add_provisional',
          entityType: 'ReaderEvidence',
          entityId: id.replace('aud_', 'ev_'),
          reason: `Same-timestamp row ${id}`,
          createdAt: tieStamp,
          afterJson: { id: id.replace('aud_', 'ev_'), kind: 'manual_amazon', status: 'provisional' },
        },
      }),
    );
  }
  const otherAudit = await prisma.readerAdminAudit.create({
    data: {
      relatedUserId: readerB.id,
      actorType: 'admin',
      actorLabel: helperB.name,
      actorId: helperB.id,
      action: 'identity_review.open',
      entityType: 'ReaderIdentityReview',
      entityId: 'ir_other',
      reason: 'Other reader identity review',
      createdAt: new Date(stamp.getTime() + 10000),
      afterJson: {
        id: 'ir_other',
        status: 'open',
        details: 'possible duplicate of another person',
        otherUserId: POISON.otherUserId,
      },
    },
  });
  return { helperA, helperB, inactive, readerA, readerB, auditsA, historical, poisoned, sameTime, otherAudit };
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.get('/ping', (_req, res) => res.send('pong'));
  app.use(basePath, createAdminReaderLifecycleWriteRouter(prisma));
  app.use(basePath, createAdminReaderLifecycleRouter(prisma));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

async function stopServer() {
  if (!server) return;
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  server = null;
}

async function main() {
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  auditSources();
  console.log('ok  source audit: GET-only actor/audit routes, fulfillment users untouched');

  await check('sanitizeAuditSummary allowlists fields and drops PII', () => {
    assert.equal(AUDIT_SUMMARY_SCALAR_KEYS.includes('reason'), false);
    assert.equal(AUDIT_MAX_SUMMARY_DEPTH, 4);
    assert.deepEqual([...AUDIT_BLOCKED_KEYS], ['__proto__', 'prototype', 'constructor']);
    const sanitized = sanitizeAuditSummary(poisonSnapshot());
    assert.equal(sanitized.id, 'ev_poison');
    assert.equal(sanitized.kind, 'manual_amazon');
    assert.equal(sanitized.replacement, undefined);
    assertNoPoison(sanitized, 'sanitizeAuditSummary');
    const keys = collectKeys(sanitized);
    assert.equal(keys.has('email'), false);
    assert.equal(keys.has('details'), false);
    assert.equal(keys.has('phone'), false);
    assert.equal(keys.has('notes'), false);
    assert.equal(keys.has('reason'), false);
    assert.equal(keys.has('Reason'), false);
    assert.equal(keys.has('EMAIL'), false);
    assert.equal(keys.has('name'), false);
    assert.equal(keys.has('__proto__'), false);
    assert.equal(keys.has('prototype'), false);
    assert.equal(keys.has('constructor'), false);
    assert.equal(sanitizeAuditSummary(null), null);
    assert.equal(sanitizeAuditSummary('{"email":"victim.audit@example.test"}'), null);
    assert.equal(sanitizeAuditSummary([{ email: POISON.email, kind: 'manual_amazon' }]), null);

    let deep = { email: POISON.email, kind: 'manual_amazon' };
    for (let i = 0; i < 20; i += 1) deep = { replacement: deep, kind: 'manual_amazon' };
    const deepSanitized = sanitizeAuditSummary(deep);
    assertNoPoison(deepSanitized, 'deep sanitizeAuditSummary');

    const circular = { id: 'ev_loop', kind: 'manual_amazon' };
    circular.replacement = circular;
    const looped = sanitizeAuditSummary(circular);
    assert.equal(looped.id, 'ev_loop');
    assertNoPoison(looped, 'circular sanitizeAuditSummary');
  });

  const fixtures = await seed();
  const beforeSnap = await snapshotTables();

  await check('active actors included and inactive actors excluded', async () => {
    const result = await listLifecycleActors(prisma);
    const ids = result.actors.map((row) => row.id);
    assert.ok(ids.includes(fixtures.helperA.id));
    assert.ok(ids.includes(fixtures.helperB.id));
    assert.equal(ids.includes(fixtures.inactive.id), false);
    assert.deepEqual(
      [...ids],
      [...ids].sort((a, b) => {
        const left = result.actors.find((row) => row.id === a).label;
        const right = result.actors.find((row) => row.id === b).label;
        return left.localeCompare(right) || a.localeCompare(b);
      }),
    );
    for (const actor of result.actors) {
      assert.deepEqual(Object.keys(actor).sort(), ['id', 'label']);
      assert.equal(typeof actor.id, 'string');
      assert.equal(typeof actor.label, 'string');
    }
    assertNoPoison(result, 'listLifecycleActors');
  });

  await check('read-only prisma still blocks actor writes', async () => {
    const db = asReadOnlyPrisma(prisma);
    let error = null;
    try {
      await db.fulfillmentUser.create({
        data: { name: 'Nope', email: 'nope@fulfillment.test', active: true },
      });
    } catch (err) {
      error = err;
    }
    assert.ok(error, 'fulfillmentUser.create should throw');
    assert.match(String(error.message), /read-only prisma/i);
  });

  await check('audit rows are restricted to the requested reader', async () => {
    const page = await listReaderAuditHistory(prisma, {
      readerProfileId: fixtures.readerA.readerProfile.id,
      pageSize: 100,
    });
    assert.equal(page.readerProfileId, fixtures.readerA.readerProfile.id);
    const ids = page.items.map((row) => row.id);
    assert.equal(ids.includes(fixtures.otherAudit.id), false);
    assert.ok(ids.includes(fixtures.historical.id));
    assert.ok(ids.includes(fixtures.poisoned.id));
    assert.equal(page.items.length, fixtures.auditsA.length + fixtures.sameTime.length + 2);
  });

  await check('historical actor identity is preserved after helper is inactive', async () => {
    const page = await listReaderAuditHistory(prisma, {
      readerProfileId: fixtures.readerA.readerProfile.id,
      pageSize: 100,
    });
    const historical = page.items.find((row) => row.id === fixtures.historical.id);
    assert.ok(historical);
    assert.equal(historical.actorId, fixtures.inactive.id);
    assert.equal(historical.actorLabel, 'Historical Helper Name');
    const actors = await listLifecycleActors(prisma);
    assert.equal(
      actors.actors.some((row) => row.id === fixtures.inactive.id),
      false,
    );
  });

  await check('audit JSON summaries drop PII and keep safe before/after fields', async () => {
    const page = await listReaderAuditHistory(prisma, {
      readerProfileId: fixtures.readerA.readerProfile.id,
      pageSize: 100,
    });
    const poisoned = page.items.find((row) => row.id === fixtures.poisoned.id);
    assert.ok(poisoned);
    assert.equal(poisoned.before.id, 'ev_poison');
    assert.equal(poisoned.before.status, 'disputed');
    assert.equal(poisoned.after.originalId, 'ev_poison');
    assert.equal(poisoned.after.replacement.kind, 'manual_bn');
    assert.equal(poisoned.after.opener.actorLabel, 'Historical Helper Name');
    assert.equal(poisoned.reason, ADMIN_REASON);
    assert.equal(collectKeys(poisoned.before).has('reason'), false);
    assert.equal(collectKeys(poisoned.after).has('reason'), false);
    assertNoPoison(page, 'listReaderAuditHistory');
    const keys = collectKeys(page);
    assert.equal(keys.has('email'), false);
    assert.equal(keys.has('details'), false);
    assert.equal(keys.has('phone'), false);
    assert.equal(keys.has('notes'), false);
    assert.equal(keys.has('stripeSessionId'), false);
    assert.equal(keys.has('otherUserId'), false);
    assert.equal(keys.has('originRef'), false);
  });

  await check('audit ordering and cursor pagination are deterministic', async () => {
    const seen = [];
    let cursor;
    let pages = 0;
    do {
      const page = await listReaderAuditHistory(prisma, {
        readerProfileId: fixtures.readerA.readerProfile.id,
        pageSize: 2,
        cursor,
      });
      assert.equal(page.pageSize, 2);
      assert.equal(page.totalCount, null);
      for (const item of page.items) seen.push(item.id);
      cursor = page.nextCursor;
      pages += 1;
      if (pages > 20) throw new Error('pagination did not terminate');
    } while (cursor);
    assert.equal(seen.length, fixtures.auditsA.length + fixtures.sameTime.length + 2);
    const all = await listReaderAuditHistory(prisma, {
      readerProfileId: fixtures.readerA.readerProfile.id,
      pageSize: 100,
    });
    const ordered = all.items.map((row) => row.id);
    assert.deepEqual(seen, ordered);
    assert.equal(new Set(seen).size, seen.length);
    for (let i = 1; i < all.items.length; i += 1) {
      const prev = all.items[i - 1];
      const curr = all.items[i];
      const prevTime = Date.parse(prev.createdAt);
      const currTime = Date.parse(curr.createdAt);
      assert.ok(
        prevTime > currTime || (prevTime === currTime && prev.id > curr.id),
        'audit order is not createdAt desc, id desc',
      );
    }
    assert.equal(DEFAULT_PAGE_SIZE, 50);
  });

  await check('same createdAt pagination is deterministic by id', async () => {
    const page = await listReaderAuditHistory(prisma, {
      readerProfileId: fixtures.readerA.readerProfile.id,
      pageSize: 100,
    });
    const tied = page.items.filter((row) => row.id.startsWith('aud_tie_'));
    assert.deepEqual(
      tied.map((row) => row.id),
      ['aud_tie_c', 'aud_tie_b', 'aud_tie_a'],
    );
    assert.equal(new Set(tied.map((row) => row.createdAt)).size, 1);
    const seen = [];
    let cursor;
    let pages = 0;
    do {
      const slice = await listReaderAuditHistory(prisma, {
        readerProfileId: fixtures.readerA.readerProfile.id,
        pageSize: 1,
        cursor,
      });
      for (const item of slice.items) {
        if (item.id.startsWith('aud_tie_')) seen.push(item.id);
      }
      cursor = slice.nextCursor;
      pages += 1;
      if (pages > 30) throw new Error('tie pagination did not terminate');
    } while (cursor);
    assert.deepEqual(seen, ['aud_tie_c', 'aud_tie_b', 'aud_tie_a']);
  });

  await startServer();

  const actorPath = `${basePath}/actors`;
  const auditPath = `${basePath}/readers/${fixtures.readerA.readerProfile.id}/audit-history`;
  const otherAuditPath = `${basePath}/readers/${fixtures.readerB.readerProfile.id}/audit-history`;

  await check('missing and invalid admin keys are rejected', async () => {
    const cases = [
      { key: null, label: 'missing' },
      { key: '', label: 'empty' },
      { key: 'short', label: 'short' },
      { key: `${ADMIN_KEY}-wrong`, label: 'wrong' },
      { key: 'cafe\u00e9-admin-key-not-valid', label: 'latin1-extended' },
    ];
    for (const item of cases) {
      for (const urlPath of [actorPath, auditPath]) {
        const res = await get(urlPath, { key: item.key });
        assert.equal(res.status, 403, `${item.label} ${urlPath} status ${res.status}`);
        assert.equal(res.json.error, FORBIDDEN);
        assertNoStore(res);
        assert.equal(String(res.text).includes(ADMIN_KEY), false);
      }
    }
  });

  await check('GET actors returns only active id/label fields', async () => {
    const res = await get(actorPath);
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assertNoStore(res);
    const ids = res.json.actors.map((row) => row.id);
    assert.ok(ids.includes(fixtures.helperA.id));
    assert.ok(ids.includes(fixtures.helperB.id));
    assert.equal(ids.includes(fixtures.inactive.id), false);
    for (const actor of res.json.actors) {
      assert.deepEqual(Object.keys(actor).sort(), ['id', 'label']);
    }
    assertNoPoison(res.json, 'GET /actors');
  });

  await check('GET audit-history returns the requested reader only', async () => {
    const { value: res, logs } = await withCapturedLogs(() =>
      get(auditPath, { query: { pageSize: '100' } }),
    );
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assertNoStore(res);
    assert.equal(res.json.readerProfileId, fixtures.readerA.readerProfile.id);
    const ids = res.json.items.map((row) => row.id);
    assert.equal(ids.includes(fixtures.otherAudit.id), false);
    const poisoned = res.json.items.find((row) => row.id === fixtures.poisoned.id);
    assert.ok(poisoned);
    assert.equal(poisoned.reason, ADMIN_REASON);
    assert.match(JSON.stringify(res.json), new RegExp(ADMIN_REASON));
    assert.equal(collectKeys(poisoned.before).has('reason'), false);
    assert.equal(collectKeys(poisoned.after).has('reason'), false);
    const other = await get(otherAuditPath, { query: { pageSize: '100' } });
    assert.equal(other.status, 200);
    assert.deepEqual(
      other.json.items.map((row) => row.id),
      [fixtures.otherAudit.id],
    );
    assertNoPoison(res.json, 'GET audit-history A');
    assertNoPoison(other.json, 'GET audit-history B');
    assertNoPoison(logs, 'GET audit-history logs');
  });

  await check('malformed IDs and cursors are rejected', async () => {
    const missing = await get(`${basePath}/readers/missing-profile-id-000/audit-history`);
    assert.equal(missing.status, 404);
    assertNoStore(missing);
    const emptyish = await get(`${basePath}/readers/%20/audit-history`);
    assert.ok(emptyish.status === 400 || emptyish.status === 404, `blank id status ${emptyish.status}`);
    const tooLong = await get(`${basePath}/readers/${'x'.repeat(200)}/audit-history`);
    assert.equal(tooLong.status, 400);
    const badCursor = await get(auditPath, { query: { cursor: 'not-a-cursor' } });
    assert.equal(badCursor.status, 400);
    const oversized = await get(auditPath, { query: { cursor: 'a'.repeat(600) } });
    assert.equal(oversized.status, 400);
    const badPage = await get(auditPath, { query: { pageSize: '999' } });
    assert.equal(badPage.status, 400);
    const foreignCursor = Buffer.from(
      JSON.stringify({ createdAt: '2026-08-20T12:00:10.000Z', id: fixtures.otherAudit.id }),
      'utf8',
    ).toString('base64url');
    const crossed = await get(auditPath, { query: { pageSize: '100', cursor: foreignCursor } });
    assert.equal(crossed.status, 200);
    assert.equal(
      crossed.json.items.some((row) => row.id === fixtures.otherAudit.id),
      false,
    );
  });

  await check('POST/PATCH/PUT/DELETE remain 405 for actor and audit routes', async () => {
    for (const urlPath of [actorPath, auditPath]) {
      for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
        const res = await request({
          method,
          path: urlPath,
          headers: { 'x-admin-key': ADMIN_KEY },
          body: { email: POISON.email, actorId: fixtures.helperA.id },
        });
        assert.ok(res.status === 405 || res.status === 404, `${method} ${urlPath} status ${res.status}`);
        assertNoStore(res);
        assertNoPoison(res.json || res.text, `${method} ${urlPath}`);
      }
    }
  });

  await check('existing reader detail GET still works', async () => {
    const res = await get(`${basePath}/readers/${fixtures.readerA.readerProfile.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.reader.readerProfileId, fixtures.readerA.readerProfile.id);
  });

  await stopServer();

  await check('read calls leave all relevant tables unchanged', async () => {
    const afterSnap = await snapshotTables();
    assert.equal(afterSnap.hash, beforeSnap.hash);
    console.log(`    snapshot hash still ${afterSnap.hash}`);
  });

  if (failed) {
    console.error(`\nverify-reader-lifecycle-actor-audit: ${failed} failed, ${passed} passed`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nverify-reader-lifecycle-actor-audit: ${passed} passed`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopServer().catch(() => {});
    await prisma.$disconnect();
  });
