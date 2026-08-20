#!/usr/bin/env node
/**
 * Local GET-only checks for adminReaderLifecycle.cjs.
 * Requires DATABASE_URL on a disposable SQLite file. Refuses deepquill/dev.db.
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
const { parseListQuery, resolveCrmStatusFilter, isAdminAuthorized } = createAdminReaderLifecycleRouter;

const url = process.env.DATABASE_URL || '';
const normalized = url.replace(/\\/g, '/').toLowerCase();
if (!url.startsWith('file:')) throw new Error('DATABASE_URL must be a sqlite file: URL');
if (normalized.includes('deepquill/dev.db') && !normalized.includes('/temp/') && !normalized.includes('/tmp/')) {
  throw new Error('Refusing to run against the normal local deepquill/dev.db');
}

const ADMIN_KEY = 'checkpoint3b-synthetic-admin-key';
process.env.ADMIN_KEY = ADMIN_KEY;

const prisma = new PrismaClient();
const ACTOR = { actorType: 'admin', actorLabel: 'Kris' };
let failed = 0;
let passed = 0;
let server;
let basePath = '/api/admin/reader-lifecycle';

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`ok  ${name}`);
    })
    .catch((err) => {
      failed += 1;
      console.error(`FAIL ${name}: ${err.message}`);
    });
}

function actorEvidence(extra) {
  return {
    reason: extra.reason || 'synthetic_test',
    origin: extra.origin || 'test',
    originRef: extra.originRef,
    ...ACTOR,
    ...extra,
  };
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
    ReaderEvidence: await prisma.readerEvidence.findMany(),
    ReaderCommunication: await prisma.readerCommunication.findMany(),
    ReaderIdentityReview: await prisma.readerIdentityReview.findMany(),
    ReaderContactDecision: await prisma.readerContactDecision.findMany(),
    ReaderAdminAudit: await prisma.readerAdminAudit.findMany(),
  };
  const normalized = {};
  for (const [name, rows] of Object.entries(tables)) {
    normalized[name] = normalizeRows(rows);
  }
  const json = JSON.stringify(normalized);
  return {
    hash: crypto.createHash('sha256').update(json).digest('hex'),
    byteLength: Buffer.byteLength(json),
  };
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

function adminHeaders(key) {
  const headers = {};
  if (key !== undefined) headers['x-admin-key'] = key;
  return headers;
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

async function seed() {
  const special = {};
  special.website = await prisma.user.create({
    data: {
      email: 'special-website@example.net',
      code: 'spweb',
      referralCode: 'SPWEB',
      fname: 'Web',
      lname: 'Buyer',
      readerProfile: { create: { source: 'Website', readerType: 'interested', status: 'active' } },
      purchases: {
        create: { sessionId: 'cs_web_1', amount: 2499, currency: 'usd', source: 'stripe', saleStatus: 'live' },
      },
    },
    include: { readerProfile: true },
  });
  special.jeff = await prisma.user.create({
    data: {
      email: 'Jeff.Reader@Example.NET',
      code: 'spjeff',
      referralCode: 'SPJEFF',
      fname: 'Jeff',
      firstName: 'Jeff',
      lname: 'Reader',
      readerProfile: { create: { source: 'Website', readerType: 'interested', status: 'active' } },
    },
    include: { readerProfile: true },
  });
  special.bn = await prisma.user.create({
    data: {
      email: 'special-bn@example.net',
      code: 'spbn',
      referralCode: 'SPBN',
      fname: 'Barnes',
      lname: 'Noble',
      readerProfile: { create: { source: 'Barnes & Noble', readerType: 'purchased', status: 'active' } },
    },
    include: { readerProfile: true },
  });
  await prisma.readerEvidence.create({
    data: actorEvidence({
      userId: special.bn.id,
      kind: 'kris_personal_knowledge',
      status: 'provisional',
      sourceLabel: 'Barnes & Noble',
      purchaseDate: new Date('2026-08-10'),
      details: 'Kris personal knowledge',
      originRef: 'bn-1',
    }),
  });
  special.noProfile = await prisma.user.create({
    data: {
      email: 'special-noprofile@example.net',
      code: 'spnoprof',
      referralCode: 'SPNOPROF',
      fname: 'No',
      lname: 'Profile',
      purchases: {
        create: { sessionId: 'cs_noprof_1', amount: 1999, currency: 'usd', source: 'stripe', saleStatus: 'live' },
      },
    },
  });
  await prisma.readerCommunication.create({
    data: {
      userId: special.website.id,
      recipientEmailSnapshot: special.website.email,
      category: 'reader_recommendation_taf',
      templateOrAskId: 'taf_ask_1',
      trigger: 'unknown',
      occurredAt: new Date('2026-06-01T12:00:00Z'),
      outcome: 'recorded_sent_delivery_unknown',
      source: 'user_stamp',
      sourceRef: `${special.website.id}:taf`,
      caption: 'Inferred historical TAF ask #1',
    },
  });
  await prisma.readerContactDecision.create({
    data: {
      userId: special.jeff.id,
      decision: 'suppress',
      reason: 'asked to stop',
      origin: 'admin_decision',
      originRef: 'dnc-jeff',
      ...ACTOR,
    },
  });
  await prisma.readerIdentityReview.create({
    data: {
      primaryUserId: special.jeff.id,
      reasonCode: 'duplicate_name',
      status: 'open',
      details: 'possible duplicate',
      ...ACTOR,
    },
  });

  special.statusActive = await prisma.user.create({
    data: {
      email: 'status-active@example.net',
      code: 'stact',
      referralCode: 'STACT',
      fname: 'StatusActive',
      lname: 'Fixture',
      readerProfile: { create: { source: 'Website', readerType: 'interested', status: 'active' } },
    },
    include: { readerProfile: true },
  });
  special.statusInactive = await prisma.user.create({
    data: {
      email: 'status-inactive@example.net',
      code: 'stinact',
      referralCode: 'STINACT',
      fname: 'StatusInactive',
      lname: 'Fixture',
      readerProfile: { create: { source: 'Website', readerType: 'interested', status: 'inactive' } },
    },
    include: { readerProfile: true },
  });
  special.statusArchived = await prisma.user.create({
    data: {
      email: 'status-archived@example.net',
      code: 'starch',
      referralCode: 'STARCH',
      fname: 'StatusArchived',
      lname: 'Fixture',
      readerProfile: { create: { source: 'Website', readerType: 'interested', status: 'archived' } },
    },
    include: { readerProfile: true },
  });

  const existing = await prisma.readerProfile.count();
  const needed = 520 - existing;
  for (let i = 0; i < needed; i += 1) {
    const n = String(i).padStart(4, '0');
    await prisma.user.create({
      data: {
        email: `pad-${n}@example.net`,
        code: `pad${n}`,
        referralCode: `PAD${n}`,
        fname: 'Pad',
        lname: n,
        readerProfile: {
          create: { source: 'Website', readerType: 'interested', status: 'active', notes: 'padding' },
        },
      },
    });
  }
  return special;
}

function assertNoStore(res) {
  const value = String(res.headers['cache-control'] || '');
  assert.match(value, /no-store/i);
}

function assertNoSecrets(payload) {
  const text = JSON.stringify(payload);
  for (const token of [
    'webhookSecret',
    'client_secret',
    'clientSecret',
    ADMIN_KEY,
    'STRIPE_SECRET',
    'paymentMethod',
  ]) {
    assert.ok(!text.includes(token), `response leaked ${token}`);
  }
}

function auditRouteSource() {
  const src = fs.readFileSync(path.join(__dirname, '../server/routes/adminReaderLifecycle.cjs'), 'utf8');
  const writes = src.match(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g) || [];
  assert.strictEqual(writes.length, 0, `route source write calls: ${writes.join(', ')}`);
  const raw = src.match(/\$(?:execute|query)Raw(?:Unsafe)?\s*[\(`]/g) || [];
  assert.strictEqual(raw.length, 0, `route source raw calls: ${raw.join(', ')}`);
  assert.doesNotMatch(src, /resendPurchaseEmails|adminEmailSend|stripe-webhook|runBackfill|referralPayout/i);
  const logFn = src.match(/function logInternalError[\s\S]*?\n\}/);
  assert.ok(logFn, 'logInternalError missing');
  assert.doesNotMatch(logFn[0], /err\.message|stack|req\.query|req\.path/);
}

function auditIndexMount() {
  const src = fs.readFileSync(path.join(__dirname, '../server/index.cjs'), 'utf8');
  assert.match(src, /app\.use\('\/api\/admin\/readers', adminReadersRouter\)/);
  assert.match(src, /app\.use\('\/api\/admin\/reader-lifecycle', createAdminReaderLifecycleRouter\(readerLifecyclePrisma\)\)/);
  const readersAt = src.indexOf("app.use('/api/admin/readers'");
  const lifecycleAt = src.indexOf("app.use('/api/admin/reader-lifecycle'");
  assert.ok(readersAt >= 0 && lifecycleAt > readersAt);
  assert.match(src, /app\.get\('\/ping'/);
  assert.match(src, /stripeWebhookRouter/);
  const adminReadersFile = fs.readFileSync(path.join(__dirname, '../server/routes/adminReaders.cjs'), 'utf8');
  assert.match(adminReadersFile, /router\.get\('\/'/);
}

async function startServer() {
  const app = express();
  app.get('/ping', (req, res) => res.send('pong'));
  app.use(basePath, createAdminReaderLifecycleRouter(prisma));
  const adminReadersRouter = require('../server/routes/adminReaders.cjs');
  app.use('/api/admin/readers', adminReadersRouter);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

async function stopServer() {
  if (!server) return;
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

function poisonReaderList(client) {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'readerProfile') {
        return new Proxy(target.readerProfile, {
          get(delegate, method) {
            if (method === 'findMany') {
              return async () => {
                const err = new Error('failed for pii-leak@example.net session cs_pii_leak_session');
                err.name = 'PrismaClientKnownRequestError';
                err.code = 'P2025';
                throw err;
              };
            }
            const value = delegate[method];
            return typeof value === 'function' ? value.bind(delegate) : value;
          },
        });
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

async function paginateAll(extraQuery = {}) {
  const ids = [];
  let cursor;
  let pages = 0;
  do {
    const res = await get(`${basePath}/readers`, { query: { pageSize: '100', cursor, ...extraQuery } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.totalCount, null);
    for (const item of res.json.items) ids.push(item.readerProfileId);
    cursor = res.json.nextCursor;
    pages += 1;
    if (pages > 20) throw new Error('pagination did not terminate');
  } while (cursor);
  return ids;
}

async function main() {
  auditRouteSource();
  console.log('ok  route source has no write/raw/email/stripe imports');
  auditIndexMount();
  console.log('ok  index.cjs mount is isolated and does not replace /api/admin/readers');

  const special = await seed();
  const profileCount = await prisma.readerProfile.count();
  assert.ok(profileCount > 500, `expected >500 profiles, got ${profileCount}`);
  const beforeSnap = await snapshotTables();
  console.log(`seeded profiles=${profileCount} snapshot=${beforeSnap.hash}`);

  await startServer();

  await check('/ping still responds', async () => {
    const res = await request({ method: 'GET', path: '/ping' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.text, 'pong');
  });

  const endpoints = [
    `${basePath}/readers`,
    `${basePath}/readers/${special.website.readerProfile.id}`,
    `${basePath}/users/${special.website.id}`,
    `${basePath}/review-queue`,
    `${basePath}/communications`,
    `${basePath}/purchases-without-profile`,
  ];

  await check('missing admin key rejected for every endpoint', async () => {
    for (const urlPath of endpoints) {
      const res = await get(urlPath, { key: null });
      assert.strictEqual(res.status, 403, `${urlPath} missing key status ${res.status}`);
      assertNoStore(res);
      assert.ok(!String(res.text).includes(ADMIN_KEY));
    }
  });

  await check('invalid admin key rejected', async () => {
    for (const urlPath of endpoints) {
      const res = await get(urlPath, { key: 'not-the-admin-key' });
      assert.strictEqual(res.status, 403, `${urlPath} invalid key status ${res.status}`);
      assertNoStore(res);
      assert.ok(!String(res.text).includes(ADMIN_KEY));
    }
  });

  await check('valid admin key accepted', async () => {
    const res = await get(`${basePath}/readers`, { query: { pageSize: '10' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.ok, true);
    assertNoStore(res);
  });

  await check('authentication edge cases return the same 403', async () => {
    const forbidden = [];
    const cases = [
      { label: 'missing', key: null },
      { label: 'empty', key: '' },
      { label: 'short', key: 'x' },
      { label: 'long', key: 'x'.repeat(4096) },
    ];
    const logs = [];
    const origError = console.error;
    console.error = (...args) => {
      logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    };
    try {
      for (const item of cases) {
        const res = await get(`${basePath}/readers`, { key: item.key, query: { pageSize: '1' } });
        assert.strictEqual(res.status, 403, `${item.label} status ${res.status}`);
        assert.deepStrictEqual(res.json, { ok: false, error: 'Forbidden - x-admin-key required in production' });
        assert.ok(!String(res.text).includes(ADMIN_KEY));
        forbidden.push(res.json);
      }
    } finally {
      console.error = origError;
    }
    assert.ok(forbidden.every((row) => row.error === forbidden[0].error));
    const logText = logs.join('\n');
    assert.ok(!logText.includes(ADMIN_KEY), 'auth failures must not log the admin key');
    assert.strictEqual(
      isAdminAuthorized({ headers: { 'x-admin-key': 'неверныйключ' } }),
      false,
    );
    assert.strictEqual(isAdminAuthorized({ headers: { 'x-admin-key': '🔑-wrong-key' } }), false);
    const ok = await get(`${basePath}/readers`, { query: { pageSize: '1' } });
    assert.strictEqual(ok.status, 200);
  });

  await check('unexpected 500 logs are PII-safe', async () => {
    const leakEmail = 'pii-leak@example.net';
    const leakSession = 'cs_pii_leak_session';
    const app = express();
    app.use(basePath, createAdminReaderLifecycleRouter(poisonReaderList(prisma)));
    const poisonServer = http.createServer(app);
    await new Promise((resolve) => poisonServer.listen(0, '127.0.0.1', resolve));
    const previous = server;
    server = poisonServer;
    const logs = [];
    const origError = console.error;
    console.error = (...args) => {
      logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    };
    try {
      const res = await get(`${basePath}/readers`, { query: { pageSize: '10' } });
      assert.strictEqual(res.status, 500);
      assert.deepStrictEqual(res.json, { ok: false, error: 'Internal error' });
      const blob = `${logs.join('\n')}\n${res.text}`;
      assert.ok(!blob.includes(leakEmail), 'leaked email');
      assert.ok(!blob.includes(leakSession), 'leaked session');
      assert.ok(!blob.includes(ADMIN_KEY), 'leaked admin key');
      assert.match(logs.join('\n'), /internal lifecycle read failed/);
      assert.match(logs.join('\n'), /"route":"\/readers"/);
      assert.ok(!logs.join('\n').includes('error.message'));
    } finally {
      console.error = origError;
      server = previous;
      await new Promise((resolve, reject) =>
        poisonServer.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });

  await check('reader list returns classification fields', async () => {
    const res = await get(`${basePath}/readers`, { query: { q: 'special-website@example.net', pageSize: '10' } });
    assert.strictEqual(res.status, 200);
    const row = res.json.items.find((item) => item.userId === special.website.id);
    assert.ok(row);
    assert.strictEqual(row.ownership, 'purchaser');
    assert.ok(row.contactabilityScope);
    assert.strictEqual(row.contactabilityScope.providerSuppressionIntegrated, false);
    assert.strictEqual(row.contactabilityScope.safeToSend, false);
    assert.strictEqual(row.contactabilityScope.notForSendingSystems, true);
    assert.strictEqual(res.json.partial, false);
    assert.strictEqual(res.json.totalCount, null);
    assertNoSecrets(res.json);
  });

  await check('reader detail returns history collections', async () => {
    const res = await get(`${basePath}/readers/${special.website.readerProfile.id}`);
    assert.strictEqual(res.status, 200);
    const detail = res.json.reader;
    assert.ok(Array.isArray(detail.evidenceHistory));
    assert.ok(Array.isArray(detail.purchases));
    assert.ok(Array.isArray(detail.communications));
    assert.ok(Array.isArray(detail.contactDecisions));
    assert.ok(Array.isArray(detail.identityReviews));
    assert.strictEqual(detail.purchases[0].accountingTruth, true);
    assert.strictEqual(detail.communications[0].deliveryKnown, false);
    assert.strictEqual(detail.distinctions.purchasesAreAccountingTruth, true);
    assert.strictEqual(detail.distinctions.providerSuppressionIntegrated, false);
    assert.strictEqual(detail.distinctions.safeToSend, false);
    assertNoSecrets(detail);
    const byUser = await get(`${basePath}/users/${special.website.id}`);
    assert.strictEqual(byUser.status, 200);
    assert.strictEqual(byUser.json.reader.userId, special.website.id);
  });

  await check('missing detail returns 404', async () => {
    const res = await get(`${basePath}/readers/missing-profile-id-000`);
    assert.strictEqual(res.status, 404);
    assertNoStore(res);
  });

  await check('pagination works beyond 500 profiles', async () => {
    const defaultIds = await paginateAll();
    assert.ok(defaultIds.length > 500, `paged ${defaultIds.length}`);
    assert.strictEqual(new Set(defaultIds).size, defaultIds.length);
    assert.ok(!defaultIds.includes(special.statusArchived.readerProfile.id));
    const allIds = await paginateAll({ status: 'all' });
    assert.strictEqual(new Set(allIds).size, allIds.length);
    assert.strictEqual(allIds.length, profileCount);
    assert.ok(allIds.includes(special.statusArchived.readerProfile.id));
  });

  await check('case-insensitive search works', async () => {
    const lower = await get(`${basePath}/readers`, { query: { q: 'jeff', pageSize: '20' } });
    const upper = await get(`${basePath}/readers`, { query: { q: 'JEFF', pageSize: '20' } });
    assert.strictEqual(lower.status, 200);
    assert.strictEqual(upper.status, 200);
    assert.ok(lower.json.items.some((row) => row.userId === special.jeff.id));
    assert.ok(upper.json.items.some((row) => row.userId === special.jeff.id));
  });

  await check('status filter semantics', async () => {
    const parsedAll = parseListQuery({ status: 'all', pageSize: '10' });
    assert.strictEqual(parsedAll.status, undefined);
    assert.strictEqual(parsedAll.includeArchived, true);
    assert.deepStrictEqual(resolveCrmStatusFilter('all', false), { includeArchived: true });
    assert.deepStrictEqual(resolveCrmStatusFilter('active', true), { status: 'active' });
    assert.deepStrictEqual(resolveCrmStatusFilter(undefined, true), { includeArchived: true });
    assert.deepStrictEqual(resolveCrmStatusFilter(undefined, undefined), {});

    async function found(q, query) {
      const res = await get(`${basePath}/readers`, { query: { q, pageSize: '20', ...query } });
      assert.strictEqual(res.status, 200, `status search ${q} ${JSON.stringify(query)} -> ${res.status}`);
      return {
        active: res.json.items.some((row) => row.userId === special.statusActive.id),
        inactive: res.json.items.some((row) => row.userId === special.statusInactive.id),
        archived: res.json.items.some((row) => row.userId === special.statusArchived.id),
        items: res.json.items,
      };
    }

    const defActive = await found('StatusActive', {});
    assert.ok(defActive.active);
    const defArchived = await found('StatusArchived', {});
    assert.ok(!defArchived.archived, 'default must exclude archived');
    const defInactive = await found('StatusInactive', {});
    assert.ok(defInactive.inactive);

    const allArchived = await found('StatusArchived', { status: 'all' });
    assert.ok(allArchived.archived);
    const allInactive = await found('StatusInactive', { status: 'all' });
    assert.ok(allInactive.inactive);
    const allActive = await found('StatusActive', { status: 'all' });
    assert.ok(allActive.active);

    const includeArchived = await found('StatusArchived', { includeArchived: 'true' });
    assert.ok(includeArchived.archived);

    const onlyArchived = await found('StatusArchived', { status: 'archived' });
    assert.ok(onlyArchived.archived);
    assert.ok(onlyArchived.items.every((row) => row.legacy.status === 'archived'));
    const activeVsArchived = await found('StatusActive', { status: 'archived' });
    assert.ok(!activeVsArchived.active);
    const onlyActive = await found('StatusActive', { status: 'active' });
    assert.ok(onlyActive.active);
    assert.ok(onlyActive.items.every((row) => row.legacy.status === 'active'));
    const onlyInactive = await found('StatusInactive', { status: 'inactive' });
    assert.ok(onlyInactive.inactive);
    assert.ok(onlyInactive.items.every((row) => row.legacy.status === 'inactive'));

    const specificWins = await found('StatusArchived', { status: 'active', includeArchived: 'true' });
    assert.ok(!specificWins.archived, 'specific status must win over includeArchived');
  });

  await check('derived filters work', async () => {
    const res = await get(`${basePath}/readers`, { query: { ownership: 'purchaser', pageSize: '50' } });
    assert.strictEqual(res.status, 200);
    assert.ok(res.json.items.every((row) => row.ownership === 'purchaser'));
    assert.ok(res.json.items.some((row) => row.userId === special.website.id));
    assert.ok('partial' in res.json);
    assert.ok('hasMore' in res.json);
    assert.strictEqual(res.json.totalCount, null);
  });

  await check('malformed cursor returns 400', async () => {
    const res = await get(`${basePath}/readers`, { query: { cursor: 'not-a-cursor' } });
    assert.strictEqual(res.status, 400);
    assertNoStore(res);
  });

  await check('oversized cursor returns 400', async () => {
    const res = await get(`${basePath}/readers`, { query: { cursor: 'a'.repeat(600) } });
    assert.strictEqual(res.status, 400);
  });

  await check('invalid page sizes return 400', async () => {
    for (const pageSize of ['0', '-1', '101', '500', 'abc']) {
      const res = await get(`${basePath}/readers`, { query: { pageSize } });
      assert.strictEqual(res.status, 400, `pageSize=${pageSize} status ${res.status}`);
    }
    const ok = await get(`${basePath}/readers`);
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.json.pageSize, 50);
  });

  await check('invalid enum/filter returns 400', async () => {
    const res = await get(`${basePath}/readers`, { query: { ownership: 'not-a-class' } });
    assert.strictEqual(res.status, 400);
  });

  await check('invalid and reversed date ranges return 400', async () => {
    const invalid = await get(`${basePath}/communications`, { query: { from: 'not-a-date' } });
    assert.strictEqual(invalid.status, 400);
    const reversed = await get(`${basePath}/communications`, {
      query: { from: '2026-08-10', to: '2026-08-01' },
    });
    assert.strictEqual(reversed.status, 400);
  });

  await check('partial and scan cursor pass through unchanged', async () => {
    const res = await get(`${basePath}/readers`, { query: { q: 'pad', pageSize: '50' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(typeof res.json.partial, 'boolean');
    assert.ok(res.json.nextCursor);
    assert.strictEqual(res.json.totalCount, null);
    const page2 = await get(`${basePath}/readers`, {
      query: { q: 'pad', pageSize: '50', cursor: res.json.nextCursor },
    });
    assert.strictEqual(page2.status, 200);
    const overlap = res.json.items.filter((a) =>
      page2.json.items.some((b) => b.readerProfileId === a.readerProfileId),
    );
    assert.strictEqual(overlap.length, 0);
  });

  await check('communication activity filters work', async () => {
    const res = await get(`${basePath}/communications`, {
      query: { category: 'reader_recommendation_taf', q: 'inferred' },
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.json.items.every((row) => row.category === 'reader_recommendation_taf'));
    assert.ok(res.json.items.some((row) => row.userId === special.website.id));
    assert.strictEqual(res.json.items[0].deliveryKnown, false);
  });

  await check('review queues work', async () => {
    const open = await get(`${basePath}/review-queue`, { query: { kind: 'identity_open' } });
    assert.strictEqual(open.status, 200);
    assert.ok(open.json.items.some((row) => row.primaryUserId === special.jeff.id));
    assert.ok(open.json.items.every((row) => row.automaticMerge === false));
    const incomplete = await get(`${basePath}/review-queue`, { query: { kind: 'incomplete' } });
    assert.strictEqual(incomplete.status, 200);
    assert.ok(incomplete.json.items.some((row) => row.userId === special.bn.id));
  });

  await check('purchase-without-profile queue works', async () => {
    const res = await get(`${basePath}/purchases-without-profile`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.json.items.some((row) => row.userId === special.noProfile.id));
  });

  await check('responses use Cache-Control no-store', async () => {
    const ok = await get(`${basePath}/readers`, { query: { pageSize: '1' } });
    const bad = await get(`${basePath}/readers`, { query: { pageSize: '999' } });
    assertNoStore(ok);
    assertNoStore(bad);
  });

  await check('no response exposes forbidden secret or metadata fields', async () => {
    const res = await get(`${basePath}/readers/${special.website.readerProfile.id}`);
    assertNoSecrets(res.json);
    const keys = JSON.stringify(res.json);
    assert.ok(!keys.includes('"metadata"'));
  });

  await check('POST/PATCH/PUT/DELETE do not execute handlers', async () => {
    const urlPath = `${basePath}/readers`;
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      const res = await request({
        method,
        path: urlPath,
        headers: adminHeaders(ADMIN_KEY),
        body: { email: 'attacker@example.net' },
      });
      assert.ok(res.status === 405 || res.status === 404, `${method} status ${res.status}`);
      assertNoStore(res);
    }
  });

  await check('/ping still responds after rejected methods', async () => {
    const res = await request({ method: 'GET', path: '/ping' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.text, 'pong');
  });

  await check('existing /api/admin/readers remains mounted', async () => {
    const res = await get('/api/admin/readers');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.ok, true);
    assert.ok(Array.isArray(res.json.readers));
  });

  await check('row snapshot hash unchanged after GET and rejected methods', async () => {
    const afterSnap = await snapshotTables();
    assert.strictEqual(afterSnap.hash, beforeSnap.hash);
    console.log(`    snapshot hash still ${afterSnap.hash}`);
  });

  if (failed) {
    console.error(`\nverify-reader-lifecycle-api: ${failed} failed, ${passed} passed`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nverify-reader-lifecycle-api: ${passed} passed; profiles=${profileCount}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await stopServer();
    } catch {
      /* ignore */
    }
    await prisma.$disconnect();
  });
