#!/usr/bin/env node
/**
 * Local checks for Checkpoint 5H: production safety gates and truthful
 * Reader Lifecycle beta presentation. Disposable SQLite and loopback only.
 * Never touches production or deepquill/dev.db.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const AGNES_NEXT_ROOT = path.resolve(SCRIPT_DIR, '..');
const REPO_ROOT = path.resolve(AGNES_NEXT_ROOT, '..');
const DEEPQUILL_ROOT = path.join(REPO_ROOT, 'deepquill');
const DEV_DB = path.join(DEEPQUILL_ROOT, 'dev.db');
const CANONICAL_DEV_DB_SHA256 = 'D5BB5C158FC22843EDD0A4990F8921C35437B8904E0DEE11F52C712F81227DFB';
const PREVIEW_DIR = path.join(AGNES_NEXT_ROOT, 'src', 'app', 'admin', 'reader-lifecycle-preview');
const DETAIL_DIR = path.join(PREVIEW_DIR, '[readerProfileId]');
const WRITE_ROUTER = path.join(DEEPQUILL_ROOT, 'server', 'routes', 'adminReaderLifecycleWrite.cjs');
const GET_ROUTER = path.join(DEEPQUILL_ROOT, 'server', 'routes', 'adminReaderLifecycle.cjs');
const PUBLIC_CHECKPOINT5E = path.join(AGNES_NEXT_ROOT, 'public', 'dev', 'checkpoint5e');
const requireCjs = createRequire(import.meta.url);
const live = requireCjs('./reader-lifecycle-edit-live.cjs');

const FILES = {
  listPage: path.join(PREVIEW_DIR, 'page.tsx'),
  listClient: path.join(PREVIEW_DIR, 'ReaderLifecyclePreviewClient.tsx'),
  listModel: path.join(PREVIEW_DIR, 'readerLifecyclePreviewModel.ts'),
  detailPage: path.join(DETAIL_DIR, 'page.tsx'),
  detailClient: path.join(DETAIL_DIR, 'ReaderLifecycleDetailClient.tsx'),
  detailModel: path.join(DETAIL_DIR, 'readerLifecycleDetailModel.ts'),
  editPanel: path.join(DETAIL_DIR, 'ReaderLifecycleEditPanel.tsx'),
  editModel: path.join(DETAIL_DIR, 'readerLifecycleEditModel.ts'),
  proxy: path.join(AGNES_NEXT_ROOT, 'src', 'lib', 'readerLifecycleAdminProxy.ts'),
  writeRouter: WRITE_ROUTER,
  getRouter: GET_ROUTER,
  liveHelper: path.join(SCRIPT_DIR, 'reader-lifecycle-edit-live.cjs'),
  adminPage: path.join(AGNES_NEXT_ROOT, 'src', 'app', 'admin', 'page.tsx'),
};

const ADMIN_KEY = 'checkpoint5h-synthetic-admin-key-not-for-production';
const FULFILLMENT_TOKEN = 'checkpoint5h-synthetic-fulfillment-token';
const SESSION_COOKIE = `fulfillment-token=${FULFILLMENT_TOKEN}`;
const MUTATIONS_DISABLED = 'lifecycle_mutations_disabled';
const ADD_BODY = Object.freeze({
  kind: 'manual_amazon',
  reason: 'Known Amazon purchase evidence',
  actorId: 'fu_preview_helper_a',
});

/**
 * Proposed Railway backup (sqlite3 CLI is absent). Copy onto the host and run
 * only after Deepquill writers are stopped. This script is never executed by
 * Checkpoint 5H verification.
 */
const PROPOSED_RAILWAY_SQLITE_BACKUP = `#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

function sqlitePathFromDatabaseUrl(databaseUrl) {
  if (typeof databaseUrl !== 'string' || !databaseUrl.startsWith('file:')) {
    throw new Error('DATABASE_URL must be a sqlite file: URL');
  }
  const parsed = new URL(databaseUrl);
  if (parsed.protocol !== 'file:') throw new Error('DATABASE_URL must be a sqlite file: URL');
  let filePath = decodeURIComponent(parsed.pathname);
  if (process.platform === 'win32' && /^\\/[A-Za-z]:/.test(filePath)) filePath = filePath.slice(1);
  const resolved = path.resolve(filePath);
  const dataRoot = path.resolve('/data');
  if (resolved !== dataRoot && !resolved.startsWith(dataRoot + path.sep)) {
    throw new Error('Refusing to backup a database outside /data');
  }
  if (resolved.split(path.sep).includes('backups')) {
    throw new Error('Refusing to backup a file under /data/backups');
  }
  return resolved;
}

function backupDestinationPath(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\\.\\d+Z$/, 'Z');
  const name = \`agnes-lifecycle-\${stamp}.db\`;
  if (!/^agnes-lifecycle-\\d{8}T\\d{6}Z\\.db$/.test(name)) {
    throw new Error('generated backup name is invalid');
  }
  const dest = path.resolve('/data/backups', name);
  const backupRoot = path.resolve('/data/backups');
  if (!dest.startsWith(backupRoot + path.sep)) throw new Error('backup path escaped /data/backups');
  return dest;
}

function quoteSqlIdent(value) {
  if (typeof value !== 'string' || !value.startsWith('/data/backups/') || value.includes("'")) {
    throw new Error('backup path is not a validated /data/backups file');
  }
  return "'" + value + "'";
}

const source = sqlitePathFromDatabaseUrl(process.env.DATABASE_URL || '');
mkdirSync('/data/backups', { recursive: true });
const destination = backupDestinationPath();
const live = new DatabaseSync(source);
live.exec('VACUUM INTO ' + quoteSqlIdent(destination));
live.close();

const backup = new DatabaseSync(destination, { readOnly: true });
const integrity = backup.prepare('PRAGMA integrity_check').get();
const foreignKeys = backup.prepare('PRAGMA foreign_key_check').all();
const migrations = backup.prepare(
  'SELECT COUNT(*) AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL',
).get();
backup.close();
if (!integrity || integrity.integrity_check !== 'ok') {
  throw new Error('integrity_check failed');
}
if (foreignKeys.length !== 0) throw new Error('foreign_key_check failed');

const bytes = statSync(destination).size;
const sha256 = createHash('sha256').update(readFileSync(destination)).digest('hex').toUpperCase();
process.stdout.write(JSON.stringify({
  source,
  destination,
  bytes,
  sha256,
  integrity_check: integrity.integrity_check,
  foreign_key_check_rows: foreignKeys.length,
  applied_migrations: Number(migrations.n),
}, null, 2) + '\\n');
`;

