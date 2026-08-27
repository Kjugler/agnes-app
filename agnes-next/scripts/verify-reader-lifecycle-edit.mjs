#!/usr/bin/env node
/**
 * Local checks for Checkpoint 5E Reader Lifecycle editing preview.
 * Synthetic fixtures and disposable SQLite only. Never touches production
 * or deepquill/dev.db.
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
const requireCjs = createRequire(import.meta.url);
const live = requireCjs('./reader-lifecycle-edit-live.cjs');

const FILES = {
  listPage: path.join(PREVIEW_DIR, 'page.tsx'),
  listClient: path.join(PREVIEW_DIR, 'ReaderLifecyclePreviewClient.tsx'),
  listModel: path.join(PREVIEW_DIR, 'readerLifecyclePreviewModel.ts'),
  detailPage: path.join(DETAIL_DIR, 'page.tsx'),
  detailClient: path.join(DETAIL_DIR, 'ReaderLifecycleDetailClient.tsx'),
  detailModel: path.join(DETAIL_DIR, 'readerLifecycleDetailModel.ts'),
  detailCss: path.join(DETAIL_DIR, 'detail.module.css'),
  editPanel: path.join(DETAIL_DIR, 'ReaderLifecycleEditPanel.tsx'),
  editModel: path.join(DETAIL_DIR, 'readerLifecycleEditModel.ts'),
  liveHelper: path.join(SCRIPT_DIR, 'reader-lifecycle-edit-live.cjs'),
};

const READERS_FILES = [
  path.join(AGNES_NEXT_ROOT, 'src', 'app', 'admin', 'readers', 'page.tsx'),
  path.join(AGNES_NEXT_ROOT, 'src', 'app', 'admin', 'readers', 'ReadersAdminClient.tsx'),
  path.join(AGNES_NEXT_ROOT, 'src', 'app', 'api', 'admin', 'readers', 'route.ts'),
  path.join(AGNES_NEXT_ROOT, 'src', 'app', 'api', 'admin', 'readers', '[id]', 'route.ts'),
];

const ADMIN_KEY = 'checkpoint5e-synthetic-admin-key-not-for-production';
const FULFILLMENT_TOKEN = 'checkpoint5e-synthetic-fulfillment-token';
const SESSION_COOKIE = `fulfillment-token=${FULFILLMENT_TOKEN}`;
const KEEP_PREVIEW = process.env.KEEP_5E_PREVIEW === '1';

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

function gitDiff(file) {
  const result = spawnSync('git', ['diff', '--', file], { cwd: REPO_ROOT, encoding: 'utf8' });
  return (result.stdout || '').trim();
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
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-checkpoint5e-'));
  const listOut = path.join(outDir, 'readerLifecyclePreviewModel.mjs');
  const detailOut = path.join(outDir, 'readerLifecycleDetailModel.mjs');
  const editOut = path.join(outDir, 'readerLifecycleEditModel.mjs');
  fs.writeFileSync(listOut, transpile(FILES.listModel));
  let detailText = transpile(FILES.detailModel);
  detailText = detailText.replace("from '../readerLifecyclePreviewModel'", "from './readerLifecyclePreviewModel.mjs'");
  fs.writeFileSync(detailOut, detailText);
  let editText = transpile(FILES.editModel);
  editText = editText.replace("from './readerLifecycleDetailModel'", "from './readerLifecycleDetailModel.mjs'");
  fs.writeFileSync(editOut, editText);
  return {
    outDir,
    list: await import(pathToFileURL(listOut).href),
    detail: await import(pathToFileURL(detailOut).href),
    edit: await import(pathToFileURL(editOut).href),
  };
}

function readerFixture(overrides = {}) {
  return {
    readerProfileId: 'rp_edit_blank',
    userId: 'user_edit_blank',
    name: 'Blank Reader',
    email: 'blank.reader@example.test',
    emailDisplay: 'blank.reader@example.test',
    hasRealEmail: true,
    legacy: { source: 'website', readerType: 'interested', status: 'active' },
    ownership: 'non_purchaser',
    sources: [],
    confidence: 'unknown',
    contactability: 'contactable',
    review: 'clear',
    nurtureSuppressed: false,
    reasons: [],
    latestCommunication: null,
    createdAt: '2026-08-01T12:00:00.000Z',
    notes: '',
    phone: '',
    smsConsentGranted: false,
    evidenceHistory: [],
    purchases: [],
    communications: [],
    contactDecisions: [],
    identityReviews: [],
    distinctions: {
      purchasesAreAccountingTruth: true,
      evidenceIsLifecycleHistory: true,
      providerSuppressionIntegrated: false,
      safeToSend: false,
    },
    ...overrides,
  };
}

function evidenceRow(partial) {
  return {
    id: 'ev_1',
    kind: 'manual_amazon',
    status: 'provisional',
    sourceLabel: 'Amazon',
    purchaseDate: '2026-07-01T00:00:00.000Z',
    details: 'Synthetic Amazon receipt',
    reason: 'provisional_manual_retailer',
    actorType: 'admin',
    actorLabel: 'Preview Helper A (synthetic)',
    origin: 'admin',
    originRef: 'ref',
    supersededById: null,
    createdAt: '2026-07-02T00:00:00.000Z',
    accountingTruth: false,
    ...partial,
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-checkpoint5e-db-'));
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
  return { tmpDir, dbPath, fileUrl, migrateOutput: `${result.stdout || ''}\n${result.stderr || ''}` };
}

function nextKey(label, seq) {
  return `ckpt5e-${label}-${seq}`.replace(/[^A-Za-z0-9._:-]/g, '');
}

async function main() {
  const initialDbHash = sha256File(DEV_DB);
  assert.equal(initialDbHash, CANONICAL_DEV_DB_SHA256, 'dev.db hash changed before tests');

  const { outDir, list, detail, edit } = await loadModels();
  let liveCleanup = async () => {};

  try {
    await check('5E files exist and list preview stays GET-only', () => {
      for (const file of Object.values(FILES)) assert.equal(fs.existsSync(file), true, file);
      const listClient = scan(FILES.listClient);
      assert.match(listClient, /View details/);
      assert.match(listClient, /method: 'GET'/);
      assert.doesNotMatch(listClient, /method:\s*['"]POST['"]/);
      assert.doesNotMatch(scan(FILES.listPage), /Manage lifecycle record/);
      assert.match(scan(FILES.listPage), /readerLifecycleBannerText/);
    });

    await check('banners are server-selected and fail closed to live read-only', () => {
      const page = scan(FILES.detailPage);
      assert.match(page, /readerLifecycleBannerText/);
      assert.match(page, /readerLifecycleEditingEnabled/);
      assert.doesNotMatch(page, /searchParams|document\.cookie|NEXT_PUBLIC_READER/);
      assert.equal(
        list.LIVE_READONLY_BANNER,
        'LIVE READER LIFECYCLE BETA — Viewing live administrative records. Changes and emails are disabled.',
      );
      assert.equal(list.SYNTHETIC_PREVIEW_BANNER, 'LOCAL SYNTHETIC PREVIEW — Test records only.');
      assert.match(list.LIVE_EDITING_BANNER, /live administrative records/i);
      assert.doesNotMatch(list.LIVE_READONLY_BANNER, /synthetic records only/i);
      assert.doesNotMatch(list.LIVE_EDITING_BANNER, /synthetic records only/i);
      assert.equal(list.readerLifecycleEditingEnabled({}), false);
      assert.equal(list.readerLifecycleEditingEnabled({ READER_LIFECYCLE_EDITING_ENABLED: '1' }), true);
      assert.equal(list.readerLifecycleEditingEnabled({ READER_LIFECYCLE_EDITING_ENABLED: 'true' }), false);
      assert.equal(list.readerLifecycleBannerText({}), list.LIVE_READONLY_BANNER);
      assert.equal(
        list.readerLifecycleBannerText({ READER_LIFECYCLE_SYNTHETIC_PREVIEW: '1' }),
        list.LIVE_READONLY_BANNER,
      );
      assert.equal(
        list.readerLifecycleBannerText({
          READER_LIFECYCLE_SYNTHETIC_PREVIEW: '1',
          DEEPQUILL_URL: 'http://127.0.0.1:9',
        }),
        list.SYNTHETIC_PREVIEW_BANNER,
      );
      assert.equal(
        list.readerLifecycleBannerText({ READER_LIFECYCLE_EDITING_ENABLED: '1' }),
        list.LIVE_EDITING_BANNER,
      );
      assert.match(page, /PROVIDER_WARNING/);
      assert.match(page, /WEBSITE_PURCHASE_CANNOT_EDIT/);
      assert.match(page, /NO_NURTURE_JOB/);
      assert.match(page, /LOCAL_CLASSIFICATION_NOTE/);
      assert.doesNotMatch(page, /LOCALLY_CONTACTABLE_NOT_SAFE/);
      assert.match(scan(FILES.detailClient), /editingEnabled \?/);
      assert.doesNotMatch(scan(FILES.detailClient), /NEXT_PUBLIC_/);
    });

    await check('superseded evidence is collapsed; disputed evidence stays visible; history is preserved', () => {
      const client = scan(FILES.detailClient);
      const model = scan(FILES.detailModel);
      assert.match(client, /Disputed or conflicting evidence/);
      assert.match(client, /<details className=\{styles.supersededFold\}>/);
      assert.match(client, /<summary>\{supersededFoldLabel/);
      assert.doesNotMatch(client, /Earlier, disputed, or superseded/);
      assert.match(model, /disputed: LifecycleEvidence\[\]/);
      assert.match(model, /superseded: LifecycleEvidence\[\]/);
      assert.equal(detail.supersededFoldLabel(1), 'Earlier superseded evidence (1)');
      const grouped = detail.groupEvidence([
        { status: 'confirmed' },
        { status: 'provisional' },
        { status: 'disputed' },
        { status: 'superseded' },
      ]);
      assert.equal(grouped.disputed.length, 1);
      assert.equal(grouped.superseded.length, 1);
      assert.equal(grouped.historical.length, 2);
    });

    await check('actor picker uses dedicated /actors contract with no synthetic fallback', () => {
      const panel = scan(FILES.editPanel);
      const model = scan(FILES.editModel);
      const client = scan(FILES.detailClient);
      assert.doesNotMatch(model, /SYNTHETIC_ACTORS/);
      assert.doesNotMatch(panel, /SYNTHETIC_ACTORS/);
      assert.doesNotMatch(client, /SYNTHETIC_ACTORS/);
      assert.doesNotMatch(panel, /fu_preview_helper_inactive/);
      assert.doesNotMatch(model, /fu_preview_helper_inactive/);
      assert.doesNotMatch(panel, /\/api\/fulfillment\/users/);
      assert.doesNotMatch(model, /\/api\/fulfillment\/users/);
      assert.match(panel, /ACTORS_PROXY_PATH/);
      assert.match(model, /\/api\/admin\/reader-lifecycle\/actors/);
      assert.match(model, /ACTORS_UNAVAILABLE/);
      assert.match(panel, /actorLoadErrorCopy/);
      assert.match(panel, /Retry/);
      assert.match(panel, /disabled=\{!actorsReady\}/);
      const fixtures = live.ACTORS.map((row) => ({ id: row.id, label: row.name, active: row.active }));
      const actors = edit.selectableActors(fixtures);
      assert.equal(actors.length, 2);
      assert.equal(actors.some((row) => row.id === 'fu_preview_helper_inactive'), false);
      assert.deepEqual(edit.selectableActors(), []);
      assert.equal(edit.canSubmitWithActors([]), false);
      assert.equal(edit.actorName('fu_preview_helper_a'), 'Unknown actor');
      assert.equal(edit.actorName('fu_preview_helper_a', actors), 'Preview Helper A (synthetic)');
      assert.equal(edit.parseActorsResponse({ ok: true, actors: [{ id: 'x', label: 'Helper X' }] }).actors[0].label, 'Helper X');
      assert.equal(edit.parseActorsResponse({ ok: true, actors: [{ id: 'x', name: 'no label' }] }).actors.length, 0);
    });

    await check('edit panel posts only through 5D proxies and has no local writes', () => {
      const panel = scan(FILES.editPanel);
      assert.match(panel, /Manage lifecycle record/);
      assert.match(panel, /method: 'POST'/);
      assert.match(panel, /Idempotency-Key/);
      assert.match(panel, /mutationPath/);
      assert.match(scan(FILES.editModel), /\/api\/admin\/reader-lifecycle/);
      assert.match(edit.mutationPath({ type: 'addEvidence' }, 'rp_x'), /\/api\/admin\/reader-lifecycle\/readers\/rp_x\/evidence/);
      assert.doesNotMatch(panel, /createReaderLifecycleWriteService/);
      assert.doesNotMatch(panel, /prisma\./);
      assert.doesNotMatch(panel, /method:\s*['"]PATCH['"]/);
      assert.doesNotMatch(panel, /method:\s*['"]DELETE['"]/);
      assert.doesNotMatch(scan(FILES.detailClient), /method:\s*['"]POST['"]/);
      assert.match(scan(FILES.detailClient), /method: 'GET'/);
    });

    await check('permitted actions are contextual and omit merge/delete/purchase edits', () => {
      const blank = readerFixture();
      const labels = edit.permittedActions(blank).map((row) => row.label);
      assert.ok(labels.includes('Add provisional evidence'));
      assert.ok(labels.includes('Add Do Not Contact'));
      assert.ok(labels.includes('Allow local contact'));
      assert.ok(labels.includes('Open identity review'));
      assert.equal(labels.some((label) => /Confirm|Correct|Dispute|Replace/.test(label)), false);

      const website = readerFixture({
        evidenceHistory: [
          evidenceRow({ id: 'ev_web', kind: 'website_stripe', status: 'confirmed', accountingTruth: true }),
        ],
        purchases: [{ id: 'pur_1', createdAt: '2026-06-01T00:00:00.000Z', amount: 12, currency: 'usd', source: 'website', saleStatus: 'live', fulfillmentStatus: 'unfulfilled', accountingTruth: true }],
      });
      const webLabels = edit.permittedActions(website).map((row) => row.label).join('\n');
      assert.doesNotMatch(webLabels, /Confirm website|Dispute website|Correct website/i);
      assert.equal(edit.canConfirmEvidence(website.evidenceHistory[0]), false);
      assert.equal(edit.canDisputeEvidence(website.evidenceHistory[0]), false);

      const provisional = readerFixture({ evidenceHistory: [evidenceRow({})] });
      const prov = edit.permittedActions(provisional).map((row) => row.action.type);
      assert.ok(prov.includes('confirmEvidence'));
      assert.ok(prov.includes('correctEvidence'));
      assert.ok(prov.includes('disputeEvidence'));
      assert.equal(prov.includes('replaceEvidence'), false);

      const disputed = readerFixture({ evidenceHistory: [evidenceRow({ status: 'disputed' })] });
      const disp = edit.permittedActions(disputed).map((row) => row.action.type);
      assert.ok(disp.includes('replaceEvidence'));
      assert.equal(disp.includes('confirmEvidence'), false);

      const openReview = readerFixture({
        identityReviews: [{ id: 'ir_1', primaryUserId: 'u1', otherUserId: null, reasonCode: 'duplicate_name', details: null, status: 'open', resolutionReason: null, resolvedAt: null, actorType: 'admin', actorLabel: 'A', createdAt: '2026-08-01T00:00:00.000Z' }],
      });
      assert.ok(edit.permittedActions(openReview).some((row) => row.action.type === 'resolveIdentityReview'));

      assert.ok(labels.includes('Archive as test/invalid operational reader'));
      assert.equal(labels.includes('Restore operational reader'), false);
      const archived = readerFixture({ legacy: { source: 'website', readerType: 'interested', status: 'archived' } });
      const archivedActions = edit.permittedActions(archived).map((row) => row.action.type);
      assert.ok(archivedActions.includes('restoreReader'));
      assert.equal(archivedActions.includes('archiveReader'), false);
      assert.doesNotMatch(edit.permittedActions(blank).map((row) => row.label).join('\n'), /Delete|Merge|Bulk /i);

      const panel = scan(FILES.editPanel);
      const modelSrc = scan(FILES.editModel);
      assert.doesNotMatch(panel, />Merge</);
      assert.doesNotMatch(panel, /Delete evidence|Reassign purchase|>Send email</i);
      assert.match(modelSrc, /Add Do Not Contact/);
      assert.match(modelSrc, /Allow local contact/);
      assert.equal(edit.confirmButtonLabel({ type: 'addDnc' }), 'Add Do Not Contact');
      assert.equal(edit.confirmButtonLabel({ type: 'allowContact' }), 'Allow local contact');
      assert.equal(edit.confirmButtonLabel({ type: 'archiveReader' }), 'Archive operational reader');
      assert.equal(edit.confirmButtonLabel({ type: 'restoreReader' }), 'Restore operational reader');
      assert.equal(edit.inFlightLabel({ type: 'archiveReader' }), 'Archiving…');
      assert.equal(edit.inFlightLabel({ type: 'restoreReader' }), 'Restoring…');
      assert.doesNotMatch(edit.confirmButtonLabel({ type: 'archiveReader' }), /^Save$/);
      assert.match(edit.mutationPath({ type: 'archiveReader' }, 'rp_x'), /\/archive$/);
      assert.match(edit.mutationPath({ type: 'restoreReader' }, 'rp_x'), /\/restore$/);
      assert.doesNotMatch(panel, /simple on\/off switch/i);
    });

    await check('confirmation copy, specific save buttons, and accounting protection', () => {
      const action = { type: 'addEvidence' };
      assert.equal(edit.confirmButtonLabel(action), 'Add provisional evidence');
      assert.equal(edit.confirmButtonLabel({ type: 'correctEvidence', evidenceId: 'x' }), 'Save corrected evidence');
      assert.equal(edit.NO_EMAIL_STATEMENT, 'No email will be sent.');
      assert.match(edit.historyPreservationNote({ type: 'disputeEvidence', evidenceId: 'x' }), /accounting truth/);
      assert.match(edit.ALLOW_CONTACT_WARNING, /does not create an email address/);
      assert.match(edit.WEBSITE_WRONG_OWNER_NOTE, /does not change website Purchase/);
      const panel = scan(FILES.editPanel);
      assert.match(panel, /Cancel—make no changes/);
      assert.doesNotMatch(panel, />OK</);
      assert.match(scan(FILES.detailClient), /Open identity review/);
      assert.doesNotMatch(scan(FILES.detailClient), /Edit purchase|Delete purchase|Change Stripe/i);
      assert.match(scan(FILES.detailCss), /max-width: 430px/);
      assert.match(scan(FILES.detailCss), /overflow-x: hidden/);
      assert.match(scan(FILES.editModel), /Archive as test\/invalid operational reader/);
      assert.match(scan(FILES.editModel), /Restore operational reader/);
      assert.match(scan(FILES.editPanel), /action\.type === 'archiveReader'/);
      assert.match(scan(FILES.editPanel), /action\.type === 'restoreReader'/);
      assert.doesNotMatch(scan(FILES.editPanel), /Bulk archive|Delete reader|Merge identities/);
    });

    await check('idempotency key session: retry keeps key, field change mints a new key', () => {
      const payload = { kind: 'manual_amazon', reason: 'Known Amazon purchase evidence', actorId: 'fu_preview_helper_a' };
      const first = edit.beginIdempotencySession(payload);
      const retry = edit.idempotencyKeyForAttempt(first, payload, 'retry');
      assert.equal(retry.key, first.key);
      const changed = edit.idempotencyKeyForAttempt(first, { ...payload, reason: 'Updated Amazon purchase evidence' }, 'retry');
      assert.notEqual(changed.key, first.key);
      const panel = scan(FILES.editPanel);
      assert.match(panel, /inFlightRef\.current/);
      assert.match(panel, /Escape/);
      assert.doesNotMatch(panel, /searchParams|location\.href.*[Ii]dempotency/);
      assert.doesNotMatch(panel, /console\.(log|debug|info)/);
      assert.doesNotMatch(scan(FILES.editModel), /console\.(log|debug|info)/);
      const key = edit.createIdempotencyKey();
      assert.match(key, /^[A-Za-z0-9._:-]+$/);
      assert.ok(key.length >= 8 && key.length <= 128);
    });

    await check('error mapping covers 400/401/403/404/409/500/502 without leaking secrets', () => {
      assert.equal(edit.classifyMutationError(400, 'invalid_reason'), 'validation');
      assert.equal(edit.classifyMutationError(401), 'unauthorized');
      assert.equal(edit.classifyMutationError(403), 'forbidden');
      assert.equal(edit.classifyMutationError(404), 'not_found');
      assert.equal(edit.classifyMutationError(409, 'stale_evidence'), 'stale');
      assert.equal(edit.mutationErrorCopy('stale').body, 'Someone else changed this record. Reload before trying again.');
      assert.equal(edit.classifyMutationError(409, 'idempotency_conflict'), 'idempotency_conflict');
      assert.equal(edit.classifyMutationError(500, 'admin_not_configured'), 'not_configured');
      assert.equal(edit.classifyMutationError(502, 'proxy_unavailable'), 'unavailable');
      assert.equal(edit.classifyMutationError(503, 'lifecycle_mutations_disabled'), 'mutations_disabled');
      assert.equal(edit.mutationErrorCopy('mutations_disabled').title, 'Saving is disabled');
      assert.doesNotMatch(edit.mutationErrorCopy('mutations_disabled').body, /READER_LIFECYCLE/);
      assert.equal(edit.mutationErrorCopy('unavailable').allowRetry, true);
      assert.equal(edit.parseMutationResponse({ ok: true, replay: true, reader: { readerProfileId: 'rp' } }).replay, true);
      const copy = JSON.stringify(edit.mutationErrorCopy('validation'));
      assert.doesNotMatch(copy, /stack|ADMIN_KEY|fulfillment-token|Idempotency/);
    });

    await check('calendar purchase dates and actor-load 403 stay honest', () => {
      assert.equal(detail.formatCalendarDate('2026-07-01T00:00:00.000Z'), 'July 1, 2026');
      assert.equal(detail.classifyLifecycleReadError(403, 'Forbidden - x-admin-key required in production'), 'forbidden');
      assert.equal(detail.errorCopy('forbidden').title, 'Access denied');
      assert.equal(edit.actorLoadErrorCopy('forbidden').title, 'Access denied');
      assert.doesNotMatch(edit.actorLoadErrorCopy('forbidden').body, /x-admin-key|ADMIN_KEY|configuration/i);
      const client = scan(FILES.detailClient);
      const panel = scan(FILES.editPanel);
      assert.match(client, /formatCalendarDate\(row\.purchaseDate\)/);
      assert.doesNotMatch(client, /formatOccurredAt\(row\.purchaseDate\)/);
      assert.match(panel, /formatCalendarDate\(row\.purchaseDate\)/);
      assert.match(panel, /actorLoadErrorCopy/);
      assert.match(panel, /disabled=\{!actorsReady\}/);
    });

    await check('history labels and identity reasons are plain language', () => {
      assert.equal(detail.evidenceStatusLabel('provisional'), 'Current—Provisional');
      assert.equal(detail.evidenceStatusLabel('confirmed'), 'Current—Confirmed');
      assert.equal(detail.evidenceStatusLabel('disputed'), 'Disputed');
      assert.equal(detail.evidenceStatusLabel('superseded'), 'Superseded');
      assert.match(detail.supersededRelationshipLabel({ status: 'superseded', supersededById: 'x' }), /later administrative record/);
      assert.equal(detail.identityReasonLabel('possible_wrong_website_owner'), 'Possible wrong website owner');
      assert.equal(detail.identityReasonLabel('stripe_session_user_mismatch'), 'Stripe session/user mismatch');
      assert.match(edit.AUDIT_HISTORY_NOT_IN_GET, /GET-detail contract/);
    });

    await check('payloads stay within 5C field contracts and cannot create confirmed evidence directly', () => {
      const add = edit.addEvidencePayload({
        kind: 'manual_amazon',
        purchaseDate: '2026-07-01',
        details: 'Receipt',
        reason: 'Known Amazon purchase evidence',
        actorId: 'fu_preview_helper_a',
      });
      assert.equal(add.kind, 'manual_amazon');
      assert.equal(add.status, undefined);
      assert.equal(edit.confirmEvidencePayload('Confirming this Amazon purchase now', 'fu_preview_helper_a', 'provisional').expectedStatus, 'provisional');
      assert.equal(edit.contactDecisionPayload('suppress', 'Reader asked not to be contacted', 'fu_preview_helper_a').decision, 'suppress');
      const open = edit.openIdentityReviewPayload({
        reasonCode: 'possible_wrong_website_owner',
        details: '',
        otherUserId: 'user_edit_other',
        reason: 'Checkout may belong to someone else',
        actorId: 'fu_preview_helper_a',
      });
      assert.equal(open.otherUserId, 'user_edit_other');
      assert.equal(
        edit.resolveIdentityReviewPayload('resolved_keep_separate', 'Keep these records separate after review', 'fu_preview_helper_b').expectedStatus,
        'open',
      );
    });

    await check('existing Reader Manager files are untouched', () => {
      for (const file of READERS_FILES) {
        assert.equal(gitDiff(file), '', file);
      }
    });

    await check('no email, jobs, Stripe session editing, or PII logging in 5E files', () => {
      for (const file of [FILES.editPanel, FILES.editModel, FILES.detailPage, FILES.detailClient, FILES.liveHelper]) {
        const src = scan(file);
        assert.doesNotMatch(src, /mailchimp|nodemailer|send-reader-recommendation|runBackfill/i);
        assert.doesNotMatch(src, /console\.(log|debug|info)/);
      }
    });

    await check('49 migrations are present for disposable-db live chain', () => {
      const dirs = fs.readdirSync(path.join(DEEPQUILL_ROOT, 'prisma', 'migrations'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .filter((entry) => fs.existsSync(path.join(DEEPQUILL_ROOT, 'prisma', 'migrations', entry.name, 'migration.sql')));
      assert.equal(dirs.length, 49, `expected 49 migration folders, found ${dirs.length}`);
    });

    await check('live local chain: disposable SQLite, 5C API, 5D proxies, required mutations', async () => {
      const migrated = migrateDisposableDb();
      process.env.DATABASE_URL = migrated.fileUrl;
      const prisma = live.createPrisma();
      let backend;
      let nextHandle;
      try {
        await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
        const applied = await prisma.$queryRawUnsafe('SELECT COUNT(*) as n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL');
        assert.equal(Number(applied[0].n), 49);
        await live.seedSyntheticPreview(prisma);
        process.env.READER_LIFECYCLE_MUTATIONS_ENABLED = '1';
        backend = await live.startLifecycleBackend(prisma, { adminKey: ADMIN_KEY });
        const backendUrl = `http://127.0.0.1:${backend.port}`;
        const ping = await httpCall({ port: backend.port, method: 'GET', urlPath: '/ping' });
        assert.equal(ping.text, 'pong');

        const nextPort = await getFreePort();
        nextHandle = startNextDev({ backendUrl, port: nextPort });
        await waitForNextReady(nextHandle);

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
        async function proxyGet(urlPath) {
          return httpCall({
            port: nextPort,
            method: 'GET',
            urlPath,
            headers: { cookie: SESSION_COOKIE },
          });
        }

        let compiled = await proxyGet('/api/admin/reader-lifecycle/readers/rp_edit_blank');
        for (let i = 0; i < 30 && compiled.status === 404 && !compiled.json; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          compiled = await proxyGet('/api/admin/reader-lifecycle/readers/rp_edit_blank');
        }
        assert.equal(compiled.status, 200, compiled.text.slice(0, 400));
        assert.equal(compiled.json.ok, true);

        const auth = await httpCall({
          port: nextPort,
          method: 'POST',
          urlPath: '/api/fulfillment/auth',
          body: { token: FULFILLMENT_TOKEN, redirect: '/admin/reader-lifecycle-preview' },
        });
        assert.equal(auth.status, 200, auth.text.slice(0, 200));

        const blankPath = '/api/admin/reader-lifecycle/readers/rp_edit_blank/evidence';
        const amazon = await proxyPost(blankPath, {
          kind: 'manual_amazon',
          purchaseDate: '2026-07-01',
          details: 'Synthetic Amazon receipt note',
          reason: 'Known Amazon purchase evidence',
          actorId: 'fu_preview_helper_a',
        }, nextKey('amz', 1));
        assert.equal(amazon.status, 200, amazon.text.slice(0, 400));
        assert.equal(amazon.json.ok, true);
        assert.equal(amazon.json.replay, false);
        assert.equal(amazon.json.reader.sources.includes('amazon'), true);
        const amazonId = amazon.json.reader.evidenceHistory.find((row) => row.kind === 'manual_amazon' && row.status === 'provisional').id;

        const bn = await proxyPost(
          '/api/admin/reader-lifecycle/readers/rp_edit_amazon/evidence',
          { kind: 'manual_bn', reason: 'Known Barnes and Noble purchase', actorId: 'fu_preview_helper_a' },
          nextKey('bn', 2),
        );
        assert.equal(bn.status, 200, bn.text.slice(0, 300));
        assert.equal(bn.json.reader.sources.includes('barnes_noble'), true);

        const otherEv = await proxyPost(
          '/api/admin/reader-lifecycle/readers/rp_edit_amazon/evidence',
          { kind: 'manual_other', reason: 'Independent bookstore purchase noted', actorId: 'fu_preview_helper_b' },
          nextKey('other', 3),
        );
        assert.equal(otherEv.status, 200, otherEv.text.slice(0, 300));

        const gift = await proxyPost(
          '/api/admin/reader-lifecycle/readers/rp_edit_nomail/evidence',
          { kind: 'gift_book_owner', reason: 'Book was given to this person', actorId: 'fu_preview_helper_a' },
          nextKey('gift', 4),
        );
        assert.equal(gift.status, 200, gift.text.slice(0, 300));
        assert.equal(gift.json.reader.ownership, 'book_owner_gifted');

        const confirm = await proxyPost(
          `/api/admin/reader-lifecycle/evidence/${amazonId}/confirm`,
          { reason: 'Receipt was reviewed and confirmed', actorId: 'fu_preview_helper_a', expectedStatus: 'provisional' },
          nextKey('confirm', 5),
        );
        assert.equal(confirm.status, 200, confirm.text.slice(0, 400));
        const confirmed = confirm.json.reader.evidenceHistory.find((row) => row.status === 'confirmed' && row.kind === 'manual_amazon');
        const superseded = confirm.json.reader.evidenceHistory.find((row) => row.id === amazonId);
        assert.ok(confirmed);
        assert.equal(superseded.status, 'superseded');

        const dateCorrect = await proxyPost(
          `/api/admin/reader-lifecycle/evidence/${confirmed.id}/correct`,
          {
            reason: 'Purchase date was one day later',
            actorId: 'fu_preview_helper_a',
            expectedStatus: 'confirmed',
            kind: 'manual_amazon',
            status: 'confirmed',
            purchaseDate: '2026-07-02',
          },
          nextKey('date', 6),
        );
        assert.equal(dateCorrect.status, 200, dateCorrect.text.slice(0, 400));
        const afterDate = dateCorrect.json.reader.evidenceHistory.find((row) => row.status === 'confirmed' && row.kind === 'manual_amazon');
        assert.match(String(afterDate.purchaseDate), /2026-07-02/);

        const retailerCorrect = await proxyPost(
          `/api/admin/reader-lifecycle/evidence/${afterDate.id}/correct`,
          {
            reason: 'Retailer was Barnes and Noble',
            actorId: 'fu_preview_helper_b',
            expectedStatus: 'confirmed',
            kind: 'manual_bn',
            status: 'confirmed',
          },
          nextKey('retailer', 7),
        );
        assert.equal(retailerCorrect.status, 200, retailerCorrect.text.slice(0, 400));
        const bnConfirmed = retailerCorrect.json.reader.evidenceHistory.find((row) => row.status === 'confirmed' && row.kind === 'manual_bn');
        assert.ok(bnConfirmed);

        const dispute = await proxyPost(
          `/api/admin/reader-lifecycle/evidence/${bnConfirmed.id}/dispute`,
          { reason: 'This evidence may belong to someone else', actorId: 'fu_preview_helper_a', expectedStatus: 'confirmed' },
          nextKey('dispute', 8),
        );
        assert.equal(dispute.status, 200, dispute.text.slice(0, 400));
        assert.equal(dispute.json.reader.review === 'conflicting' || dispute.json.reader.nurtureSuppressed === true, true);
        const disputedRow = dispute.json.reader.evidenceHistory.find((row) => row.id === bnConfirmed.id);
        assert.equal(disputedRow.status, 'disputed');

        const replace = await proxyPost(
          `/api/admin/reader-lifecycle/evidence/${bnConfirmed.id}/replace`,
          {
            reason: 'Replacement after the dispute was reviewed',
            actorId: 'fu_preview_helper_a',
            expectedStatus: 'disputed',
            kind: 'manual_bn',
            status: 'provisional',
            purchaseDate: '2026-07-03',
          },
          nextKey('replace', 9),
        );
        assert.equal(replace.status, 200, replace.text.slice(0, 400));
        assert.ok(replace.json.reader.evidenceHistory.some((row) => row.id === bnConfirmed.id && row.status === 'superseded'));
        assert.ok(replace.json.reader.evidenceHistory.some((row) => row.status === 'provisional' && row.kind === 'manual_bn'));

        const dnc = await proxyPost(
          '/api/admin/reader-lifecycle/readers/rp_edit_nomail/contact-decisions',
          { decision: 'suppress', reason: 'Reader asked not to be emailed', actorId: 'fu_preview_helper_a' },
          nextKey('dnc', 10),
        );
        assert.equal(dnc.status, 200, dnc.text.slice(0, 300));
        assert.equal(dnc.json.reader.contactability, 'suppressed_do_not_contact');

        const allow = await proxyPost(
          '/api/admin/reader-lifecycle/readers/rp_edit_nomail/contact-decisions',
          { decision: 'allow', reason: 'Manual DNC is no longer requested', actorId: 'fu_preview_helper_b' },
          nextKey('allow', 11),
        );
        assert.equal(allow.status, 200, allow.text.slice(0, 300));
        assert.equal(allow.json.reader.contactDecisions.length >= 2, true);
        assert.equal(allow.json.reader.contactability, 'no_mailable_email');

        const openReview = await proxyPost(
          '/api/admin/reader-lifecycle/readers/rp_edit_website/identity-reviews',
          {
            reasonCode: 'possible_wrong_website_owner',
            reason: 'Website purchase may belong to someone else',
            actorId: 'fu_preview_helper_a',
          },
          nextKey('openrev', 12),
        );
        assert.equal(openReview.status, 200, openReview.text.slice(0, 400));
        assert.equal(openReview.json.reader.review, 'identity_review_required');
        assert.equal(openReview.json.reader.nurtureSuppressed, true);
        assert.equal(openReview.json.reader.purchases[0].accountingTruth, true);
        const reviewId = openReview.json.reader.identityReviews.find((row) => row.status === 'open').id;

        const resolve = await proxyPost(
          `/api/admin/reader-lifecycle/identity-reviews/${reviewId}/resolve`,
          {
            status: 'resolved_keep_separate',
            resolutionReason: 'Keep these records separate after review',
            actorId: 'fu_preview_helper_b',
            expectedStatus: 'open',
          },
          nextKey('resolve', 13),
        );
        assert.equal(resolve.status, 200, resolve.text.slice(0, 400));
        const resolved = resolve.json.reader.identityReviews.find((row) => row.id === reviewId);
        assert.equal(resolved.status, 'resolved_keep_separate');
        const websitePurchases = await prisma.purchase.findMany({ where: { userId: 'user_edit_website' } });
        assert.equal(websitePurchases.length, 1);
        assert.equal(websitePurchases[0].userId, 'user_edit_website');

        const archived = await proxyPost(
          '/api/admin/reader-lifecycle/readers/rp_edit_identity/archive',
          {
            reasonCode: 'test_record',
            reason: 'Synthetic test record for archive restore live chain',
            actorId: 'fu_preview_helper_a',
            expectedStatus: 'active',
            confirmed: true,
          },
          nextKey('archive', 16),
        );
        assert.equal(archived.status, 200, archived.text.slice(0, 400));
        assert.equal(archived.json.reader.legacy.status, 'archived');
        assert.equal(archived.json.reader.legacy.archiveReasonCode, 'test_record');
        assert.equal(archived.json.reader.nurtureSuppressed, true);

        const restored = await proxyPost(
          '/api/admin/reader-lifecycle/readers/rp_edit_identity/restore',
          {
            reason: 'Synthetic restore after archive live chain check',
            actorId: 'fu_preview_helper_b',
            expectedStatus: 'archived',
            confirmed: true,
          },
          nextKey('restore', 17),
        );
        assert.equal(restored.status, 200, restored.text.slice(0, 400));
        assert.equal(restored.json.reader.legacy.status, 'active');
        assert.equal(restored.json.reader.legacy.archiveReasonCode, null);

        const replay = await proxyPost(
          '/api/admin/reader-lifecycle/readers/rp_edit_amazon/evidence',
          { kind: 'manual_other', reason: 'Independent bookstore purchase noted', actorId: 'fu_preview_helper_b' },
          nextKey('other', 3),
        );
        assert.equal(replay.status, 200, replay.text.slice(0, 300));
        assert.equal(replay.json.replay, true);
        const otherCount = replay.json.reader.evidenceHistory.filter((row) => row.kind === 'manual_other').length;
        assert.equal(otherCount, otherEv.json.reader.evidenceHistory.filter((row) => row.kind === 'manual_other').length);

        const stale = await proxyPost(
          `/api/admin/reader-lifecycle/evidence/${amazonId}/confirm`,
          { reason: 'Trying to confirm a superseded row now', actorId: 'fu_preview_helper_a', expectedStatus: 'provisional' },
          nextKey('stale', 14),
        );
        assert.equal(stale.status, 409);
        assert.equal(edit.classifyMutationError(stale.status, stale.json.error), 'stale');

        const unauthorized = await httpCall({
          port: nextPort,
          method: 'POST',
          urlPath: blankPath,
          headers: { 'Idempotency-Key': nextKey('unauth', 15) },
          body: { kind: 'manual_amazon', reason: 'Known Amazon purchase evidence', actorId: 'fu_preview_helper_a' },
        });
        assert.equal(unauthorized.status, 401);

        const page = await httpCall({
          port: nextPort,
          method: 'GET',
          urlPath: '/admin/reader-lifecycle-preview/rp_edit_blank',
          headers: { cookie: SESSION_COOKIE },
        });
        assert.equal(page.status, 200, `detail page ${page.status}`);
        assert.match(page.text, /LOCAL SYNTHETIC PREVIEW/);
        assert.doesNotMatch(page.text, /synthetic records only/i);
        assert.match(scan(FILES.editPanel), /Manage lifecycle record/);
        assert.doesNotMatch(scan(FILES.editPanel), /fu_preview_helper_inactive/);

        if (KEEP_PREVIEW) {
          liveCleanup = async () => {};
          process.stdout.write(
            `\nKEEP_5E_PREVIEW=1 local URL: http://127.0.0.1:${nextPort}/admin/reader-lifecycle-preview/rp_edit_blank\n` +
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

  console.log(`\nverify-reader-lifecycle-edit: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`${err && err.stack ? err.stack : err}\n`);
  process.exit(1);
});
