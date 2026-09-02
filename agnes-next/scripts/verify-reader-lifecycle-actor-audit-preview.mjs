#!/usr/bin/env node
/**
 * Local checks for Checkpoint 5F-B: actor list and administrative history
 * on the Reader Lifecycle editing preview. Disposable SQLite and loopback
 * only. Never touches production or deepquill/dev.db.
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
const LIFECYCLE_API = path.join(AGNES_NEXT_ROOT, 'src', 'app', 'api', 'admin', 'reader-lifecycle');
const requireCjs = createRequire(import.meta.url);
const live = requireCjs('./reader-lifecycle-edit-live.cjs');

const FILES = {
  listClient: path.join(PREVIEW_DIR, 'ReaderLifecyclePreviewClient.tsx'),
  listCss: path.join(PREVIEW_DIR, 'preview.module.css'),
  detailPage: path.join(DETAIL_DIR, 'page.tsx'),
  detailClient: path.join(DETAIL_DIR, 'ReaderLifecycleDetailClient.tsx'),
  detailModel: path.join(DETAIL_DIR, 'readerLifecycleDetailModel.ts'),
  detailCss: path.join(DETAIL_DIR, 'detail.module.css'),
  editPanel: path.join(DETAIL_DIR, 'ReaderLifecycleEditPanel.tsx'),
  editModel: path.join(DETAIL_DIR, 'readerLifecycleEditModel.ts'),
  actorsRoute: path.join(LIFECYCLE_API, 'actors', 'route.ts'),
  auditRoute: path.join(LIFECYCLE_API, 'readers', '[readerProfileId]', 'audit-history', 'route.ts'),
  liveHelper: path.join(SCRIPT_DIR, 'reader-lifecycle-edit-live.cjs'),
};

const APP_SCAN = [FILES.detailPage, FILES.detailClient, FILES.detailModel, FILES.editPanel, FILES.editModel];
const ADMIN_KEY = 'checkpoint5fb-synthetic-admin-key-not-for-production';
const FULFILLMENT_TOKEN = 'checkpoint5fb-synthetic-fulfillment-token';
const SESSION_COOKIE = `fulfillment-token=${FULFILLMENT_TOKEN}`;
const KEEP_PREVIEW = process.env.KEEP_5FB_PREVIEW === '1';
const FAKE_PII = Object.freeze({
  email: 'victim.reader@example.test',
  phone: '+15551210999',
  notes: 'secret medical note',
  stripe: 'cs_live_should_not_render',
});

let passed = 0;
let failed = 0;
const liveHandles = [];

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
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-checkpoint5fb-'));
  const listOut = path.join(outDir, 'readerLifecyclePreviewModel.mjs');
  const detailOut = path.join(outDir, 'readerLifecycleDetailModel.mjs');
  const editOut = path.join(outDir, 'readerLifecycleEditModel.mjs');
  fs.writeFileSync(
    listOut,
    transpile(path.join(PREVIEW_DIR, 'readerLifecyclePreviewModel.ts')),
  );
  let detailText = transpile(FILES.detailModel);
  detailText = detailText.replace("from '../readerLifecyclePreviewModel'", "from './readerLifecyclePreviewModel.mjs'");
  fs.writeFileSync(detailOut, detailText);
  let editText = transpile(FILES.editModel);
  editText = editText.replace("from './readerLifecycleDetailModel'", "from './readerLifecycleDetailModel.mjs'");
  fs.writeFileSync(editOut, editText);
  return {
    outDir,
    detail: await import(pathToFileURL(detailOut).href),
    edit: await import(pathToFileURL(editOut).href),
  };
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
    const payload = body == null ? null : Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body);
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
          ...(headers || {}),
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
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text,
            json,
            cacheControl: res.headers['cache-control'],
          });
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

function migrateDisposableDb() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-checkpoint5fb-db-'));
  const dbPath = path.join(tmpDir, 'edit.db');
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

async function main() {
  const initialDbHash = sha256File(DEV_DB);
  assert.equal(initialDbHash, CANONICAL_DEV_DB_SHA256, 'dev.db hash changed before tests');
  const { outDir, detail, edit } = await loadModels();
  let liveCleanup = async () => {};
  const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-checkpoint5fb-shots-'));
  const screenshotPaths = [];

  try {
    await check('list preview filter clarity remains GET-only', () => {
      const client = scan(FILES.listClient);
      const css = scan(FILES.listCss);
      assert.match(client, /LIST_FILTER_HEADING/);
      assert.match(client, /LIST_FILTER_EXPLANATION/);
      assert.match(client, /className=\{styles\.filterHeading\}/);
      assert.doesNotMatch(client, /styles\.srOnly[\s\S]{0,120}LIST_FILTER_HEADING/);
      assert.match(client, /method: 'GET'/);
      assert.doesNotMatch(client, /method:\s*['"]POST['"]/);
      assert.doesNotMatch(client, /proxyReaderLifecyclePost/);
      assert.match(css, /\.filterHeading \{/);
      assert.match(css, /overflow-wrap: anywhere/);
    });

    await check('5F-B proxy routes exist and are GET-only', () => {
      for (const file of [FILES.actorsRoute, FILES.auditRoute]) {
        const src = scan(file);
        assert.match(src, /export async function GET/);
        assert.doesNotMatch(src, /export async function (POST|PATCH|PUT|DELETE)/);
        assert.match(src, /proxyReaderLifecycleGet/);
        assert.doesNotMatch(src, /proxyReaderLifecyclePost/);
        assert.match(src, /dynamic = 'force-dynamic'/);
        assert.doesNotMatch(src, /headers\.get\(['"]x-admin-key['"]\)/);
        assert.doesNotMatch(src, /DEEPQUILL_URL/);
        assert.doesNotMatch(src, /NEXT_PUBLIC_ADMIN_KEY/);
      }
      assert.match(scan(FILES.actorsRoute), /route: 'actors'/);
      assert.match(scan(FILES.auditRoute), /route: 'auditHistory'/);
    });

    await check('application code has no synthetic actor fallback and no fulfillment users reuse', () => {
      for (const file of APP_SCAN) {
        const src = scan(file);
        assert.doesNotMatch(src, /SYNTHETIC_ACTORS/);
        assert.doesNotMatch(src, /fu_preview_helper_inactive/);
        assert.doesNotMatch(src, /\/api\/fulfillment\/users/);
        assert.doesNotMatch(src, /JSON\.stringify\((row|item|summary|before|after)/);
      }
      const panel = scan(FILES.editPanel);
      const client = scan(FILES.detailClient);
      assert.match(panel, /ACTORS_PROXY_PATH/);
      assert.match(scan(FILES.editModel), /\/api\/admin\/reader-lifecycle\/actors/);
      assert.match(panel, /Retry/);
      assert.match(panel, /disabled=\{!actorsReady\}/);
      assert.match(client, /Administrative Change History/);
      assert.match(client, /auditHistoryProxyPath/);
      assert.match(client, /LOAD_EARLIER_CHANGES/);
      assert.match(scan(FILES.detailModel), /Load earlier changes/);
      assert.match(client, /setAuditEpoch/);
      assert.doesNotMatch(client, /method:\s*['"]POST['"]/);
      assert.doesNotMatch(client, /totalCount/);
      assert.match(scan(FILES.liveHelper), /fu_preview_helper_inactive/);
    });

    await check('actor parse helpers fail closed and exclude inactive rows', () => {
      assert.deepEqual(edit.selectableActors(), []);
      assert.equal(edit.canSubmitWithActors([]), false);
      const mixed = edit.selectableActors([
        { id: 'a', label: 'Active A', active: true },
        { id: 'b', label: 'Inactive B', active: false },
        { id: '', label: 'Missing id', active: true },
      ]);
      assert.deepEqual(mixed.map((row) => row.id), ['a']);
      const parsed = edit.parseActorsResponse({
        ok: true,
        actors: [
          { id: 'fu_a', label: 'Helper A' },
          { id: 'fu_inactive', label: 'Inactive', active: false },
          { id: 'fu_nameless', name: 'Name only' },
          { id: 'fu_email', label: 'Shown', email: 'secret@example.test' },
        ],
      });
      assert.deepEqual(parsed.actors.map((row) => row.id), ['fu_a', 'fu_email']);
      assert.equal(parsed.actors.some((row) => 'email' in row), false);
      assert.equal(edit.parseActorsResponse({ ok: false, actors: [{ id: 'a', label: 'A' }] }), null);
      assert.equal(edit.actorName('fu_a'), 'Unknown actor');
    });

    await check('audit history parse is plain language and drops unknown snapshot fields', () => {
      const parsed = detail.parseAuditHistoryResponse({
        ok: true,
        readerProfileId: 'rp_edit_blank',
        items: [
          {
            id: 'aud_1',
            createdAt: '2026-08-25T18:00:00.000Z',
            action: 'evidence.add_provisional',
            entityType: 'ReaderEvidence',
            actorLabel: 'Preview Helper A (synthetic)',
            reason: 'Known Amazon purchase evidence',
            before: null,
            after: {
              kind: 'manual_amazon',
              status: 'provisional',
              details: 'should not appear',
              email: FAKE_PII.email,
              Reason: 'nested reason should drop',
              stripeSessionId: FAKE_PII.stripe,
            },
          },
        ],
        pageSize: 50,
        nextCursor: 'opaque-cursor',
        hasMore: true,
        totalCount: 99,
      });
      assert.equal(parsed.readerProfileId, 'rp_edit_blank');
      assert.equal(parsed.hasMore, true);
      assert.equal(parsed.nextCursor, 'opaque-cursor');
      assert.equal(detail.auditActionLabel(parsed.items[0].action), 'Added provisional evidence');
      assert.equal(detail.auditEntityTypeLabel(parsed.items[0].entityType), 'Purchase and ownership evidence');
      const after = detail.auditSummaryLines(parsed.items[0].after);
      const blob = JSON.stringify(after);
      assert.match(after.map((line) => line.value).join(' '), /Amazon purchase evidence/);
      assert.doesNotMatch(blob, /should not appear/);
      assert.doesNotMatch(blob, new RegExp(FAKE_PII.email));
      assert.doesNotMatch(blob, /cs_live_should_not_render/);
      assert.doesNotMatch(blob, /nested reason/);
      assert.equal(detail.LOAD_EARLIER_CHANGES, 'Load earlier changes');
      const merged = detail.mergeAuditPages(parsed.items, [...parsed.items, { id: 'aud_2', action: 'evidence.confirm', entityType: 'ReaderEvidence', actorLabel: 'B', createdAt: null, entityId: null, actorType: 'admin', actorId: null, reason: null, before: null, after: null }]);
      assert.deepEqual(merged.map((row) => row.id), ['aud_1', 'aud_2']);
    });

    await check('July 1 UTC-midnight purchase date displays July 1 under multiple timezone settings', () => {
      const iso = '2026-07-01T00:00:00.000Z';
      assert.equal(detail.formatCalendarDate(iso), 'July 1, 2026');
      assert.equal(detail.formatCalendarDate('2026-07-01'), 'July 1, 2026');
      const fnSrc = scan(FILES.detailModel);
      const start = fnSrc.indexOf('export function formatCalendarDate');
      const end = fnSrc.indexOf('export type LifecycleReadErrorKind');
      assert.ok(start >= 0 && end > start, 'formatCalendarDate source not found');
      const fn = fnSrc.slice(start, end);
      assert.doesNotMatch(fn, /\bDate\b/);
      assert.doesNotMatch(fn, /toLocale|getTimezoneOffset|Date\.parse/);
      const client = scan(FILES.detailClient);
      const panel = scan(FILES.editPanel);
      assert.match(client, /function EvidenceBlock/);
      assert.match(client, /formatCalendarDate\(row\.purchaseDate\)/);
      assert.doesNotMatch(client, /formatOccurredAt\(row\.purchaseDate\)/);
      assert.match(client, /grouped\.disputed\.map/);
      assert.match(client, /grouped\.superseded\.map/);
      assert.match(client, /<EvidenceBlock key=\{row\.id\} row=\{row\}/);
      assert.match(panel, /formatCalendarDate\(row\.purchaseDate\)/);
      assert.match(panel, /formatCalendarDate\(original\.purchaseDate\)/);
      assert.doesNotMatch(panel, /formatOccurredAt\(.*purchaseDate/);
      const moduleUrl = pathToFileURL(path.join(outDir, 'readerLifecycleDetailModel.mjs')).href;
      const zones = [
        'America/New_York',
        'America/Chicago',
        'America/Denver',
        'America/Los_Angeles',
        'Pacific/Honolulu',
        'America/Anchorage',
        'UTC',
      ];
      for (const tz of zones) {
        const result = spawnSync(
          process.execPath,
          [
            '--input-type=module',
            '-e',
            `const m = await import(${JSON.stringify(moduleUrl)}); process.stdout.write(m.formatCalendarDate(${JSON.stringify(iso)}));`,
          ],
          { env: { ...process.env, TZ: tz }, encoding: 'utf8' },
        );
        assert.equal(result.status, 0, `${tz}: ${result.stderr || result.stdout}`);
        assert.equal(result.stdout, 'July 1, 2026', tz);
      }
    });

    await check('audit and communication timestamps retain formatOccurredAt', () => {
      const stamp = '2026-07-01T18:30:00.000Z';
      const formatted = detail.formatOccurredAt(stamp);
      assert.notEqual(formatted, '—');
      const listModel = scan(path.join(PREVIEW_DIR, 'readerLifecyclePreviewModel.ts'));
      assert.match(listModel, /export function formatOccurredAt/);
      assert.match(listModel, /new Date\(iso\)/);
      assert.match(listModel, /toLocaleString/);
      const client = scan(FILES.detailClient);
      assert.match(client, /formatOccurredAt\(row\.createdAt\)/);
      assert.match(client, /formatOccurredAt\(row\.occurredAt\)/);
      assert.match(client, /formatOccurredAt\(row\.resolvedAt\)/);
      const lines = detail.auditSummaryLines({
        purchaseDate: '2026-07-01T00:00:00.000Z',
        createdAt: stamp,
        updatedAt: stamp,
        resolvedAt: stamp,
      });
      assert.equal(lines.find((line) => line.label === 'Purchase date')?.value, 'July 1, 2026');
      assert.equal(lines.find((line) => line.label === 'Created')?.value, formatted);
      assert.equal(lines.find((line) => line.label === 'Updated')?.value, formatted);
      assert.equal(lines.find((line) => line.label === 'Resolved at')?.value, formatted);
    });

    await check('403 maps to Access denied without enabling mutations or leaking internals', () => {
      const leak = /x-admin-key|ADMIN_KEY|DEEPQUILL|fulfillment-token|Forbidden - |stack|proxy_unavailable/;
      assert.equal(detail.classifyLifecycleReadError(403), 'forbidden');
      assert.equal(
        detail.classifyLifecycleReadError(403, 'Forbidden - x-admin-key required in production'),
        'forbidden',
      );
      assert.equal(detail.classifyLifecycleReadError(403, 'admin_not_configured'), 'forbidden');
      assert.notEqual(
        detail.classifyLifecycleReadError(502, 'Forbidden - x-admin-key required in production'),
        'forbidden',
      );
      assert.equal(detail.classifyHttpError(403, 'Forbidden - x-admin-key required in production'), 'generic');
      const readerCopy = detail.errorCopy('forbidden');
      const auditCopy = detail.auditHistoryErrorCopy('forbidden');
      const actorCopy = edit.actorLoadErrorCopy('forbidden');
      for (const copy of [readerCopy, auditCopy, actorCopy]) {
        assert.equal(copy.title, 'Access denied');
        assert.doesNotMatch(copy.body, leak);
        assert.doesNotMatch(copy.body, /configuration|could not be loaded|read error|Unable to load/i);
        assert.doesNotMatch(copy.title, leak);
      }
      assert.notEqual(edit.actorLoadErrorCopy('generic').title, 'Access denied');
      assert.match(edit.actorLoadErrorCopy('generic').title, /Administrators unavailable/);
      const client = scan(FILES.detailClient);
      const panel = scan(FILES.editPanel);
      assert.match(client, /classifyLifecycleReadError/);
      assert.doesNotMatch(client, /classifyHttpError/);
      assert.match(panel, /classifyLifecycleReadError/);
      assert.match(panel, /actorLoadErrorCopy/);
      assert.match(panel, /disabled=\{!actorsReady\}/);
      assert.match(panel, /fieldsDisabled = inFlight \|\| !actorsReady/);
      assert.match(panel, /if \(!actorsReady\) return;/);
      assert.match(panel, /onClick=\{\(\) => void loadActors\(\)\}/);
      assert.match(panel, /method: 'GET'/);
      assert.match(client, /setRetryToken/);
      assert.doesNotMatch(client, /method:\s*['"]POST['"]/);
    });

    await check('5E safeguards remain in the editing preview', () => {
      const panel = scan(FILES.editPanel);
      const page = scan(FILES.detailPage);
      const client = scan(FILES.detailClient);
      assert.match(page, /PROVIDER_WARNING/);
      assert.match(page, /WEBSITE_PURCHASE_CANNOT_EDIT/);
      assert.match(panel, /Confirm/);
      assert.match(panel, /Idempotency-Key/);
      assert.doesNotMatch(panel, />Merge</);
      assert.doesNotMatch(panel, /Delete evidence|Reassign purchase|>Send email</i);
      assert.match(client, /Disputed or conflicting evidence/);
      assert.match(client, /<details className=\{styles.supersededFold\}>/);
      assert.match(client, /Website Purchase Records/);
      assert.match(client, /Communication History/);
      assert.match(client, /Administrative Change History/);
      assert.match(scan(FILES.detailCss), /overflow-wrap: anywhere/);
    });

    await check('live local chain: actors, scoped audit history, refetch, pagination', async () => {
      const migrated = migrateDisposableDb();
      process.env.DATABASE_URL = migrated.fileUrl;
      const prisma = live.createPrisma();
      let backend;
      let nextHandle;
      try {
        await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
        await live.seedSyntheticPreview(prisma);
        process.env.READER_LIFECYCLE_MUTATIONS_ENABLED = '1';
        backend = await live.startLifecycleBackend(prisma, { adminKey: ADMIN_KEY });
        const backendUrl = `http://127.0.0.1:${backend.port}`;
        const nextPort = await getFreePort();
        nextHandle = startNextDev({ backendUrl, port: nextPort });
        await waitForNextReady(nextHandle);

        async function proxyGet(urlPath, cookie = SESSION_COOKIE) {
          return httpCall({
            port: nextPort,
            method: 'GET',
            urlPath,
            headers: cookie ? { cookie } : {},
          });
        }
        async function proxyPost(urlPath, body, idempotencyKey) {
          return httpCall({
            port: nextPort,
            method: 'POST',
            urlPath,
            headers: {
              cookie: SESSION_COOKIE,
              'Idempotency-Key': idempotencyKey,
            },
            body,
          });
        }

        let compiled = await proxyGet('/api/admin/reader-lifecycle/actors');
        for (let i = 0; i < 30 && compiled.status === 404 && !compiled.json; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          compiled = await proxyGet('/api/admin/reader-lifecycle/actors');
        }
        assert.equal(compiled.status, 200, compiled.text.slice(0, 400));
        assert.equal(compiled.cacheControl, 'no-store');
        assert.equal(compiled.json.ok, true);
        const actorIds = compiled.json.actors.map((row) => row.id);
        assert.ok(actorIds.includes('fu_preview_helper_a'));
        assert.ok(actorIds.includes('fu_preview_helper_b'));
        assert.equal(actorIds.includes('fu_preview_helper_inactive'), false);
        for (const actor of compiled.json.actors) {
          assert.deepEqual(Object.keys(actor).sort(), ['id', 'label']);
        }

        const missingCookie = await proxyGet('/api/admin/reader-lifecycle/actors', '');
        assert.equal(missingCookie.status, 401);
        assert.equal(missingCookie.json.error, 'unauthorized');
        const wrongCookie = await proxyGet(
          '/api/admin/reader-lifecycle/readers/rp_edit_blank/audit-history',
          'fulfillment-token=nope',
        );
        assert.equal(wrongCookie.status, 401);

        const beforeAudit = await proxyGet('/api/admin/reader-lifecycle/readers/rp_edit_blank/audit-history');
        assert.equal(beforeAudit.status, 200, beforeAudit.text.slice(0, 400));
        assert.equal(beforeAudit.json.readerProfileId, 'rp_edit_blank');
        assert.equal(beforeAudit.json.totalCount, null);
        const beforeIds = beforeAudit.json.items.map((row) => row.id);

        const add = await proxyPost(
          '/api/admin/reader-lifecycle/readers/rp_edit_blank/evidence',
          {
            kind: 'manual_amazon',
            purchaseDate: '2026-07-01',
            details: 'Synthetic Amazon receipt note',
            reason: 'Known Amazon purchase evidence',
            actorId: 'fu_preview_helper_a',
          },
          'ckpt5fb-amz-1',
        );
        assert.equal(add.status, 200, add.text.slice(0, 400));
        assert.equal(add.json.ok, true);
        assert.equal(add.json.replay, false);

        const afterAudit = await proxyGet('/api/admin/reader-lifecycle/readers/rp_edit_blank/audit-history');
        assert.equal(afterAudit.status, 200);
        const afterIds = afterAudit.json.items.map((row) => row.id);
        assert.equal(afterIds.length > beforeIds.length, true);
        const newest = afterAudit.json.items[0];
        assert.equal(newest.action, 'evidence.add_provisional');
        assert.equal(newest.reason, 'Known Amazon purchase evidence');
        assert.equal(newest.actorLabel, 'Preview Helper A (synthetic)');
        const afterBlob = JSON.stringify(afterAudit.json);
        assert.doesNotMatch(afterBlob, /secret medical note/);
        assert.doesNotMatch(afterBlob, /victim\.reader@example\.test/);
        assert.match(detail.auditActionLabel(newest.action), /Added provisional evidence/);

        const otherAudit = await proxyGet('/api/admin/reader-lifecycle/readers/rp_edit_amazon/audit-history');
        assert.equal(otherAudit.status, 200);
        assert.equal(otherAudit.json.readerProfileId, 'rp_edit_amazon');
        assert.equal(otherAudit.json.items.some((row) => row.id === newest.id), false);

        const missing = await proxyGet('/api/admin/reader-lifecycle/readers/rp_does_not_exist/audit-history');
        assert.equal(missing.status, 404);

        const replay = await proxyPost(
          '/api/admin/reader-lifecycle/readers/rp_edit_blank/evidence',
          {
            kind: 'manual_amazon',
            purchaseDate: '2026-07-01',
            details: 'Synthetic Amazon receipt note',
            reason: 'Known Amazon purchase evidence',
            actorId: 'fu_preview_helper_a',
          },
          'ckpt5fb-amz-1',
        );
        assert.equal(replay.status, 200);
        assert.equal(replay.json.replay, true);
        const replayAudit = await proxyGet('/api/admin/reader-lifecycle/readers/rp_edit_blank/audit-history');
        assert.equal(replayAudit.json.items[0].id, newest.id);

        await proxyPost(
          '/api/admin/reader-lifecycle/readers/rp_edit_blank/evidence',
          { kind: 'manual_bn', reason: 'Known Barnes and Noble purchase', actorId: 'fu_preview_helper_b' },
          'ckpt5fb-bn-2',
        );
        await proxyPost(
          '/api/admin/reader-lifecycle/readers/rp_edit_blank/contact-decisions',
          { decision: 'suppress', reason: 'Reader asked not to be emailed', actorId: 'fu_preview_helper_a' },
          'ckpt5fb-dnc-3',
        );

        const page1 = await proxyGet('/api/admin/reader-lifecycle/readers/rp_edit_blank/audit-history?pageSize=2');
        assert.equal(page1.status, 200);
        assert.equal(page1.json.items.length, 2);
        assert.equal(page1.json.hasMore, true);
        assert.equal(typeof page1.json.nextCursor, 'string');
        const page2 = await proxyGet(
          `/api/admin/reader-lifecycle/readers/rp_edit_blank/audit-history?pageSize=2&cursor=${encodeURIComponent(page1.json.nextCursor)}`,
        );
        assert.equal(page2.status, 200);
        const pageIds = [...page1.json.items, ...page2.json.items].map((row) => row.id);
        assert.equal(new Set(pageIds).size, pageIds.length, 'pagination duplicated an audit row');
        const merged = detail.mergeAuditPages(page1.json.items, page2.json.items);
        assert.equal(merged.length, pageIds.length);

        const pageHtml = await proxyGet('/admin/reader-lifecycle-preview/rp_edit_blank');
        assert.equal(pageHtml.status, 200);
        assert.match(pageHtml.text, /Administrative Change History|LOCAL SYNTHETIC PREVIEW/);
        assert.doesNotMatch(pageHtml.text, /\{"kind":/);

        const pw = tryPlaywright();
        if (pw && pw.chromium) {
          const browser = await pw.chromium.launch();
          try {
            const context = await browser.newContext({
              viewport: { width: 1280, height: 900 },
            });
            await context.addCookies([
              {
                name: 'fulfillment-token',
                value: FULFILLMENT_TOKEN,
                url: `http://127.0.0.1:${nextPort}`,
              },
            ]);
            const page = await context.newPage();
            await page.goto(`http://127.0.0.1:${nextPort}/admin/reader-lifecycle-preview/rp_edit_blank`, {
              waitUntil: 'networkidle',
            });
            await page.getByRole('button', { name: 'Manage lifecycle record' }).click();
            await page.getByRole('button', { name: 'Add provisional evidence' }).click();
            const actorShot = path.join(screenshotDir, 'actor-picker.png');
            await page.locator('#field-actorId').screenshot({ path: actorShot });
            screenshotPaths.push(actorShot);
            await page.getByRole('button', { name: 'Cancel—make no changes' }).click();
            const auditShot = path.join(screenshotDir, 'administrative-history.png');
            const auditHeading = page.getByRole('heading', { name: 'Administrative Change History' });
            await auditHeading.scrollIntoViewIfNeeded();
            await page.locator('section[aria-labelledby="audit-heading"]').screenshot({ path: auditShot });
            screenshotPaths.push(auditShot);
            await page.setViewportSize({ width: 390, height: 844 });
            const mobileShot = path.join(screenshotDir, 'administrative-history-mobile.png');
            await page.locator('section[aria-labelledby="audit-heading"]').screenshot({ path: mobileShot });
            screenshotPaths.push(mobileShot);
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
            assert.equal(overflow, false, 'mobile viewport has horizontal overflow');

            const listPage = await context.newPage();
            const listApiCalls = [];
            listPage.on('request', (req) => {
              const href = req.url();
              if (!href.includes('/api/')) return;
              listApiCalls.push({ method: req.method(), href });
            });
            await listPage.goto(`http://127.0.0.1:${nextPort}/admin/reader-lifecycle-preview`, {
              waitUntil: 'domcontentloaded',
            });
            const filterHeading = listPage.getByRole('heading', { name: 'FILTER THE READER LIST' });
            await filterHeading.waitFor({ timeout: 20000 });
            await listPage.getByText(/Showing .+|No readers found for these filters/).waitFor({
              timeout: 20000,
            });
            assert.equal(await filterHeading.isVisible(), true, 'list filter heading missing');
            assert.equal(
              await listPage.getByText('These controls do not change reader records.').isVisible(),
              true,
              'list filter explanation missing',
            );
            const listGetCount = () =>
              listApiCalls.filter(
                (row) => row.method === 'GET' && row.href.includes('/api/admin/reader-lifecycle/readers'),
              ).length;
            const getsBeforeApply = listGetCount();
            await listPage.getByLabel('Ownership').selectOption('purchaser');
            await listPage.getByRole('button', { name: 'Apply filters' }).click();
            await listPage.getByText(/Showing .+|No readers found for these filters/).waitFor({
              timeout: 20000,
            });
            assert.ok(listGetCount() > getsBeforeApply, 'applying filters never issued a list GET');
            const listNonGet = listApiCalls.filter((row) => row.method !== 'GET');
            assert.equal(
              listNonGet.length,
              0,
              `list filters issued ${listNonGet.map((row) => `${row.method} ${row.href}`).join(', ')}`,
            );
            assert.equal(
              listApiCalls.some((row) => /\/evidence|\/contact-decisions|\/identity-reviews/.test(row.href)),
              false,
              'list filter activity called a mutation proxy',
            );
            await listPage.setViewportSize({ width: 390, height: 844 });
            assert.equal(await filterHeading.isVisible(), true, 'list filter heading hidden on mobile');
            const listOverflow = await listPage.evaluate(
              () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            );
            assert.equal(listOverflow, false, 'list preview mobile viewport has horizontal overflow');
            await listPage.close();

            const denyPage = await context.newPage();
            let allowActors = false;
            let allowAudit = false;
            const mutationUrls = [];
            denyPage.on('request', (req) => {
              if (req.method() !== 'POST') return;
              const href = req.url();
              if (!href.includes('/api/admin/reader-lifecycle/')) return;
              if (href.includes('/actors') || href.includes('/audit-history')) return;
              mutationUrls.push(href);
            });
            await denyPage.route('**/api/admin/reader-lifecycle/actors', async (route) => {
              if (!allowActors) {
                await route.fulfill({
                  status: 403,
                  contentType: 'application/json',
                  body: JSON.stringify({ error: 'Forbidden - x-admin-key required in production' }),
                });
                return;
              }
              await route.continue();
            });
            await denyPage.route('**/audit-history*', async (route) => {
              if (!allowAudit) {
                await route.fulfill({
                  status: 403,
                  contentType: 'application/json',
                  body: JSON.stringify({ error: 'Forbidden - x-admin-key required in production' }),
                });
                return;
              }
              await route.continue();
            });
            await denyPage.goto(`http://127.0.0.1:${nextPort}/admin/reader-lifecycle-preview/rp_edit_blank`, {
              waitUntil: 'domcontentloaded',
            });
            const manage = denyPage.getByRole('button', { name: 'Manage lifecycle record' });
            await manage.waitFor({ timeout: 20000 });
            await denyPage.getByText('Access denied').first().waitFor({ timeout: 10000 });
            const deniedText = await denyPage.locator('body').innerText();
            assert.match(deniedText, /Access denied/);
            assert.doesNotMatch(deniedText, /x-admin-key|ADMIN_KEY|Forbidden - /);
            assert.doesNotMatch(deniedText, /Unable to load this reader|Administrators unavailable|Configuration unavailable/);
            assert.equal(await manage.isDisabled(), true);
            assert.equal(mutationUrls.length, 0, '403 must not issue mutation requests');

            allowActors = true;
            await manage.locator('..').getByRole('button', { name: 'Retry' }).click();
            await denyPage.waitForFunction(() => {
              const btn = Array.from(document.querySelectorAll('button')).find((el) =>
                (el.textContent || '').includes('Manage lifecycle record'),
              );
              return Boolean(btn && !btn.disabled);
            });
            assert.equal(await manage.isDisabled(), false);
            assert.equal(mutationUrls.length, 0);

            allowAudit = true;
            const auditSection = denyPage.locator('section[aria-labelledby="audit-heading"]');
            await auditSection.getByRole('button', { name: 'Retry' }).click();
            await auditSection.locator('article').first().waitFor();
            assert.equal(mutationUrls.length, 0);
            await denyPage.close();
          } finally {
            await browser.close();
          }
        } else {
          process.stdout.write('note  playwright not installed; screenshots skipped\n');
        }

        if (KEEP_PREVIEW) {
          liveCleanup = async () => {};
          process.stdout.write(
            `\nKEEP_5FB_PREVIEW=1 local URL: http://127.0.0.1:${nextPort}/admin/reader-lifecycle-preview/rp_edit_blank\n` +
              `Synthetic fulfillment token: ${FULFILLMENT_TOKEN}\n` +
              `Deepquill mock: ${backendUrl}\n`,
          );
        } else {
          liveCleanup = async () => {
            killProcessTree(nextHandle.child.pid);
            await new Promise((resolve) => backend.server.close(() => resolve()));
            await prisma.$disconnect().catch(() => {});
            fs.rmSync(migrated.tmpDir, { recursive: true, force: true });
          };
        }
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
  }

  const afterHash = sha256File(DEV_DB);
  await check('deepquill/dev.db remains byte-for-byte unchanged', () => {
    assert.equal(afterHash, CANONICAL_DEV_DB_SHA256);
    assert.equal(afterHash, initialDbHash);
  });

  if (screenshotPaths.length) {
    process.stdout.write(`screenshots: ${screenshotPaths.join('\n  ')}\n`);
  }

  console.log(`\nverify-reader-lifecycle-actor-audit-preview: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`${err && err.stack ? err.stack : err}\n`);
  process.exit(1);
});
