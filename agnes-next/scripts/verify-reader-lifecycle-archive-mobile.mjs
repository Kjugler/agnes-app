#!/usr/bin/env node
/**
 * Live 390×844 Archive/Restore panel check for Checkpoint 5J-C2.
 * Synthetic disposable SQLite only. Never touches deepquill/dev.db.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const AGNES_NEXT_ROOT = path.resolve(SCRIPT_DIR, '..');
const REPO_ROOT = path.resolve(AGNES_NEXT_ROOT, '..');
const DEEPQUILL_ROOT = path.join(REPO_ROOT, 'deepquill');
const DEV_DB = path.join(DEEPQUILL_ROOT, 'dev.db');
const CANONICAL_DEV_DB_SHA256 = 'D5BB5C158FC22843EDD0A4990F8921C35437B8904E0DEE11F52C712F81227DFB';
const requireCjs = createRequire(import.meta.url);
const live = requireCjs('./reader-lifecycle-edit-live.cjs');

const ADMIN_KEY = 'checkpoint5jc2-synthetic-admin-key-not-for-production';
const FULFILLMENT_TOKEN = 'checkpoint5jc2-synthetic-fulfillment-token';
const SESSION_COOKIE = `fulfillment-token=${FULFILLMENT_TOKEN}`;
const liveHandles = [];

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
}

function tryPlaywright() {
  const candidates = [
    path.join(AGNES_NEXT_ROOT, 'node_modules', 'playwright'),
    path.join(REPO_ROOT, 'node_modules', 'playwright'),
    'playwright',
  ];
  for (const candidate of candidates) {
    try {
      return requireCjs(candidate);
    } catch {
      /* try next */
    }
  }
  return null;
}

