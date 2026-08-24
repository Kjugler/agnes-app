#!/usr/bin/env node
/**
 * HTTP checks for adminReaderLifecycleWrite.cjs (Checkpoint 5C).
 * Disposable SQLite only. Refuses deepquill/dev.db.
 */
process.env.NODE_ENV = 'test';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const createAdminReaderLifecycleWriteRouter = require('../server/routes/adminReaderLifecycleWrite.cjs');
const createAdminReaderLifecycleRouter = require('../server/routes/adminReaderLifecycle.cjs');
const { IDEMPOTENCY_ORIGIN } = require('../lib/readers/readerLifecycleWrite.cjs');

const url = process.env.DATABASE_URL || '';
const normalized = url.replace(/\\/g, '/').toLowerCase();
if (!url.startsWith('file:')) throw new Error('DATABASE_URL must be a sqlite file: URL');
if (normalized.includes('deepquill/dev.db') && !normalized.includes('/temp/') && !normalized.includes('/tmp/')) {
  throw new Error('Refusing to run against the normal local deepquill/dev.db');
}

const ADMIN_KEY = 'checkpoint5c-synthetic-admin-key';
process.env.ADMIN_KEY = ADMIN_KEY;
const FORBIDDEN = 'Forbidden - x-admin-key required in production';
const prisma = new PrismaClient();
const suffix = `cp5c${Date.now()}`;
const basePath = '/api/admin/reader-lifecycle';
let failed = 0;
let passed = 0;
let server;
let keySeq = 0;

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

function nextKey(label) {
  keySeq += 1;
  return `${suffix}-${label}-${keySeq}`;
}

function canonicalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return String(value);
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  if (value === undefined) return null;
  return value;
}

async function snapshotAccounting() {
  const tables = {
    Purchase: await prisma.purchase.findMany(),
    Order: await prisma.order.findMany(),
    ReferralConversion: await prisma.referralConversion.findMany(),
    ReaderCommunication: await prisma.readerCommunication.findMany(),
    Ledger: await prisma.ledger.findMany(),
  };
  const json = JSON.stringify(
    Object.fromEntries(
      Object.entries(tables).map(([name, rows]) => [
        name,
        rows.map(canonicalize).sort((a, b) => String(a.id || '').localeCompare(String(b.id || ''))),
      ]),
    ),
  );
  return crypto.createHash('sha256').update(json).digest('hex');
}

async function createUser(label, extra = {}) {
  const token = `${suffix}${label}`.replace(/[^a-z0-9]/gi, '').slice(0, 20);
  return prisma.user.create({
    data: {
      email: extra.email || `${token}@example.net`,
      code: token,
      referralCode: token.toUpperCase(),
      fname: extra.fname || label,
      lname: extra.lname || 'Reader',
      readerProfile: {
        create: {
          source: extra.source || 'Website',
          readerType: extra.readerType || 'interested',
          status: 'active',
        },
      },
      ...(extra.purchase ? { purchases: { create: extra.purchase } } : {}),
    },
    include: { readerProfile: true, purchases: true },
  });
}

function request({ method = 'GET', path: urlPath, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const payload = body == null ? null : typeof body === 'string' ? body : JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path: urlPath,
        method,
        headers: {
          Connection: 'close',
          ...headers,
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
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
    if (payload) req.write(payload);
    req.end();
  });
}

function adminHeaders(extra = {}, key = ADMIN_KEY) {
  const headers = { ...extra };
  if (key !== null && key !== undefined) headers['x-admin-key'] = key;
  return headers;
}

function post(urlPath, body, extraHeaders = {}, key = ADMIN_KEY) {
  return request({
    method: 'POST',
    path: urlPath,
    headers: adminHeaders(extraHeaders, key),
    body,
  });
}

function get(urlPath, key = ADMIN_KEY) {
  return request({ method: 'GET', path: urlPath, headers: adminHeaders({}, key) });
}

function assertNoStore(res) {
  assert.match(String(res.headers['cache-control'] || ''), /no-store/i);
}

