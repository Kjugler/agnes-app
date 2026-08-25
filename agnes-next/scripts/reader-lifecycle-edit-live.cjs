/**
 * Local synthetic Reader Lifecycle editing backend (Checkpoint 5E).
 * Disposable SQLite only. Never opens deepquill/dev.db.
 */
const http = require('http');
const path = require('path');
const { createRequire } = require('module');

const DEEPQUILL_ROOT = path.resolve(__dirname, '..', '..', 'deepquill');
const dqRequire = createRequire(path.join(DEEPQUILL_ROOT, 'package.json'));

const ACTORS = Object.freeze([
  { id: 'fu_preview_helper_a', name: 'Preview Helper A (synthetic)', email: 'helper.a@fulfillment.test', active: true },
  { id: 'fu_preview_helper_b', name: 'Preview Helper B (synthetic)', email: 'helper.b@fulfillment.test', active: true },
  { id: 'fu_preview_helper_inactive', name: 'Preview Helper Inactive (synthetic)', email: 'helper.inactive@fulfillment.test', active: false },
]);

const READERS = Object.freeze({
  blank: { userId: 'user_edit_blank', profileId: 'rp_edit_blank', email: 'blank.reader@example.test', fname: 'Blank' },
  amazon: { userId: 'user_edit_amazon', profileId: 'rp_edit_amazon', email: 'amazon.reader@example.test', fname: 'Amazon' },
  website: { userId: 'user_edit_website', profileId: 'rp_edit_website', email: 'website.reader@example.test', fname: 'Website' },
  nomail: { userId: 'user_edit_nomail', profileId: 'rp_edit_nomail', email: 'anon+edit@reader.crm', fname: 'Nomail' },
  identity: { userId: 'user_edit_identity', profileId: 'rp_edit_identity', email: 'identity.reader@example.test', fname: 'Identity' },
  other: { userId: 'user_edit_other', profileId: 'rp_edit_other', email: 'other.reader@example.test', fname: 'Other' },
});

function assertSafeDatabaseUrl(url) {
  const normalized = String(url || '').replace(/\\/g, '/').toLowerCase();
  if (!String(url || '').startsWith('file:')) {
    throw new Error('DATABASE_URL must be a sqlite file: URL');
  }
  if (normalized.includes('deepquill/dev.db') && !normalized.includes('/temp/') && !normalized.includes('/tmp/')) {
    throw new Error('Refusing to run against the normal local deepquill/dev.db');
  }
}

async function seedSyntheticPreview(prisma) {
  for (const actor of ACTORS) {
    await prisma.fulfillmentUser.create({
      data: {
        id: actor.id,
        name: actor.name,
        email: actor.email,
        active: actor.active,
      },
    });
  }

  async function createReader(spec, extra = {}) {
    return prisma.user.create({
      data: {
        id: spec.userId,
        email: spec.email,
        code: spec.userId.replace(/[^a-z0-9]/gi, '').slice(0, 20),
        referralCode: spec.userId.replace(/[^a-z0-9]/gi, '').slice(0, 12).toUpperCase(),
        fname: spec.fname,
        lname: 'Reader',
        readerProfile: {
          create: {
            id: spec.profileId,
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

  await createReader(READERS.blank);
  await createReader(READERS.amazon, { source: 'Amazon', readerType: 'purchased' });
  await createReader(READERS.website, {
    source: 'Website',
    readerType: 'purchased',
    purchase: {
      id: 'pur_edit_web',
      sessionId: 'cs_synthetic_edit_web_not_stripe',
      amount: 2499,
      currency: 'usd',
      source: 'stripe',
      saleStatus: 'live',
      fulfillmentStatus: 'unfulfilled',
    },
  });
  await createReader(READERS.nomail, { source: 'Website', readerType: 'interested' });
  await createReader(READERS.identity);
  await createReader(READERS.other);

  await prisma.readerIdentityReview.create({
    data: {
      id: 'ir_edit_open',
      primaryUserId: READERS.identity.userId,
      otherUserId: READERS.other.userId,
      reasonCode: 'duplicate_name',
      details: 'Synthetic open review for local editing preview',
      status: 'open',
      actorType: 'admin',
      actorLabel: ACTORS[0].name,
      actorId: ACTORS[0].id,
    },
  });

  return { actors: ACTORS, readers: READERS };
}

function startLifecycleBackend(prisma, { adminKey } = {}) {
  if (adminKey) process.env.ADMIN_KEY = adminKey;
  const express = dqRequire('express');
  const createAdminReaderLifecycleWriteRouter = dqRequire('./server/routes/adminReaderLifecycleWrite.cjs');
  const createAdminReaderLifecycleRouter = dqRequire('./server/routes/adminReaderLifecycle.cjs');
  const app = express();
  app.use(express.json({ limit: '32kb' }));
  app.get('/ping', (req, res) => res.send('pong'));
  const basePath = '/api/admin/reader-lifecycle';
  app.use(basePath, createAdminReaderLifecycleWriteRouter(prisma));
  app.use(basePath, createAdminReaderLifecycleRouter(prisma));
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

function createPrisma() {
  assertSafeDatabaseUrl(process.env.DATABASE_URL);
  const { PrismaClient } = dqRequire('@prisma/client');
  return new PrismaClient();
}

module.exports = {
  ACTORS,
  READERS,
  DEEPQUILL_ROOT,
  assertSafeDatabaseUrl,
  createPrisma,
  seedSyntheticPreview,
  startLifecycleBackend,
};