function migrateDisposableDb() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-5jc2-mobile-'));
  const dbPath = path.join(tmpDir, 'mobile.db');
  const fileUrl = `file:${dbPath.replace(/\\/g, '/')}`;
  live.assertSafeDatabaseUrl(fileUrl);
  const prismaCli = path.join(DEEPQUILL_ROOT, 'node_modules', 'prisma', 'build', 'index.js');
  const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: DEEPQUILL_ROOT,
    env: { ...process.env, DATABASE_URL: fileUrl },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy failed: ${(result.stderr || result.stdout || '').slice(-1200)}`);
  }
  return { tmpDir, fileUrl };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    /* already exited */
  }
}

function startNextDev({ backendUrl, port }) {
  const nextBin = path.join(AGNES_NEXT_ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
  const child = spawn(process.execPath, [nextBin, 'dev', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: AGNES_NEXT_ROOT,
    env: {
      ...process.env,
      DEEPQUILL_URL: backendUrl,
      NEXT_PUBLIC_API_BASE_URL: backendUrl,
      ADMIN_KEY,
      FULFILLMENT_ACCESS_TOKEN: FULFILLMENT_TOKEN,
      READER_LIFECYCLE_MUTATIONS_ENABLED: '1',
      READER_LIFECYCLE_EDITING_ENABLED: '1',
      READER_LIFECYCLE_SYNTHETIC_PREVIEW: '1',
      NEXT_PUBLIC_SITE_URL: 'https://www.theagnesprotocol.com',
      SITE_URL: 'https://www.theagnesprotocol.com',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = [];
  const onData = (buf) => output.push(buf.toString('utf8'));
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  liveHandles.push(child);
  return { child, output };
}

function waitForNextReady(handle, timeoutMs = 120000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      const blob = handle.output.join('');
      if (/ready in/i.test(blob) || /started server/i.test(blob) || /local:/i.test(blob)) {
        clearInterval(timer);
        resolve();
        return;
      }
      if (handle.child.exitCode != null) {
        clearInterval(timer);
        reject(new Error(`next dev exited early: ${blob.slice(-800)}`));
        return;
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`next dev did not become ready: ${blob.slice(-800)}`));
      }
    }, 250);
  });
}

function httpCall({ port, method, urlPath, headers, body }) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: {
          Connection: 'close',
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
          ...headers,
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
            json = null;
          }
          resolve({ status: res.statusCode, text, json });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function assertNoOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const docOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    const clipped = [...document.querySelectorAll('button, select, textarea, input, [role="dialog"]')].some((el) => {
      const box = el.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) return false;
      if (!el.checkVisibility || !el.checkVisibility()) return false;
      return box.right > window.innerWidth + 2 || box.left < -2;
    });
    return { docOverflow, clipped };
  });
  assert.equal(overflow.docOverflow, false, `${label}: horizontal overflow`);
  assert.equal(overflow.clipped, false, `${label}: control clipped or hidden`);
}

async function main() {
  const initialHash = sha256File(DEV_DB);
  assert.equal(initialHash, CANONICAL_DEV_DB_SHA256);
  const pw = tryPlaywright();
  assert.ok(pw && pw.chromium, 'playwright/chromium is required for 390×844 Archive/Restore verification');

  const migrated = migrateDisposableDb();
  process.env.DATABASE_URL = migrated.fileUrl;
  const prisma = live.createPrisma();
  let backend;
  let nextHandle;
  try {
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
    await live.seedSyntheticPreview(prisma);
    process.env.READER_LIFECYCLE_MUTATIONS_ENABLED = '1';
    const { createReaderLifecycleWriteService } = requireCjs(
      path.join(DEEPQUILL_ROOT, 'lib', 'readers', 'readerLifecycleWrite.cjs'),
    );
    const writes = createReaderLifecycleWriteService(prisma);
    await writes.archiveReader({
      readerProfileId: 'rp_edit_other',
      reasonCode: 'test_record',
      reason: 'Synthetic archive for mobile restore panel',
      expectedStatus: 'active',
      confirmed: true,
      actorId: 'fu_preview_helper_a',
      idempotencyKey: 'ckpt5jc2-mobile-archive-other',
    });

    backend = await live.startLifecycleBackend(prisma, { adminKey: ADMIN_KEY });
    const nextPort = await getFreePort();
    nextHandle = startNextDev({ backendUrl: `http://127.0.0.1:${backend.port}`, port: nextPort });
    await waitForNextReady(nextHandle);

    let compiled = await httpCall({
      port: nextPort,
      method: 'GET',
      urlPath: '/api/admin/reader-lifecycle/readers/rp_edit_blank',
      headers: { cookie: SESSION_COOKIE },
    });
    for (let i = 0; i < 30 && compiled.status === 404 && !compiled.json; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      compiled = await httpCall({
        port: nextPort,
        method: 'GET',
        urlPath: '/api/admin/reader-lifecycle/readers/rp_edit_blank',
        headers: { cookie: SESSION_COOKIE },
      });
    }
    assert.equal(compiled.status, 200, compiled.text.slice(0, 300));

    const browser = await pw.chromium.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addCookies([
        { name: 'fulfillment-token', value: FULFILLMENT_TOKEN, url: `http://127.0.0.1:${nextPort}` },
      ]);
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${nextPort}/admin/reader-lifecycle-preview/rp_edit_blank`, {
        waitUntil: 'domcontentloaded',
      });
      await page.getByRole('heading', { name: /Blank Reader/i }).waitFor({ timeout: 20000 });
      await page.getByRole('button', { name: 'Manage lifecycle record' }).click();
      await page.getByRole('button', { name: 'Archive as test/invalid operational reader' }).click();
      await page.locator('#field-reasonCode').waitFor({ timeout: 15000 });
      const reasonValues = ['test_record', 'invalid_contact', 'duplicate_or_identity_issue', 'other'];
      for (const value of reasonValues) {
        await page.locator('#field-reasonCode').selectOption(value);
        if (value === 'duplicate_or_identity_issue') {
          await page.getByText('Genuine duplicate-person uncertainty').waitFor({ timeout: 5000 });
        }
      }
      await page.locator('#field-details').fill('Synthetic mobile details for other reason');
      await page.locator('#field-reason').fill('Synthetic administrative explanation for archive');
      await page.locator('#field-actorId').selectOption('fu_preview_helper_a');
      await page.getByLabel(/I understand this archives the operational reader only/i).check();
      await assertNoOverflow(page, 'archive form');
      await page.getByRole('button', { name: 'Review changes' }).click();
      await page.getByRole('heading', { name: /Confirm archive/i }).waitFor({ timeout: 10000 });
      await page.getByText('Purchase, order, Stripe, referral, commission, fulfillment, and accounting records remain.').waitFor({ timeout: 5000 });
      const archiveButton = page.getByRole('button', { name: 'Archive operational reader' });
      await archiveButton.scrollIntoViewIfNeeded();
      assert.equal(await archiveButton.isVisible(), true);
      await assertNoOverflow(page, 'archive confirm');

      await page.goto(`http://127.0.0.1:${nextPort}/admin/reader-lifecycle-preview/rp_edit_other`, {
        waitUntil: 'domcontentloaded',
      });
      await page.getByRole('heading', { name: /Other Reader/i }).waitFor({ timeout: 20000 });
      await page.getByRole('button', { name: 'Manage lifecycle record' }).click();
      await page.getByRole('button', { name: 'Restore operational reader' }).click();
      await page.locator('#field-reason').waitFor({ timeout: 15000 });
      await page.locator('#field-reason').fill('Synthetic administrative restoration reason');
      await page.locator('#field-actorId').selectOption('fu_preview_helper_b');
      await page.getByLabel(/restore does not erase archive history/i).check();
      await assertNoOverflow(page, 'restore form');
      await page.getByRole('button', { name: 'Review changes' }).click();
      await page.getByRole('button', { name: 'Restore operational reader' }).waitFor({ timeout: 10000 });
      await assertNoOverflow(page, 'restore confirm');
    } finally {
      await browser.close();
    }

    killProcessTree(nextHandle.child.pid);
    await new Promise((resolve) => backend.server.close(() => resolve()));
    await prisma.$disconnect().catch(() => {});
    fs.rmSync(migrated.tmpDir, { recursive: true, force: true });
  } catch (err) {
    killProcessTree(nextHandle && nextHandle.child && nextHandle.child.pid);
    if (backend && backend.server) await new Promise((resolve) => backend.server.close(() => resolve()));
    await prisma.$disconnect().catch(() => {});
    fs.rmSync(migrated.tmpDir, { recursive: true, force: true });
    throw err;
  }

  assert.equal(sha256File(DEV_DB), CANONICAL_DEV_DB_SHA256);
  console.log('ok  live 390×844 Archive/Restore panel has no overflow and reachable controls');
  console.log('\nverify-reader-lifecycle-archive-mobile: 1 passed');
}

main().catch((err) => {
  process.stderr.write(`${err && err.stack ? err.stack : err}\n`);
  process.exit(1);
});