let passed = 0;
let failed = 0;
const liveHandles = [];
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
      process.stderr.write(`FAIL ${name}: ${err && err.message ? err.message : err}\n`);
    });
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
}

function scan(file) {
  return fs.readFileSync(file, 'utf8');
}

function nextKey(label) {
  keySeq += 1;
  return `ckpt5h-${label}-${String(keySeq).padStart(3, '0')}`;
}

function transpile(file) {
  const ts = requireCjs(path.join(AGNES_NEXT_ROOT, 'node_modules', 'typescript'));
  const source = fs.readFileSync(file, 'utf8');
  const { outputText, diagnostics } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: path.basename(file),
    reportDiagnostics: true,
  });
  if (diagnostics && diagnostics.length) {
    throw new Error(diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
  }
  return outputText;
}

async function loadModels() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-checkpoint5h-'));
  const listOut = path.join(outDir, 'readerLifecyclePreviewModel.mjs');
  fs.writeFileSync(listOut, transpile(FILES.listModel));
  return { outDir, list: await import(pathToFileURL(listOut).href) };
}

function walkFiles(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (!fs.existsSync(current)) continue;
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      if (current.includes(`${path.sep}node_modules${path.sep}`) || current.includes(`${path.sep}.next${path.sep}`)) {
        continue;
      }
      for (const entry of fs.readdirSync(current)) stack.push(path.join(current, entry));
      continue;
    }
    out.push(current);
  }
  return out;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on('error', reject);
  });
}