function assertJson(res) {
  assert.match(String(res.headers['content-type'] || ''), /application\/json/i);
}

function assertError(res, status, error) {
  assert.strictEqual(res.status, status, res.text);
  assertNoStore(res);
  assertJson(res);
  assert.strictEqual(res.json.ok, false);
  if (error) assert.strictEqual(res.json.error, error);
  assert.ok(!res.text.includes(ADMIN_KEY));
}

function evidencePath(profileId) {
  return `${basePath}/readers/${profileId}/evidence`;
}

async function startServer(client) {
  const app = express();
  app.use(express.json());
  app.get('/ping', (req, res) => res.send('pong'));
  app.use(basePath, createAdminReaderLifecycleWriteRouter(client));
  app.use(basePath, createAdminReaderLifecycleRouter(client));
  const adminReadersRouter = require('../server/routes/adminReaders.cjs');
  app.use('/api/admin/readers', adminReadersRouter);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

async function stopServer() {
  if (!server) return;
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  server = null;
}

function auditSources() {
  const writeSrc = fs.readFileSync(
    path.join(__dirname, '../server/routes/adminReaderLifecycleWrite.cjs'),
    'utf8',
  );
  const getSrc = fs.readFileSync(
    path.join(__dirname, '../server/routes/adminReaderLifecycle.cjs'),
    'utf8',
  );
  const indexSrc = fs.readFileSync(path.join(__dirname, '../server/index.cjs'), 'utf8');
  assert.match(writeSrc, /createReaderLifecycleWriteService/);
  assert.doesNotMatch(writeSrc, /classifyReader\(/);
  assert.doesNotMatch(writeSrc, /sendEmail|nodemailer|mailchimp|runBackfill|runReaderRecommendation|stripe-webhook/);
  const posts = writeSrc.match(/router\.post\(/g) || [];
  assert.strictEqual(posts.length, 8);
  assert.match(getSrc, /if \(req\.method !== 'GET'\)/);
  assert.doesNotMatch(getSrc, /createReaderLifecycleWriteService/);
  const writeMount = indexSrc.indexOf("createAdminReaderLifecycleWriteRouter(readerLifecyclePrisma)");
  const getMount = indexSrc.indexOf("app.use('/api/admin/reader-lifecycle', createAdminReaderLifecycleRouter(readerLifecyclePrisma))");
  const readersMount = indexSrc.indexOf("app.use('/api/admin/readers'");
  assert.ok(readersMount >= 0 && writeMount > readersMount && getMount > writeMount);
  const logFn = writeSrc.match(/function logInternalError[\s\S]*?\n\}/);
  assert.ok(logFn);
  assert.doesNotMatch(logFn[0], /err\.message|stack|req\.body|req\.params|req\.query|req\.path|idempotency/i);
}

function poisonAuditCreate(client) {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === '$transaction') {
        return (fn, options) =>
          target.$transaction(async (tx) => {
            const wrapped = new Proxy(tx, {
              get(inner, name) {
                if (name === 'readerAdminAudit') {
                  return new Proxy(inner.readerAdminAudit, {
                    get(delegate, method, rec) {
                      if (method === 'create') {
                        return async () => {
                          const err = new Error(
                            'forced for leak@example.net phone 555-010-1234 key checkpoint5c-synthetic-admin-key idempotency SECRET_IDEM_KEY',
                          );
                          err.name = 'PrismaClientKnownRequestError';
                          err.code = 'P2025';
                          throw err;
                        };
                      }
                      const value = Reflect.get(delegate, method, rec);
                      return typeof value === 'function' ? value.bind(delegate) : value;
                    },
                  });
                }
                const value = Reflect.get(inner, name);
                return typeof value === 'function' ? value.bind(inner) : value;
              },
            });
            return fn(wrapped);
          }, options);
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

async function main() {
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  auditSources();
  console.log('ok  source audit: eight POST routes, write service used, GET router untouched');

  const helper = await prisma.fulfillmentUser.create({
    data: { name: 'Kris', email: `kris-${suffix}@fulfillment.test`, active: true },
  });
  const resolver = await prisma.fulfillmentUser.create({
    data: { name: 'Denise', email: `denise-${suffix}@fulfillment.test`, active: true },
  });
  const amazonReader = await createUser('az', { source: 'Amazon', readerType: 'purchased' });
  const bnReader = await createUser('bn', { source: 'Barnes & Noble', readerType: 'purchased' });
  const otherReader = await createUser('ot');
  const giftReader = await createUser('gf', { source: 'Gift', readerType: 'gifted' });
  const confirmReader = await createUser('cf');
  const correctReader = await createUser('cr');
  const disputeReader = await createUser('dp');
  const dncReader = await createUser('dn');
  const identityReader = await createUser('id');
  const otherPerson = await createUser('op');
  const staleReader = await createUser('st');
  const rollbackReader = await createUser('rb');
  const websiteReader = await createUser('ws', {
    purchase: {
      sessionId: `cs_${suffix}_web`,
      amount: 2499,
      currency: 'usd',
      source: 'stripe',
      saleStatus: 'live',
    },
  });
  await prisma.readerEvidence.create({
    data: {
      userId: websiteReader.id,
      kind: 'website_stripe',
      status: 'confirmed',
      reason: 'synthetic website evidence',
      origin: 'test',
      originRef: `${suffix}-web`,
      actorType: 'admin',
      actorLabel: 'Test',
    },
  });

  const accountingBefore = await snapshotAccounting();
  const evidenceBefore = await prisma.readerEvidence.count();
  await startServer(prisma);

  const addBody = {
    kind: 'manual_amazon',
    purchaseDate: '2026-07-01',
    details: 'Personally known Amazon order',
    reason: 'Known Amazon purchase evidence',
    actorId: helper.id,
  };

  await check('missing, empty, short, long, unicode keys share 403 and do not mutate', async () => {
    const before = await prisma.readerEvidence.count();
    const cases = [
      post(evidencePath(amazonReader.readerProfile.id), addBody, { 'Idempotency-Key': nextKey('auth') }, null),
      post(evidencePath(amazonReader.readerProfile.id), addBody, { 'Idempotency-Key': nextKey('auth') }, ''),
      post(evidencePath(amazonReader.readerProfile.id), addBody, { 'Idempotency-Key': nextKey('auth') }, 'short'),
      post(
        evidencePath(amazonReader.readerProfile.id),
        addBody,
        { 'Idempotency-Key': nextKey('auth') },
        `${ADMIN_KEY}-wrong-long-key`,
      ),
      post(
        evidencePath(amazonReader.readerProfile.id),
        addBody,
        { 'Idempotency-Key': nextKey('auth') },
        ADMIN_KEY.replace(/.$/, 'x'),
      ),
    ];
    const responses = await Promise.all(cases);
    const first = responses[0];
    assertError(first, 403, FORBIDDEN);
    for (const res of responses) {
      assert.strictEqual(res.status, 403);
      assert.deepStrictEqual(res.json, first.json);
      assertNoStore(res);
      assert.ok(!res.text.includes(ADMIN_KEY));
    }
    const { isAdminAuthorized } = createAdminReaderLifecycleWriteRouter;
    assert.strictEqual(isAdminAuthorized({ headers: { 'x-admin-key': 'ключ' } }), false);
    assert.strictEqual(isAdminAuthorized({ headers: { 'x-admin-key': `${ADMIN_KEY}\u0000` } }), false);
    assert.strictEqual(isAdminAuthorized({ headers: { 'x-admin-key': `\uFEFF${ADMIN_KEY}` } }), false);
    assert.strictEqual(await prisma.readerEvidence.count(), before);
  });

  await check('query/body credentials are ignored; header is required', async () => {
    const res = await request({
      method: 'POST',
      path: `${evidencePath(amazonReader.readerProfile.id)}?adminKey=${ADMIN_KEY}`,
      headers: { 'Idempotency-Key': nextKey('qauth'), 'Content-Type': 'application/json' },
      body: { ...addBody, ADMIN_KEY },
    });
    assertError(res, 403, FORBIDDEN);
  });

  await check('correct admin key can add provisional Amazon evidence', async () => {
    const amazonKey = nextKey('amazon');
    const res = await post(evidencePath(amazonReader.readerProfile.id), addBody, {
      'Idempotency-Key': amazonKey,
    });
    assert.strictEqual(res.status, 200, res.text);
    assertNoStore(res);
    assertJson(res);
    assert.strictEqual(res.json.ok, true);
    assert.strictEqual(res.json.replay, false);
    assert.strictEqual(res.json.reader.ownership, 'purchaser');
    assert.ok(res.json.reader.sources.includes('amazon'));
    assert.strictEqual(res.json.reader.nurtureSuppressed, true);
    amazonReader._key = amazonKey;
    amazonReader._mutation = res.json.mutation;
  });

  await check('GET lifecycle endpoints still work and do not mutate', async () => {
    const before = await prisma.readerEvidence.count();
    const list = await get(`${basePath}/readers?pageSize=10`);
    assert.strictEqual(list.status, 200, list.text);
    assert.strictEqual(list.json.ok, true);
    assert.ok(Array.isArray(list.json.items));
    const detail = await get(`${basePath}/readers/${amazonReader.readerProfile.id}`);
    assert.strictEqual(detail.status, 200);
    assert.ok(detail.json.reader);
    assert.ok(!('replay' in detail.json));
    const byUser = await get(`${basePath}/users/${amazonReader.id}`);
    assert.strictEqual(byUser.status, 200);
    const queue = await get(`${basePath}/review-queue`);
    assert.strictEqual(queue.status, 200);
    const comms = await get(`${basePath}/communications`);
    assert.strictEqual(comms.status, 200);
    const purchases = await get(`${basePath}/purchases-without-profile`);
    assert.strictEqual(purchases.status, 200);
    assert.strictEqual(await prisma.readerEvidence.count(), before);
  });

  await check('existing /api/admin/readers still works', async () => {
    const res = await get('/api/admin/readers');
    assert.strictEqual(res.status, 200, res.text);
    assert.strictEqual(res.json.ok, true);
    assert.ok(Array.isArray(res.json.readers));
  });

  await check('PUT/PATCH/DELETE and unapproved POST remain 405', async () => {
    const paths = [
      `${basePath}/readers`,
      `${basePath}/readers/${amazonReader.readerProfile.id}`,
      `${basePath}/review-queue`,
      `${basePath}/readers/${amazonReader.readerProfile.id}/notes`,
    ];
    for (const urlPath of paths) {
      for (const method of ['PUT', 'PATCH', 'DELETE']) {
        const res = await request({
          method,
          path: urlPath,
          headers: adminHeaders({ 'Idempotency-Key': nextKey('m') }),
          body: { reason: 'should not write anything here' },
        });
        assert.strictEqual(res.status, 405, `${method} ${urlPath} ${res.status}`);
        assertNoStore(res);
      }
    }
    const unapproved = await post(`${basePath}/readers`, addBody, { 'Idempotency-Key': nextKey('unapp') });
    assert.strictEqual(unapproved.status, 405, unapproved.text);
    assertError(unapproved, 405, 'Method not allowed');
  });

  await check('Idempotency-Key validation', async () => {
    const urlPath = evidencePath(amazonReader.readerProfile.id);
    assertError(await post(urlPath, addBody), 400, 'invalid_idempotency_key');
    assertError(await post(urlPath, addBody, { 'Idempotency-Key': '' }), 400, 'invalid_idempotency_key');
    assertError(await post(urlPath, addBody, { 'Idempotency-Key': 'short' }), 400, 'invalid_idempotency_key');
    assertError(
      await post(urlPath, addBody, { 'Idempotency-Key': 'a'.repeat(129) }),
      400,
      'invalid_idempotency_key',
    );
    assertError(await post(urlPath, addBody, { 'Idempotency-Key': 'bad key!!' }), 400, 'invalid_idempotency_key');
    assertError(
      await post(urlPath, addBody, { 'Idempotency-Key': `${nextKey('one')},${nextKey('two')}` }),
      400,
      'invalid_idempotency_key',
    );
  });

  await check('unknown fields, invalid ids, kinds, dates, reasons, actor, injections', async () => {
    const urlPath = evidencePath(amazonReader.readerProfile.id);
    assertError(await post(`${basePath}/readers/${'x'.repeat(129)}/evidence`, addBody, { 'Idempotency-Key': nextKey('id') }), 400, 'invalid_id');
    assertError(
      await post(urlPath, { ...addBody, extra: true }, { 'Idempotency-Key': nextKey('unk') }),
      400,
      'unknown_field',
    );
    assertError(
      await post(urlPath, { ...addBody, kind: 'not_a_kind' }, { 'Idempotency-Key': nextKey('kind') }),
      400,
      'invalid_kind',
    );
    assertError(
      await post(urlPath, { ...addBody, reason: 'short' }, { 'Idempotency-Key': nextKey('rsn') }),
      400,
      'invalid_reason',
    );
    assertError(
      await post(urlPath, { ...addBody, reason: 'r'.repeat(501) }, { 'Idempotency-Key': nextKey('rsn2') }),
      400,
      'invalid_reason',
    );
    assertError(
      await post(urlPath, { ...addBody, purchaseDate: 'not-a-date' }, { 'Idempotency-Key': nextKey('dt') }),
      400,
      'invalid_purchase_date',
    );
    const missingActor = { ...addBody };
    delete missingActor.actorId;
    assertError(await post(urlPath, missingActor, { 'Idempotency-Key': nextKey('act') }), 400, 'invalid_id');
    assertError(
      await post(urlPath, { ...addBody, origin: 'admin_manual' }, { 'Idempotency-Key': nextKey('ori') }),
      400,
      'unknown_field',
    );
    assertError(
      await post(urlPath, { ...addBody, actorType: 'admin', actorLabel: 'Kris' }, { 'Idempotency-Key': nextKey('act2') }),
      400,
      'unknown_field',
    );
    assertError(
      await post(urlPath, { ...addBody, stripeSessionId: 'cs_typed' }, { 'Idempotency-Key': nextKey('ss') }),
      400,
      'unknown_field',
    );
    assertError(
      await post(urlPath, { ...addBody, kind: 'website_stripe' }, { 'Idempotency-Key': nextKey('web') }),
      409,
      'website_purchase_protected',
    );
    assertError(
      await post(
        `${basePath}/readers/${identityReader.readerProfile.id}/identity-reviews`,
        { reasonCode: 'other', reason: 'Need a free-form hold now', actorId: helper.id, details: 'short' },
        { 'Idempotency-Key': nextKey('oth') },
      ),
      400,
      'invalid_details',
    );
  });

  await check('add B&N, other, and gifted evidence', async () => {
    const bn = await post(
      evidencePath(bnReader.readerProfile.id),
      {
        kind: 'manual_bn',
        purchaseDate: '2026-06-15',
        details: 'Signing copy',
        reason: 'Personally known B&N purchase',
        actorId: helper.id,
      },
      { 'Idempotency-Key': nextKey('bn') },
    );
    assert.strictEqual(bn.status, 200, bn.text);
    assert.ok(bn.json.reader.sources.includes('barnes_noble'));
    const other = await post(
      evidencePath(otherReader.readerProfile.id),
      { kind: 'manual_other', details: 'Indie bookstore', reason: 'Known other-retailer purchase', actorId: helper.id },
      { 'Idempotency-Key': nextKey('other') },
    );
    assert.strictEqual(other.status, 200, other.text);
    assert.ok(other.json.reader.sources.includes('other'));
    const gift = await post(
      evidencePath(giftReader.readerProfile.id),
      {
        kind: 'gift_book_owner',
        purchaseDate: '2026-04-01',
        details: 'Gifted at event',
        reason: 'Owns a gifted copy, did not buy',
        actorId: helper.id,
      },
      { 'Idempotency-Key': nextKey('gift') },
    );
    assert.strictEqual(gift.status, 200, gift.text);
    assert.strictEqual(gift.json.reader.ownership, 'book_owner_gifted');
  });

  await check('second Amazon evidence returns warning', async () => {
    const res = await post(
      evidencePath(amazonReader.readerProfile.id),
      {
        kind: 'manual_amazon',
        purchaseDate: '2026-08-02',
        details: 'Second known purchase',
        reason: 'Another personally known Amazon order',
        actorId: helper.id,
      },
      { 'Idempotency-Key': nextKey('amazon2') },
    );
    assert.strictEqual(res.status, 200, res.text);
    assert.ok(res.json.warnings.includes('multiple_current_same_kind'));
  });

  await check('same-key replay returns 200 without a second mutation', async () => {
    const before = await prisma.readerEvidence.count({ where: { userId: amazonReader.id, origin: 'admin_manual' } });
    const res = await post(evidencePath(amazonReader.readerProfile.id), addBody, {
      'Idempotency-Key': amazonReader._key,
    });
    assert.strictEqual(res.status, 200, res.text);
    assert.strictEqual(res.json.replay, true);
    assert.strictEqual(res.json.mutation.entityId, amazonReader._mutation.entityId);
    assert.ok(res.json.reader.evidenceHistory.some((row) => row.status === 'provisional'));
    const after = await prisma.readerEvidence.count({ where: { userId: amazonReader.id, origin: 'admin_manual' } });
    assert.strictEqual(after, before);
  });

  await check('same key with different body or action is 409', async () => {
    assertError(
      await post(
        evidencePath(amazonReader.readerProfile.id),
        { ...addBody, purchaseDate: '2026-09-01' },
        { 'Idempotency-Key': amazonReader._key },
      ),
      409,
      'idempotency_conflict',
    );
    assertError(
      await post(
        `${basePath}/readers/${amazonReader.readerProfile.id}/contact-decisions`,
        { decision: 'suppress', reason: 'Reuse Amazon add key for DNC', actorId: helper.id },
        { 'Idempotency-Key': amazonReader._key },
      ),
      409,
      'idempotency_conflict',
    );
  });

  await check('confirm, correct, dispute, and replace over HTTP', async () => {
    const added = await post(
      evidencePath(confirmReader.readerProfile.id),
      {
        kind: 'manual_bn',
        purchaseDate: '2026-05-01',
        details: 'Need to confirm later',
        reason: 'Provisional B&N knowledge',
        actorId: helper.id,
      },
      { 'Idempotency-Key': nextKey('cadd') },
    );
    const provisional = added.json.reader.evidenceHistory.find((row) => row.status === 'provisional');
    const confirmed = await post(
      `${basePath}/evidence/${provisional.id}/confirm`,
      { expectedStatus: 'provisional', reason: 'Reporting later confirmed this purchase', actorId: helper.id },
      { 'Idempotency-Key': nextKey('confirm') },
    );
    assert.strictEqual(confirmed.status, 200, confirmed.text);
    assert.strictEqual(confirmed.json.reader.confidence, 'confirmed');
    const old = await prisma.readerEvidence.findUnique({ where: { id: provisional.id } });
    assert.strictEqual(old.status, 'superseded');

    const toCorrect = await post(
      evidencePath(correctReader.readerProfile.id),
      {
        kind: 'manual_amazon',
        purchaseDate: '2026-01-01',
        details: 'Wrong retailer and date',
        reason: 'First guess at the purchase',
        actorId: helper.id,
      },
      { 'Idempotency-Key': nextKey('cradd') },
    );
    const current = toCorrect.json.reader.evidenceHistory.find((row) => row.kind === 'manual_amazon');
    const corrected = await post(
      `${basePath}/evidence/${current.id}/correct`,
      {
        expectedStatus: 'provisional',
        kind: 'manual_bn',
        purchaseDate: '2026-03-15',
        details: 'Corrected to Barnes & Noble',
        reason: 'Better evidence arrived later',
        actorId: helper.id,
      },
      { 'Idempotency-Key': nextKey('correct') },
    );
    assert.strictEqual(corrected.status, 200, corrected.text);
    assert.ok(corrected.json.reader.sources.includes('barnes_noble'));

    const toDispute = await post(
      evidencePath(disputeReader.readerProfile.id),
      {
        kind: 'manual_amazon',
        purchaseDate: '2026-02-02',
        details: 'May be the wrong person',
        reason: 'Uncertain Amazon association',
        actorId: helper.id,
      },
      { 'Idempotency-Key': nextKey('dadd') },
    );
    const disputedId = toDispute.json.reader.evidenceHistory.find((row) => row.status === 'provisional').id;
    const disputed = await post(
      `${basePath}/evidence/${disputedId}/dispute`,
      { expectedStatus: 'provisional', reason: 'This was associated to the wrong reader', actorId: helper.id },
      { 'Idempotency-Key': nextKey('disp') },
    );
    assert.strictEqual(disputed.status, 200, disputed.text);
    assert.strictEqual(disputed.json.reader.review, 'conflicting');
    const replaced = await post(
      `${basePath}/evidence/${disputedId}/replace`,
      {
        expectedStatus: 'disputed',
        kind: 'gift_book_owner',
        details: 'Owns a gifted copy instead',
        reason: 'Replacement after dispute: gifted owner',
        actorId: helper.id,
      },
      { 'Idempotency-Key': nextKey('repl') },
    );
    assert.strictEqual(replaced.status, 200, replaced.text);
    assert.strictEqual(replaced.json.reader.ownership, 'book_owner_gifted');
  });

  await check('stale mutation returns 409', async () => {
    const added = await post(
      evidencePath(staleReader.readerProfile.id),
      { kind: 'manual_other', details: 'Will be confirmed', reason: 'Setup for stale write conflict', actorId: helper.id },
      { 'Idempotency-Key': nextKey('stale-add') },
    );
    const current = added.json.reader.evidenceHistory.find((row) => row.status === 'provisional');
    await post(
      `${basePath}/evidence/${current.id}/confirm`,
      { expectedStatus: 'provisional', reason: 'First writer confirmed this row', actorId: helper.id },
      { 'Idempotency-Key': nextKey('stale-confirm') },
    );
    assertError(
      await post(
        `${basePath}/evidence/${current.id}/correct`,
        { expectedStatus: 'provisional', details: 'Second writer is stale', reason: 'This correction should fail as stale', actorId: helper.id },
        { 'Idempotency-Key': nextKey('stale-correct') },
      ),
      409,
      'stale_evidence',
    );
  });

  await check('DNC then allow over HTTP', async () => {
    const suppressed = await post(
      `${basePath}/readers/${dncReader.readerProfile.id}/contact-decisions`,
      { decision: 'suppress', reason: 'Reader asked not to be contacted', actorId: helper.id },
      { 'Idempotency-Key': nextKey('dnc') },
    );
    assert.strictEqual(suppressed.status, 200, suppressed.text);
    assert.strictEqual(suppressed.json.reader.contactability, 'suppressed_do_not_contact');
    const allowed = await post(
      `${basePath}/readers/${dncReader.readerProfile.id}/contact-decisions`,
      { decision: 'allow', reason: 'Reader later asked to resume contact', actorId: helper.id },
      { 'Idempotency-Key': nextKey('allow') },
    );
    assert.strictEqual(allowed.status, 200, allowed.text);
    assert.strictEqual(allowed.json.reader.contactability, 'contactable');
  });

  await check('open and resolve identity review preserving opener', async () => {
    const opened = await post(
      `${basePath}/readers/${identityReader.readerProfile.id}/identity-reviews`,
      {
        reasonCode: 'duplicate_name',
        details: 'Possible duplicate of another reader',
        otherUserId: otherPerson.id,
        reason: 'Names appear to collide',
        actorId: helper.id,
      },
      { 'Idempotency-Key': nextKey('open') },
    );
    assert.strictEqual(opened.status, 200, opened.text);
    assert.strictEqual(opened.json.reader.review, 'identity_review_required');
    const reviewId = opened.json.mutation.entityId;
    const resolved = await post(
      `${basePath}/identity-reviews/${reviewId}/resolve`,
      {
        status: 'resolved_keep_separate',
        resolutionReason: 'Confirmed they are different people',
        expectedStatus: 'open',
        actorId: resolver.id,
      },
      { 'Idempotency-Key': nextKey('resolve') },
    );
    assert.strictEqual(resolved.status, 200, resolved.text);
    const row = await prisma.readerIdentityReview.findUnique({ where: { id: reviewId } });
    assert.strictEqual(row.actorId, helper.id);
    assert.strictEqual(row.actorLabel, 'Kris');
    const audit = await prisma.readerAdminAudit.findFirst({
      where: { action: 'identity_review.resolve', entityId: reviewId },
    });
    assert.strictEqual(audit.actorId, resolver.id);
    assert.strictEqual(audit.actorLabel, 'Denise');
  });

  await check('accounting tables unchanged and resultJson has no reader payload', async () => {
    assert.strictEqual(await snapshotAccounting(), accountingBefore);
    const rows = await prisma.readerMutationIdempotency.findMany();
    assert.ok(rows.length > 0);
    for (const row of rows) {
      assert.ok(!row.resultJson.reader);
      const text = JSON.stringify(row.resultJson);
      assert.ok(!text.includes(amazonReader.email));
      assert.ok(!text.includes('Personally known Amazon order'));
    }
  });

  await check('injected failure logs no PII or secrets and rolls back', async () => {
    await stopServer();
    const logs = [];
    const original = console.error;
    console.error = (...args) => {
      logs.push(args.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(' '));
    };
    try {
      await startServer(poisonAuditCreate(prisma));
      const beforeEvidence = await prisma.readerEvidence.count({ where: { userId: rollbackReader.id } });
      const res = await post(
        evidencePath(rollbackReader.readerProfile.id),
        {
          kind: 'manual_amazon',
          details: 'Should roll back',
          reason: 'Forced failure after insert',
          actorId: helper.id,
        },
        { 'Idempotency-Key': nextKey('rollback') },
      );
      assertError(res, 500, 'Internal error');
      assert.ok(!res.text.includes('leak@example.net'));
      assert.ok(!res.text.includes(ADMIN_KEY));
      assert.ok(!res.text.includes('SECRET_IDEM_KEY'));
      const joined = logs.join('\n');
      assert.match(joined, /internal lifecycle mutation failed/);
      assert.doesNotMatch(joined, /leak@example.net/);
      assert.doesNotMatch(joined, /555-010-1234/);
      assert.doesNotMatch(joined, /SECRET_IDEM_KEY/);
      assert.doesNotMatch(joined, new RegExp(ADMIN_KEY));
      assert.strictEqual(
        await prisma.readerEvidence.count({ where: { userId: rollbackReader.id } }),
        beforeEvidence,
      );
      assert.strictEqual(
        await prisma.readerMutationIdempotency.count({
          where: { origin: IDEMPOTENCY_ORIGIN, originRef: { contains: 'rollback' } },
        }),
        0,
      );
    } finally {
      console.error = original;
    }
  });

  assert.ok(evidenceBefore >= 1);
  await prisma.$disconnect();
  if (failed) {
    console.error(`\nverify-reader-lifecycle-write-api: ${failed} failed, ${passed} passed`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nverify-reader-lifecycle-write-api: ${passed} passed`);
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
    await prisma.$disconnect().catch(() => {});
  });