function httpCall({ hostname = '127.0.0.1', port, method, urlPath, headers, body }) {
  return new Promise((resolve, reject) => {
    const payload =
      body == null ? null : Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body);
    const req = http.request(
      {
        hostname,
        port,
        path: urlPath,
        method,
        headers: {
          Connection: 'close',
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
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
          resolve({ status: res.statusCode, headers: res.headers, text, json });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
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

function startNextDev({ backendUrl, port, flags = {} }) {
  const env = { ...process.env };
  delete env.READER_LIFECYCLE_MUTATIONS_ENABLED;
  delete env.READER_LIFECYCLE_EDITING_ENABLED;
  delete env.READER_LIFECYCLE_SYNTHETIC_PREVIEW;
  const child = spawn(process.execPath, [
    path.join(AGNES_NEXT_ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'),
    'dev',
    '-p',
    String(port),
    '-H',
    '127.0.0.1',
  ], {
    cwd: AGNES_NEXT_ROOT,
    env: {
      ...env,
      DEEPQUILL_URL: backendUrl,
      NEXT_PUBLIC_API_BASE_URL: backendUrl,
      ADMIN_KEY,
      FULFILLMENT_ACCESS_TOKEN: FULFILLMENT_TOKEN,
      NEXT_PUBLIC_SITE_URL: 'https://www.theagnesprotocol.com',
      SITE_URL: 'https://www.theagnesprotocol.com',
      PORT: String(port),
      ...flags,
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

function migrateDisposableDb() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-checkpoint5h-db-'));
  const dbPath = path.join(tmpDir, 'safety.db');
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
  return { tmpDir, dbPath, fileUrl };
}

function mutationPaths(readerProfileId) {
  return [
    `/api/admin/reader-lifecycle/readers/${readerProfileId}/evidence`,
    `/api/admin/reader-lifecycle/evidence/ev_gate/confirm`,
    `/api/admin/reader-lifecycle/evidence/ev_gate/correct`,
    `/api/admin/reader-lifecycle/evidence/ev_gate/dispute`,
    `/api/admin/reader-lifecycle/evidence/ev_gate/replace`,
    `/api/admin/reader-lifecycle/readers/${readerProfileId}/contact-decisions`,
    `/api/admin/reader-lifecycle/readers/${readerProfileId}/identity-reviews`,
    `/api/admin/reader-lifecycle/identity-reviews/ir_gate/resolve`,
    `/api/admin/reader-lifecycle/readers/${readerProfileId}/archive`,
    `/api/admin/reader-lifecycle/readers/${readerProfileId}/restore`,
  ];
}

function extraPostBody() {
  return {
    ...ADD_BODY,
    decision: 'suppress',
    reasonCode: 'duplicate_name',
    status: 'dismissed',
    resolutionReason: 'Not a duplicate after all',
    expectedStatus: 'provisional',
  };
}

async function writeCounts(prisma) {
  return {
    evidence: await prisma.readerEvidence.count(),
    communications: await prisma.readerCommunication.count(),
    identity: await prisma.readerIdentityReview.count(),
    audit: await prisma.readerAdminAudit.count(),
    decisions: await prisma.readerContactDecision.count(),
    idempotency: await prisma.readerMutationIdempotency.count(),
  };
}

function assertDisabledPost(res, label) {
  assert.equal(res.status, 503, `${label} status=${res.status} body=${String(res.text).slice(0, 240)}`);
  assert.equal(res.json && res.json.ok, false);
  assert.equal(res.json && res.json.error, MUTATIONS_DISABLED);
  assert.equal(res.json && Object.prototype.hasOwnProperty.call(res.json, 'reader'), false, `${label}: reader payload`);
  assert.equal(res.json && Object.prototype.hasOwnProperty.call(res.json, 'mutation'), false, `${label}: mutation payload`);
  assert.deepEqual(res.json, { ok: false, error: MUTATIONS_DISABLED }, `${label}: extra payload fields`);
  assert.match(String(res.headers['cache-control'] || ''), /no-store/i);
}

function assertNoFlagLeak(text, label) {
  const src = String(text);
  assert.doesNotMatch(src, /NEXT_PUBLIC_READER_LIFECYCLE/, `${label}: public flag leaked`);
  assert.doesNotMatch(
    src,
    /READER_LIFECYCLE_(?:EDITING_ENABLED|MUTATIONS_ENABLED|SYNTHETIC_PREVIEW)\s*[=:]\s*["']?1["']?/,
    `${label}: flag value leaked`,
  );
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

async function assertManageVisible(port, expected, label) {
  const pw = tryPlaywright();
  if (pw && pw.chromium) {
    const browser = await pw.chromium.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.addCookies([
        {
          name: 'fulfillment-token',
          value: FULFILLMENT_TOKEN,
          url: `http://127.0.0.1:${port}`,
        },
      ]);
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${port}/admin/reader-lifecycle-preview/rp_edit_blank`, {
        waitUntil: 'domcontentloaded',
      });
      await page.getByRole('heading', { name: /Blank Reader/i }).waitFor({ timeout: 20000 });
      const manage = page.getByRole('button', { name: 'Manage lifecycle record' });
      const count = await manage.count();
      if (expected) {
        assert.ok(count > 0, `${label}: Manage button missing after hydration`);
      } else {
        assert.equal(count, 0, `${label}: Manage button visible after hydration`);
      }
      const identity = page.getByRole('button', { name: 'Open identity review' });
      if (!expected) {
        assert.equal(await identity.count(), 0, `${label}: identity-review control visible after hydration`);
      }
    } finally {
      await browser.close();
    }
    return;
  }

  const page = await httpCall({
    port,
    method: 'GET',
    urlPath: '/admin/reader-lifecycle-preview/rp_edit_blank',
    headers: { cookie: SESSION_COOKIE },
  });
  assert.equal(page.status, 200, `${label} page ${page.status}`);
  if (expected) {
    assert.match(page.text, /Manage lifecycle record/);
  } else {
    assert.doesNotMatch(page.text, />Manage lifecycle record</);
    assert.doesNotMatch(page.text, />Open identity review</);
  }
  process.stdout.write(`note  playwright not installed; used SSR HTML for ${label}\n`);
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

async function assertSubmitLocked(port, label) {
  const pw = tryPlaywright();
  if (!pw || !pw.chromium) {
    process.stdout.write(`note  playwright not installed; skipped submit-locked UI for ${label}\n`);
    return;
  }
  const browser = await pw.chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies([
      {
        name: 'fulfillment-token',
        value: FULFILLMENT_TOKEN,
        url: `http://127.0.0.1:${port}`,
      },
    ]);
    const page = await context.newPage();
    const posts = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && /\/api\/admin\/reader-lifecycle\//.test(req.url())) {
        posts.push(req.url());
      }
    });
    await page.goto(`http://127.0.0.1:${port}/admin/reader-lifecycle-preview/rp_edit_blank`, {
      waitUntil: 'domcontentloaded',
    });
    await page.getByRole('heading', { name: /Blank Reader/i }).waitFor({ timeout: 20000 });
    assert.match(await page.locator('[role="status"]').first().innerText(), /Management controls are visible for review/);
    assert.match(await page.locator('[role="status"]').first().innerText(), /Saving remains disabled/);
    await page.getByRole('button', { name: 'Manage lifecycle record' }).click();
    await page.getByText('Saving has not been authorized.').first().waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: /Archive as test\/invalid operational reader/ }).click();
    const review = page.getByRole('button', { name: 'Review changes' });
    await review.waitFor({ timeout: 10000 });
    await page.getByLabel(/Administrative explanation/).fill('Synthetic review of archive controls');
    await page.getByLabel(/Action taken by/).selectOption({ index: 1 });
    await page.getByLabel(/I understand this archives/).check();
    await review.click();
    const save = page.getByRole('button', { name: 'Archive operational reader' });
    await save.waitFor({ timeout: 10000 });
    assert.equal(await save.isDisabled(), true, `${label}: save button should be disabled`);
    assert.match(await page.getByRole('dialog').innerText(), /Saving has not been authorized/);
    await assertNoOverflow(page, `${label} confirm dialog`);
    await save.click({ force: true }).catch(() => {});
    assert.equal(posts.length, 0, `${label}: disabled save sent a mutation POST`);
  } finally {
    await browser.close();
  }
}

async function recordCounts(prisma) {
  return {
    ...(await writeCounts(prisma)),
    profiles: await prisma.readerProfile.count(),
    users: await prisma.user.count(),
    purchases: await prisma.purchase.count(),
  };
}

async function assertListFilterClarity(port, prisma, label) {
  const before = await recordCounts(prisma);
  const pw = tryPlaywright();
  if (pw && pw.chromium) {
    const browser = await pw.chromium.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.addCookies([
        {
          name: 'fulfillment-token',
          value: FULFILLMENT_TOKEN,
          url: `http://127.0.0.1:${port}`,
        },
      ]);
      const page = await context.newPage();
      const apiCalls = [];
      page.on('request', (req) => {
        const href = req.url();
        if (!href.includes('/api/')) return;
        apiCalls.push({ method: req.method(), href });
      });
      await page.goto(`http://127.0.0.1:${port}/admin/reader-lifecycle-preview`, {
        waitUntil: 'domcontentloaded',
      });
      const heading = page.getByRole('heading', { name: 'FILTER THE READER LIST' });
      await heading.waitFor({ timeout: 20000 });
      await page.getByText(/Showing \d+ reader|No readers found for these filters/).waitFor({
        timeout: 20000,
      });
      assert.equal(await heading.isVisible(), true, `${label}: heading not visible on desktop`);
      assert.equal(
        await page.getByText('These controls do not change reader records.').isVisible(),
        true,
        `${label}: explanation not visible on desktop`,
      );
      const box = await heading.boundingBox();
      assert.ok(box && box.height >= 10 && box.width >= 40, `${label}: heading is not visually rendered`);
      const listGetCount = () =>
        apiCalls.filter(
          (row) => row.method === 'GET' && row.href.includes('/api/admin/reader-lifecycle/readers'),
        ).length;
      const getsBeforeApply = listGetCount();
      await page.getByLabel('Ownership').selectOption('purchaser');
      await page.getByRole('button', { name: 'Apply filters' }).click();
      await page.getByText(/Showing \d+ reader|No readers found for these filters/).waitFor({
        timeout: 20000,
      });
      assert.ok(listGetCount() > getsBeforeApply, `${label}: applying filters never issued a list GET`);
      const getsBeforeClear = listGetCount();
      await page.getByRole('button', { name: 'Clear filters' }).click();
      await page.getByText(/Showing \d+ reader|No readers found for these filters/).waitFor({
        timeout: 20000,
      });
      assert.ok(listGetCount() > getsBeforeClear, `${label}: clearing filters never issued a list GET`);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await heading.waitFor({ timeout: 20000 });
      await page.getByText(/Showing \d+ reader|No readers found for these filters/).waitFor({
        timeout: 20000,
      });
      const nonGet = apiCalls.filter((row) => row.method !== 'GET');
      assert.equal(
        nonGet.length,
        0,
        `${label}: filter activity issued ${nonGet.map((row) => `${row.method} ${row.href}`).join(', ')}`,
      );
      assert.equal(
        apiCalls.some((row) =>
          /\/evidence|\/contact-decisions|\/identity-reviews|\/communications/.test(row.href),
        ),
        false,
        `${label}: filter activity called a mutation proxy`,
      );
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await heading.isVisible(), true, `${label}: heading not visible on mobile`);
      assert.equal(
        await page.getByText('These controls do not change reader records.').isVisible(),
        true,
        `${label}: explanation not visible on mobile`,
      );
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      assert.equal(overflow, false, `${label}: list preview mobile viewport has horizontal overflow`);
    } finally {
      await browser.close();
    }
  } else {
    process.stdout.write(`note  playwright not installed; used record counts for ${label}\n`);
  }
  assert.deepEqual(await recordCounts(prisma), before, `${label}: filter activity altered reader records`);
}

async function main() {
  const initialDbHash = sha256File(DEV_DB);
  assert.equal(initialDbHash, CANONICAL_DEV_DB_SHA256, 'dev.db hash changed before tests');
  const { outDir, list } = await loadModels();
  let liveCleanup = async () => {};

  try {
    await check('checkpoint 5E screenshots are absent from the production public tree', () => {
      assert.equal(fs.existsSync(PUBLIC_CHECKPOINT5E), false, PUBLIC_CHECKPOINT5E);
      for (const file of walkFiles(path.join(AGNES_NEXT_ROOT, 'public'))) {
        assert.equal(file.includes(`${path.sep}checkpoint5e${path.sep}`), false, file);
      }
    });

    await check('flags are server-only, exact-1, and fail closed', () => {
      const writeSrc = scan(FILES.writeRouter);
      const getSrc = scan(FILES.getRouter);
      const proxySrc = scan(FILES.proxy);
      const listPage = scan(FILES.listPage);
      const detailPage = scan(FILES.detailPage);
      const listModel = scan(FILES.listModel);
      assert.match(writeSrc, /READER_LIFECYCLE_MUTATIONS_ENABLED/);
      assert.match(writeSrc, /lifecycle_mutations_disabled/);
      assert.match(writeSrc, /req\.method === 'POST' && !lifecycleMutationsEnabled\(\)/);
      assert.match(writeSrc, /sendError\(res, 503, MUTATIONS_DISABLED_ERROR\)/);
      assert.doesNotMatch(writeSrc, /NEXT_PUBLIC_/);
      const flagFn = writeSrc.match(/function lifecycleMutationsEnabled[\s\S]*?\n\}/);
      assert.ok(flagFn, 'lifecycleMutationsEnabled is missing');
      assert.doesNotMatch(flagFn[0], /\.trim\(/);
      assert.match(flagFn[0], /=== MUTATIONS_ENABLED_VALUE/);
      assert.doesNotMatch(getSrc, /READER_LIFECYCLE_MUTATIONS_ENABLED/);
      assert.match(proxySrc, /READER_LIFECYCLE_EDITING_ENABLED/);
      assert.match(proxySrc, /READER_LIFECYCLE_MUTATIONS_ENABLED/);
      assert.match(proxySrc, /lifecycle_mutations_disabled/);
      assert.match(proxySrc, /vercelLifecycleMutationForwardAuthorized/);
      const getFnStart = proxySrc.indexOf('export async function proxyReaderLifecycleGet');
      const postFnStart = proxySrc.indexOf('export async function proxyReaderLifecyclePost');
      assert.ok(getFnStart >= 0 && postFnStart > getFnStart, 'proxy GET/POST helpers missing');
      const getFn = proxySrc.slice(getFnStart, postFnStart);
      const postFn = proxySrc.slice(postFnStart);
      assert.doesNotMatch(getFn, /READER_LIFECYCLE_EDITING_ENABLED/);
      assert.doesNotMatch(getFn, /READER_LIFECYCLE_MUTATIONS_ENABLED/);
      assert.doesNotMatch(getFn, /vercelLifecycleMutationForwardAuthorized/);
      assert.match(postFn, /vercelLifecycleEditingAuthorized/);
      assert.match(postFn, /vercelLifecycleMutationsAuthorized/);
      assert.doesNotMatch(getFn, /vercelLifecycleEditingAuthorized/);
      assert.doesNotMatch(getFn, /vercelLifecycleMutationsAuthorized/);
      assert.match(proxySrc, /reader_lifecycle_mutations_enabled/);
      assert.match(proxySrc, /reader_lifecycle_editing_enabled/);
      assert.match(listModel, /READER_LIFECYCLE_EDITING_ENABLED/);
      assert.match(listModel, /READER_LIFECYCLE_MUTATIONS_ENABLED/);
      assert.match(listModel, /READER_LIFECYCLE_SYNTHETIC_PREVIEW/);
      assert.match(listModel, /LIVE_REVIEW_BANNER/);
      assert.match(listModel, /new URL\(raw\)/);
      assert.match(listModel, /parsed\.hostname/);
      assert.doesNotMatch(listModel, /\.includes\(['"]localhost['"]\)/);
      assert.doesNotMatch(listModel, /\.includes\(['"]127\.0\.0\.1['"]\)/);
      assert.doesNotMatch(listModel, /raw\.includes\(/);
      assert.doesNotMatch(listPage, /searchParams/);
      assert.doesNotMatch(detailPage, /searchParams|document\.cookie|NEXT_PUBLIC_READER/);
      assert.match(detailPage, /readerLifecycleEditingEnabled/);
      assert.match(detailPage, /readerLifecycleSavingEnabled/);
      assert.match(scan(FILES.detailClient), /editingEnabled \?/);
      assert.match(scan(FILES.detailClient), /savingEnabled=\{savingEnabled\}/);
      assert.match(scan(FILES.editPanel), /savingEnabled/);
      assert.match(scan(FILES.editPanel), /SAVING_LOCKED_NOTE/);
      assert.match(scan(FILES.editModel), /Saving has not been authorized/);
      assert.doesNotMatch(scan(FILES.adminPage), /reader-lifecycle-preview/);
      assert.doesNotMatch(scan(FILES.liveHelper), /READER_LIFECYCLE_MUTATIONS_ENABLED\s*=/);
      for (const file of walkFiles(path.join(AGNES_NEXT_ROOT, 'src'))) {
        if (!/\.(ts|tsx|js|jsx)$/.test(file)) continue;
        const src = fs.readFileSync(file, 'utf8');
        assert.doesNotMatch(src, /NEXT_PUBLIC_READER_LIFECYCLE/, file);
      }
      assert.equal(list.envFlagExactlyOne('1'), true);
      assert.equal(list.envFlagExactlyOne('true'), false);
      assert.equal(list.envFlagExactlyOne('1 '), false);
      assert.equal(list.envFlagExactlyOne(''), false);
      assert.equal(list.readerLifecycleEditingEnabled({}), false);
      assert.equal(list.readerLifecycleMutationsAuthorized({}), false);
      assert.equal(list.readerLifecycleSavingEnabled({}), false);
      assert.equal(list.readerLifecycleSyntheticPreview({}), false);
      assert.equal(list.readerLifecycleSyntheticPreview({ READER_LIFECYCLE_SYNTHETIC_PREVIEW: '1' }), false);
      assert.equal(list.readerLifecycleBannerText({}), list.LIVE_READONLY_BANNER);
      assert.equal(
        list.LIVE_READONLY_BANNER,
        'LIVE READER LIFECYCLE BETA — Viewing live administrative records. Changes and emails are disabled.',
      );
      assert.equal(list.SYNTHETIC_PREVIEW_BANNER, 'LOCAL SYNTHETIC PREVIEW — Test records only.');
      assert.equal(
        list.LIVE_REVIEW_BANNER,
        'LIVE READER LIFECYCLE BETA — Management controls are visible for review. Saving remains disabled. No email, nurture, or Text-a-Friend request will be sent.',
      );
      assert.equal(
        list.LIVE_EDITING_BANNER,
        'LIVE READER LIFECYCLE BETA — Changes affect live administrative records. No email, nurture, or Text-a-Friend request will be sent.',
      );
      assert.match(list.LIVE_EDITING_BANNER, /live administrative records/i);
      assert.match(list.LIVE_EDITING_BANNER, /No email/i);
      assert.doesNotMatch(list.LIVE_READONLY_BANNER, /synthetic records only/i);
      assert.doesNotMatch(list.LIVE_EDITING_BANNER, /synthetic records only/i);
      assert.doesNotMatch(list.LIVE_REVIEW_BANNER, /synthetic records only/i);
      assert.doesNotMatch(list.LIVE_REVIEW_BANNER, /Changes affect live administrative records/);
      assert.equal(
        list.readerLifecycleBannerText({
          READER_LIFECYCLE_SYNTHETIC_PREVIEW: '1',
          READER_LIFECYCLE_EDITING_ENABLED: '1',
        }),
        list.LIVE_REVIEW_BANNER,
      );
      assert.equal(
        list.readerLifecycleBannerText({
          READER_LIFECYCLE_SYNTHETIC_PREVIEW: '1',
          READER_LIFECYCLE_EDITING_ENABLED: '1',
          DEEPQUILL_URL: 'http://127.0.0.1:9',
        }),
        list.SYNTHETIC_PREVIEW_BANNER,
      );
      assert.equal(
        list.readerLifecycleBannerText({ READER_LIFECYCLE_EDITING_ENABLED: '1' }),
        list.LIVE_REVIEW_BANNER,
      );
      assert.equal(
        list.readerLifecycleBannerText({ READER_LIFECYCLE_MUTATIONS_ENABLED: '1' }),
        list.LIVE_READONLY_BANNER,
      );
      assert.equal(
        list.readerLifecycleBannerText({
          READER_LIFECYCLE_EDITING_ENABLED: '1',
          READER_LIFECYCLE_MUTATIONS_ENABLED: '1',
        }),
        list.LIVE_EDITING_BANNER,
      );
      assert.equal(list.readerLifecycleEditingEnabled({ READER_LIFECYCLE_MUTATIONS_ENABLED: '1' }), false);
      assert.equal(list.readerLifecycleSavingEnabled({ READER_LIFECYCLE_EDITING_ENABLED: '1' }), false);
      assert.equal(
        list.readerLifecycleSavingEnabled({
          READER_LIFECYCLE_EDITING_ENABLED: '1',
          READER_LIFECYCLE_MUTATIONS_ENABLED: '1',
        }),
        true,
      );
      for (const file of [FILES.listPage, FILES.listClient, FILES.detailPage, FILES.detailClient, FILES.editModel]) {
        assert.doesNotMatch(scan(file), /synthetic records only/i, file);
      }
    });

    await check('synthetic banner requires flag plus parsed loopback Deepquill URL', () => {
      const flag = { READER_LIFECYCLE_SYNTHETIC_PREVIEW: '1' };
      const live = list.LIVE_READONLY_BANNER;
      const synthetic = list.SYNTHETIC_PREVIEW_BANNER;

      assert.equal(list.backendUrlIsAllowlistedLoopback('http://127.0.0.1:9'), true);
      assert.equal(list.backendUrlIsAllowlistedLoopback('http://localhost:5055'), true);
      assert.equal(list.backendUrlIsAllowlistedLoopback('http://[::1]:5055'), true);
      assert.equal(list.backendUrlIsAllowlistedLoopback('http://::1:5055'), false);

      assert.equal(list.readerLifecycleBannerText({ ...flag, DEEPQUILL_URL: 'http://127.0.0.1:9' }), synthetic);
      assert.equal(list.readerLifecycleBannerText({ ...flag, DEEPQUILL_URL: 'https://127.0.0.1' }), synthetic);
      assert.equal(list.readerLifecycleBannerText({ ...flag, DEEPQUILL_URL: 'http://localhost:5055/' }), synthetic);
      assert.equal(list.readerLifecycleBannerText({ ...flag, DEEPQUILL_URL: 'http://[::1]:5055' }), synthetic);
      assert.equal(
        list.readerLifecycleBannerText({ ...flag, NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:9' }),
        synthetic,
      );

      assert.equal(list.readerLifecycleBannerText(flag), live);
      assert.equal(list.readerLifecycleBannerText({ ...flag, DEEPQUILL_URL: '' }), live);
      assert.equal(list.readerLifecycleBannerText({ ...flag, DEEPQUILL_URL: 'not a url' }), live);
      assert.equal(list.readerLifecycleBannerText({ ...flag, DEEPQUILL_URL: 'file:///data/dev.db' }), live);
      assert.equal(list.readerLifecycleBannerText({ ...flag, DEEPQUILL_URL: 'ftp://127.0.0.1' }), live);
      assert.equal(
        list.readerLifecycleBannerText({
          ...flag,
          DEEPQUILL_URL: 'https://agnes-protocol-production.up.railway.app',
        }),
        live,
      );
      assert.equal(
        list.readerLifecycleBannerText({ ...flag, DEEPQUILL_URL: 'https://www.theagnesprotocol.com' }),
        live,
      );
      assert.equal(list.readerLifecycleBannerText({ ...flag, DEEPQUILL_URL: 'http://localhost.example.com' }), live);
      assert.equal(list.readerLifecycleBannerText({ ...flag, DEEPQUILL_URL: 'http://127.0.0.1.example.com' }), live);
      assert.equal(list.readerLifecycleBannerText({ ...flag, DEEPQUILL_URL: 'http://localhost@evil.example' }), live);
      assert.equal(list.readerLifecycleBannerText({ ...flag, DEEPQUILL_URL: 'http://localhost@127.0.0.1' }), live);
      assert.equal(
        list.readerLifecycleBannerText({
          ...flag,
          DEEPQUILL_URL: 'https://evil.example/?host=127.0.0.1&url=http://localhost',
        }),
        live,
      );
      assert.equal(
        list.readerLifecycleBannerText({
          ...flag,
          DEEPQUILL_URL: 'https://agnes-protocol-production.up.railway.app',
          NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:9',
        }),
        live,
      );
      assert.equal(
        list.readerLifecycleBannerText({
          READER_LIFECYCLE_SYNTHETIC_PREVIEW: 'true',
          DEEPQUILL_URL: 'http://127.0.0.1:9',
        }),
        live,
      );
      assert.equal(
        list.readerLifecycleEditingEnabled({
          READER_LIFECYCLE_EDITING_ENABLED: '1',
          DEEPQUILL_URL: 'https://agnes-protocol-production.up.railway.app',
        }),
        true,
      );
      assert.equal(
        list.readerLifecycleBannerText({
          READER_LIFECYCLE_EDITING_ENABLED: '1',
          DEEPQUILL_URL: 'https://agnes-protocol-production.up.railway.app',
        }),
        list.LIVE_REVIEW_BANNER,
      );
      assert.equal(
        list.readerLifecycleBannerText({
          READER_LIFECYCLE_EDITING_ENABLED: '1',
          READER_LIFECYCLE_MUTATIONS_ENABLED: '1',
          DEEPQUILL_URL: 'https://agnes-protocol-production.up.railway.app',
        }),
        list.LIVE_EDITING_BANNER,
      );
    });

    await check('proposed Railway sqlite backup is Node VACUUM INTO and is not executed', () => {
      assert.match(PROPOSED_RAILWAY_SQLITE_BACKUP, /from 'node:sqlite'/);
      assert.match(PROPOSED_RAILWAY_SQLITE_BACKUP, /VACUUM INTO/);
      assert.match(PROPOSED_RAILWAY_SQLITE_BACKUP, /\/data\/backups/);
      assert.match(PROPOSED_RAILWAY_SQLITE_BACKUP, /PRAGMA integrity_check/);
      assert.match(PROPOSED_RAILWAY_SQLITE_BACKUP, /PRAGMA foreign_key_check/);
      assert.match(PROPOSED_RAILWAY_SQLITE_BACKUP, /_prisma_migrations/);
      assert.match(PROPOSED_RAILWAY_SQLITE_BACKUP, /createHash\('sha256'\)/);
      assert.match(PROPOSED_RAILWAY_SQLITE_BACKUP, /statSync\(destination\)\.size/);
      assert.doesNotMatch(PROPOSED_RAILWAY_SQLITE_BACKUP, /sqlite3 /);
      const runner = scan(fileURLToPath(import.meta.url)).split('const PROPOSED_RAILWAY_SQLITE_BACKUP')[0];
      assert.doesNotMatch(runner, /node:sqlite/);
      assert.doesNotMatch(runner, /VACUUM INTO/);
    });

    await check('flag combinations: GET, UI, POST, and no-write disabled mutations', async () => {
      const migrated = migrateDisposableDb();
      process.env.DATABASE_URL = migrated.fileUrl;
      delete process.env.READER_LIFECYCLE_MUTATIONS_ENABLED;
      delete process.env.READER_LIFECYCLE_EDITING_ENABLED;
      delete process.env.READER_LIFECYCLE_SYNTHETIC_PREVIEW;
      const prisma = live.createPrisma();
      let backend;
      let nextHandle;
      try {
        await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
        await live.seedSyntheticPreview(prisma);
        backend = await live.startLifecycleBackend(prisma, { adminKey: ADMIN_KEY });
        const backendUrl = `http://127.0.0.1:${backend.port}`;

        async function proxyPost(port, urlPath, body, extraHeaders = {}) {
          return httpCall({
            port,
            method: 'POST',
            urlPath,
            headers: {
              cookie: SESSION_COOKIE,
              'Idempotency-Key': nextKey('proxy'),
              ...extraHeaders,
            },
            body,
          });
        }

        async function directPost(urlPath, body, extraHeaders = {}) {
          return httpCall({
            port: backend.port,
            method: 'POST',
            urlPath,
            headers: {
              'x-admin-key': ADMIN_KEY,
              'Idempotency-Key': nextKey('direct'),
              ...extraHeaders,
            },
            body,
          });
        }

        async function proxyGet(port, urlPath, extraHeaders = {}) {
          return httpCall({
            port,
            method: 'GET',
            urlPath,
            headers: { cookie: SESSION_COOKIE, ...extraHeaders },
          });
        }

        async function waitCompiled(port, urlPath) {
          let res = await proxyGet(port, urlPath);
          for (let i = 0; i < 30 && res.status === 404 && !res.json; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            res = await proxyGet(port, urlPath);
          }
          return res;
        }

        async function restartNext(flags) {
          if (nextHandle) {
            killProcessTree(nextHandle.child.pid);
            nextHandle = null;
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
          const port = await getFreePort();
          nextHandle = startNextDev({ backendUrl, port, flags });
          await waitForNextReady(nextHandle);
          return port;
        }

        const paths = mutationPaths('rp_edit_blank');
        const archivePath = '/api/admin/reader-lifecycle/readers/rp_edit_other/archive';
        const restorePath = '/api/admin/reader-lifecycle/readers/rp_edit_other/restore';
        const archiveBody = {
          reasonCode: 'test_record',
          reason: 'Synthetic archive for staged authorization',
          actorId: 'fu_preview_helper_a',
          expectedStatus: 'active',
          confirmed: true,
        };
        const restoreBody = {
          reason: 'Synthetic restore after staged authorization',
          actorId: 'fu_preview_helper_b',
          expectedStatus: 'archived',
          confirmed: true,
        };

        const readOnlyPort = await restartNext({});
        const getList = await waitCompiled(readOnlyPort, '/api/admin/reader-lifecycle/readers?pageSize=5');
        assert.equal(getList.status, 200, getList.text.slice(0, 240));
        assert.equal(getList.json && getList.json.ok, true);
        assertNoFlagLeak(getList.text, 'GET list API');

        const adminHub = await waitCompiled(readOnlyPort, '/admin');
        assert.equal(adminHub.status, 200, adminHub.text.slice(0, 240));
        assert.doesNotMatch(adminHub.text, /reader-lifecycle-preview/);

        const listPage = await httpCall({
          port: readOnlyPort,
          method: 'GET',
          urlPath: '/admin/reader-lifecycle-preview?READER_LIFECYCLE_SYNTHETIC_PREVIEW=1',
          headers: {
            cookie: `${SESSION_COOKIE}; READER_LIFECYCLE_EDITING_ENABLED=1; READER_LIFECYCLE_SYNTHETIC_PREVIEW=1`,
            'x-reader-lifecycle-editing-enabled': '1',
          },
        });
        assert.equal(listPage.status, 200);
        assert.match(listPage.text, /LIVE READER LIFECYCLE BETA/);
        assert.match(listPage.text, /Viewing live administrative records/);
        assert.match(listPage.text, /Changes and emails are disabled/);
        assert.match(listPage.text, /FILTER THE READER LIST/);
        assert.match(listPage.text, /These controls do not change reader records\./);
        assert.doesNotMatch(listPage.text, /LOCAL SYNTHETIC PREVIEW/);
        assert.doesNotMatch(listPage.text, /synthetic records only/i);
        assert.doesNotMatch(listPage.text, /Management controls are visible for review/);
        await assertListFilterClarity(readOnlyPort, prisma, 'both flags absent');

        const cleanList = await proxyGet(readOnlyPort, '/admin/reader-lifecycle-preview');
        assert.equal(cleanList.status, 200);
        assert.match(cleanList.text, /Viewing live administrative records/);
        assertNoFlagLeak(cleanList.text, 'read-only list HTML');

        const detailPage = await httpCall({
          port: readOnlyPort,
          method: 'GET',
          urlPath: '/admin/reader-lifecycle-preview/rp_edit_blank?READER_LIFECYCLE_EDITING_ENABLED=1',
          headers: { cookie: SESSION_COOKIE },
        });
        assert.equal(detailPage.status, 200);
        assert.match(detailPage.text, /LIVE READER LIFECYCLE BETA/);
        assert.match(detailPage.text, /Viewing live administrative records/);
        const cleanDetail = await proxyGet(readOnlyPort, '/admin/reader-lifecycle-preview/rp_edit_blank');
        assert.equal(cleanDetail.status, 200);
        assert.match(cleanDetail.text, /Viewing live administrative records/);
        assertNoFlagLeak(cleanDetail.text, 'read-only detail HTML');
        await assertManageVisible(readOnlyPort, false, 'neither Vercel flag');

        const beforeDisabled = await writeCounts(prisma);
        for (const urlPath of paths) {
          assertDisabledPost(await directPost(urlPath, extraPostBody(), {
            'x-reader-lifecycle-mutations-enabled': '1',
            cookie: 'READER_LIFECYCLE_MUTATIONS_ENABLED=1',
          }), `direct ${urlPath}`);
          assertDisabledPost(await proxyPost(readOnlyPort, urlPath, extraPostBody(), {
            'x-reader-lifecycle-mutations-enabled': '1',
          }), `proxy ${urlPath}`);
        }
        const injected = await httpCall({
          port: backend.port,
          method: 'POST',
          urlPath: `${paths[0]}?READER_LIFECYCLE_MUTATIONS_ENABLED=1`,
          headers: {
            'x-admin-key': ADMIN_KEY,
            'Idempotency-Key': nextKey('query'),
            READER_LIFECYCLE_MUTATIONS_ENABLED: '1',
          },
          body: { ...ADD_BODY, READER_LIFECYCLE_MUTATIONS_ENABLED: '1' },
        });
        assertDisabledPost(injected, 'query/header/body injection');
        const forbiddenBody = await proxyPost(readOnlyPort, paths[0], {
          ...ADD_BODY,
          reader_lifecycle_mutations_enabled: '1',
        });
        assert.equal(forbiddenBody.status, 400);
        assert.equal(forbiddenBody.json && forbiddenBody.json.error, 'invalid_request');
        assert.deepEqual(await writeCounts(prisma), beforeDisabled);

        process.env.READER_LIFECYCLE_MUTATIONS_ENABLED = '1';
        const stillReadOnly = await proxyGet(readOnlyPort, '/admin/reader-lifecycle-preview/rp_edit_blank');
        assert.equal(stillReadOnly.status, 200);
        assert.match(stillReadOnly.text, /Viewing live administrative records/);
        await assertManageVisible(readOnlyPort, false, 'Railway on / Vercel editing off');
        const proxyWhileRailwayOn = await proxyPost(readOnlyPort, paths[0], ADD_BODY);
        assertDisabledPost(proxyWhileRailwayOn, 'neither Vercel flag proxy POST while Railway on');
        assert.deepEqual(await writeCounts(prisma), beforeDisabled, 'proxy reached Deepquill while Vercel editing off');
        const directOk = await directPost(paths[0], ADD_BODY);
        assert.equal(directOk.status, 200, directOk.text.slice(0, 300));
        assert.equal(directOk.json && directOk.json.ok, true);
        const afterDirect = await writeCounts(prisma);
        assert.ok(afterDirect.evidence > beforeDisabled.evidence);
        assert.ok(afterDirect.audit > beforeDisabled.audit);
        assert.ok(afterDirect.idempotency > beforeDisabled.idempotency);

        delete process.env.READER_LIFECYCLE_MUTATIONS_ENABLED;
        const editingPort = await restartNext({ READER_LIFECYCLE_EDITING_ENABLED: '1' });
        const editingPage = await waitCompiled(editingPort, '/admin/reader-lifecycle-preview/rp_edit_blank');
        assert.equal(editingPage.status, 200);
        assert.match(editingPage.text, /Management controls are visible for review/);
        assert.match(editingPage.text, /Saving remains disabled/);
        assert.doesNotMatch(editingPage.text, /Changes affect live administrative records/);
        assert.doesNotMatch(editingPage.text, /LOCAL SYNTHETIC PREVIEW/);
        assertNoFlagLeak(editingPage.text, 'editing-only detail HTML');
        await assertManageVisible(editingPort, true, 'editing only');
        await assertSubmitLocked(editingPort, 'editing only');
        const beforeUiBlocked = await writeCounts(prisma);
        const uiBlocked = await proxyPost(editingPort, archivePath, archiveBody);
        assertDisabledPost(uiBlocked, 'editing only proxy Archive');
        assert.deepEqual(await writeCounts(prisma), beforeUiBlocked);

        process.env.READER_LIFECYCLE_MUTATIONS_ENABLED = '1';
        const editingWhileRailwayOn = await proxyPost(editingPort, archivePath, archiveBody);
        assertDisabledPost(editingWhileRailwayOn, 'editing only proxy Archive while Railway on');
        assert.deepEqual(await writeCounts(prisma), beforeUiBlocked, 'editing-only proxy reached Deepquill');
        delete process.env.READER_LIFECYCLE_MUTATIONS_ENABLED;

        const mutationsOnlyPort = await restartNext({ READER_LIFECYCLE_MUTATIONS_ENABLED: '1' });
        const mutationsOnlyPage = await waitCompiled(mutationsOnlyPort, '/admin/reader-lifecycle-preview/rp_edit_blank');
        assert.equal(mutationsOnlyPage.status, 200);
        assert.match(mutationsOnlyPage.text, /Viewing live administrative records/);
        assert.doesNotMatch(mutationsOnlyPage.text, /Management controls are visible for review/);
        assertNoFlagLeak(mutationsOnlyPage.text, 'mutations-only detail HTML');
        await assertManageVisible(mutationsOnlyPort, false, 'Vercel mutations only');
        process.env.READER_LIFECYCLE_MUTATIONS_ENABLED = '1';
        const mutationsOnlyBlocked = await proxyPost(mutationsOnlyPort, archivePath, archiveBody);
        assertDisabledPost(mutationsOnlyBlocked, 'Vercel mutations only proxy POST');
        assert.deepEqual(await writeCounts(prisma), beforeUiBlocked);
        delete process.env.READER_LIFECYCLE_MUTATIONS_ENABLED;

        const bothPort = await restartNext({
          READER_LIFECYCLE_EDITING_ENABLED: '1',
          READER_LIFECYCLE_MUTATIONS_ENABLED: '1',
        });
        const bothPage = await waitCompiled(bothPort, '/admin/reader-lifecycle-preview/rp_edit_blank');
        assert.equal(bothPage.status, 200);
        assert.match(bothPage.text, /Changes affect live administrative records/);
        assert.doesNotMatch(bothPage.text, /Saving remains disabled/);
        assertNoFlagLeak(bothPage.text, 'both Vercel flags detail HTML');
        await assertManageVisible(bothPort, true, 'both Vercel flags');
        const beforeForward = await writeCounts(prisma);
        const forwardedDisabled = await proxyPost(bothPort, archivePath, archiveBody);
        assertDisabledPost(forwardedDisabled, 'both Vercel flags / Railway absent');
        assert.deepEqual(await writeCounts(prisma), beforeForward);

        process.env.READER_LIFECYCLE_MUTATIONS_ENABLED = '1';
        const archived = await proxyPost(bothPort, archivePath, archiveBody);
        assert.equal(archived.status, 200, archived.text.slice(0, 400));
        assert.equal(archived.json && archived.json.ok, true);
        assert.equal(archived.json.reader.legacy.status, 'archived');
        const restored = await proxyPost(bothPort, restorePath, restoreBody);
        assert.equal(restored.status, 200, restored.text.slice(0, 400));
        assert.equal(restored.json && restored.json.ok, true);
        assert.equal(restored.json.reader.legacy.status, 'active');
        const afterBoth = await writeCounts(prisma);
        assert.ok(afterBoth.audit > beforeForward.audit);
        assert.ok(afterBoth.idempotency > beforeForward.idempotency);

        liveCleanup = async () => {
          killProcessTree(nextHandle && nextHandle.child && nextHandle.child.pid);
          await new Promise((resolve) => backend.server.close(() => resolve()));
          await prisma.$disconnect().catch(() => {});
          fs.rmSync(migrated.tmpDir, { recursive: true, force: true });
        };
      } catch (err) {
        killProcessTree(nextHandle && nextHandle.child && nextHandle.child.pid);
        if (backend && backend.server) await new Promise((resolve) => backend.server.close(() => resolve()));
        await prisma.$disconnect().catch(() => {});
        fs.rmSync(migrated.tmpDir, { recursive: true, force: true });
        throw err;
      }
    });
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
    await liveCleanup();
    delete process.env.READER_LIFECYCLE_MUTATIONS_ENABLED;
    delete process.env.READER_LIFECYCLE_EDITING_ENABLED;
    delete process.env.READER_LIFECYCLE_SYNTHETIC_PREVIEW;
  }

  const afterHash = sha256File(DEV_DB);
  await check('deepquill/dev.db remains byte-for-byte unchanged', () => {
    assert.equal(afterHash, CANONICAL_DEV_DB_SHA256);
    assert.equal(afterHash, initialDbHash);
  });

  console.log(`\nverify-reader-lifecycle-safety-gates: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`${err && err.stack ? err.stack : err}\n`);
  process.exit(1);
});
