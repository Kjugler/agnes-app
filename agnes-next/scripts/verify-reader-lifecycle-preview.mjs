#!/usr/bin/env node
/**
 * Local checks for the read-only Reader Lifecycle preview.
 * Uses synthetic fixtures only. Does not call production or touch databases.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const AGNES_NEXT_ROOT = path.resolve(SCRIPT_DIR, '..');
const REPO_ROOT = path.resolve(AGNES_NEXT_ROOT, '..');
const PREVIEW_DIR = path.join(AGNES_NEXT_ROOT, 'src', 'app', 'admin', 'reader-lifecycle-preview');
const MODEL_TS = path.join(PREVIEW_DIR, 'readerLifecyclePreviewModel.ts');

const FILES = {
  page: path.join(PREVIEW_DIR, 'page.tsx'),
  client: path.join(PREVIEW_DIR, 'ReaderLifecyclePreviewClient.tsx'),
  model: MODEL_TS,
  css: path.join(PREVIEW_DIR, 'preview.module.css'),
};

const READERS_FILES = [
  path.join(AGNES_NEXT_ROOT, 'src', 'app', 'admin', 'readers', 'page.tsx'),
  path.join(AGNES_NEXT_ROOT, 'src', 'app', 'admin', 'readers', 'ReadersAdminClient.tsx'),
  path.join(AGNES_NEXT_ROOT, 'src', 'app', 'api', 'admin', 'readers', 'route.ts'),
  path.join(AGNES_NEXT_ROOT, 'src', 'app', 'api', 'admin', 'readers', '[id]', 'route.ts'),
];

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
      process.stderr.write(`FAIL ${name}: ${err && err.message ? err.message : err}\n`);
    });
}

function transpileModel() {
  const require = createRequire(path.join(AGNES_NEXT_ROOT, 'package.json'));
  const ts = require('typescript');
  const source = fs.readFileSync(MODEL_TS, 'utf8');
  const { outputText, diagnostics } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: 'readerLifecyclePreviewModel.ts',
    reportDiagnostics: true,
  });
  if (diagnostics && diagnostics.length) {
    throw new Error(diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
  }
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-checkpoint4a-'));
  const outFile = path.join(outDir, 'readerLifecyclePreviewModel.mjs');
  fs.writeFileSync(outFile, outputText);
  return { outDir, outFile };
}

function item(overrides) {
  return {
    readerProfileId: 'rp_1',
    userId: 'user_1',
    name: 'Synthetic Reader',
    email: 'synthetic.reader@example.test',
    emailDisplay: 'synthetic.reader@example.test',
    hasRealEmail: true,
    legacy: { source: 'website', readerType: 'purchased', status: 'active' },
    ownership: 'purchaser',
    sources: ['website'],
    confidence: 'confirmed',
    contactability: 'contactable',
    review: 'clear',
    nurtureSuppressed: true,
    reasons: ['live_website_purchase'],
    latestCommunication: {
      occurredAt: '2026-08-01T12:00:00.000Z',
      category: 'purchase_confirmation',
      outcome: 'recorded_sent_delivery_unknown',
      caption: 'Confirmation recorded',
      deliveryKnown: false,
      deliveryNote: 'Historical or reconstructed send recorded; delivery is unknown.',
    },
    createdAt: '2026-08-01T12:00:00.000Z',
    ...overrides,
  };
}

async function main() {
  const { outDir, outFile } = transpileModel();
  const mod = await import(pathToFileURL(outFile).href);
  try {
    await check('preview files exist', () => {
      for (const file of Object.values(FILES)) assert.equal(fs.existsSync(file), true, file);
    });

    await check('read-only banner and provider warning are present', () => {
      const page = fs.readFileSync(FILES.page, 'utf8');
      const client = fs.readFileSync(FILES.client, 'utf8');
      const model = fs.readFileSync(FILES.model, 'utf8');
      assert.match(page, /readerLifecycleBannerText/);
      assert.match(page, /PROVIDER_WARNING/);
      assert.match(client, /CONTACTABLE_ASTERISK_NOTE/);
      assert.equal(
        mod.LIVE_READONLY_BANNER,
        'LIVE READER LIFECYCLE BETA — Viewing live administrative records. Changes and emails are disabled.',
      );
      assert.equal(mod.readerLifecycleBannerText({}), mod.LIVE_READONLY_BANNER);
      assert.equal(mod.readerLifecycleEditingEnabled({}), false);
      assert.equal(
        mod.readerLifecycleBannerText({ READER_LIFECYCLE_SYNTHETIC_PREVIEW: '1' }),
        mod.LIVE_READONLY_BANNER,
      );
      assert.equal(
        mod.readerLifecycleBannerText({
          READER_LIFECYCLE_SYNTHETIC_PREVIEW: '1',
          DEEPQUILL_URL: 'http://127.0.0.1:9',
        }),
        mod.SYNTHETIC_PREVIEW_BANNER,
      );
      assert.doesNotMatch(page, /synthetic records only/i);
      assert.match(model, /Email-provider suppression status is not yet integrated/);
      assert.equal(mod.PROVIDER_WARNING.includes('does not mean approved or safe to email'), true);
      assert.equal(mod.listContactLabel(item({})), 'Locally contactable*');
      assert.doesNotMatch(client, /Provider status not integrated; not approved to email/);
    });

    await check('no mutation methods, email, or backfill imports', () => {
      for (const file of [FILES.page, FILES.client, FILES.model]) {
        const src = fs.readFileSync(file, 'utf8');
        assert.doesNotMatch(src, /method:\s*['"]POST['"]/);
        assert.doesNotMatch(src, /method:\s*['"]PATCH['"]/);
        assert.doesNotMatch(src, /method:\s*['"]PUT['"]/);
        assert.doesNotMatch(src, /method:\s*['"]DELETE['"]/);
        assert.doesNotMatch(src, /mailchimp|nodemailer|stripe|backfill|send-reader-recommendation/i);
        assert.doesNotMatch(src, /fetch\([^)]*\{\s*method:\s*['"]POST/);
      }
      const client = fs.readFileSync(FILES.client, 'utf8');
      assert.match(client, /method: 'GET'/);
      assert.match(client, /View details/);
      assert.doesNotMatch(client, /Save|Approve batch|Send email|Add reader/i);
    });

    await check('confirmed website purchaser labels', () => {
      const row = mod.parseListItem(item({}));
      assert.equal(mod.ownershipLabel(row.ownership), 'Purchaser');
      assert.equal(mod.sourcesLabel(row.sources), 'Website');
      assert.equal(mod.confidenceLabel(row.confidence), 'Confirmed');
      assert.equal(mod.accentTone(row), 'purchaser');
    });

    await check('provisional Amazon purchaser labels', () => {
      const row = mod.parseListItem(
        item({ sources: ['amazon'], confidence: 'provisional', review: 'incomplete' }),
      );
      assert.equal(mod.sourcesLabel(row.sources), 'Amazon');
      assert.equal(mod.confidenceLabel(row.confidence), 'Provisional');
      assert.equal(mod.reviewLabel(row.review), 'Incomplete');
      assert.equal(mod.accentTone(row), 'provisional');
    });

    await check('provisional Barnes & Noble purchaser labels', () => {
      const row = mod.parseListItem(
        item({ sources: ['barnes_noble'], confidence: 'provisional', review: 'incomplete' }),
      );
      assert.equal(mod.sourcesLabel(row.sources), 'Barnes & Noble');
    });

    await check('website plus B&N multiple-source purchaser labels', () => {
      const row = mod.parseListItem(item({ sources: ['website', 'barnes_noble'] }));
      assert.equal(mod.sourcesLabel(row.sources), 'Website + Barnes & Noble');
    });

    await check('gifted owner labels', () => {
      const row = mod.parseListItem(
        item({ ownership: 'book_owner_gifted', sources: [], confidence: 'confirmed' }),
      );
      assert.equal(mod.ownershipLabel(row.ownership), 'Book Owner—Gifted');
      assert.equal(mod.accentTone(row), 'gifted');
    });

    await check('non-purchaser labels', () => {
      const row = mod.parseListItem(
        item({
          ownership: 'non_purchaser',
          sources: [],
          confidence: 'unknown',
          nurtureSuppressed: false,
        }),
      );
      assert.equal(mod.ownershipLabel(row.ownership), 'Non-purchaser');
      assert.equal(mod.accentTone(row), 'nonPurchaser');
    });

    await check('unknown ownership labels', () => {
      const row = mod.parseListItem(item({ ownership: 'unknown', sources: [], confidence: 'unknown' }));
      assert.equal(mod.ownershipLabel(row.ownership), 'Unknown');
    });

    await check('incomplete, conflict, and identity-review labels', () => {
      assert.equal(mod.reviewLabel('incomplete'), 'Incomplete');
      assert.equal(mod.reviewLabel('conflicting'), 'Conflicting');
      assert.equal(mod.reviewLabel('identity_review_required'), 'Identity Review Required');
      assert.equal(mod.accentTone(item({ review: 'conflicting' })), 'review');
      assert.equal(mod.accentTone(item({ review: 'identity_review_required' })), 'review');
      const conflict = mod.parseListItem(
        item({
          name: 'Conflict Case',
          ownership: 'non_purchaser',
          confidence: 'confirmed',
          review: 'conflicting',
          sources: [],
        }),
      );
      assert.equal(mod.listOwnershipLabel(conflict), 'Ownership unresolved');
      assert.equal(mod.listReviewSummary(conflict).primary, 'Conflicting evidence');
      assert.equal(mod.listReviewSummary(conflict).secondary, null);
      assert.equal(mod.listContactLabel(conflict), 'Nurture paused until resolved');
      assert.equal(mod.listOwnershipLabel(conflict).includes('Non-purchaser'), false);
      assert.equal(mod.listReviewSummary(conflict).primary.includes('Confirmed'), false);
    });

    await check('manual DNC and no mailable email labels', () => {
      assert.equal(mod.contactabilityLabel('suppressed_do_not_contact'), 'Manual DNC');
      assert.equal(mod.contactabilityLabel('no_mailable_email'), 'No mailable email');
      const noMail = mod.parseListItem(item({ hasRealEmail: false, email: null, emailDisplay: 'no_mailable_email' }));
      assert.equal(mod.emailDisplay(noMail), 'No mailable email.');
      assert.equal(mod.accentTone(item({ contactability: 'suppressed_do_not_contact' })), 'dnc');
    });

    await check('honest unknown email-delivery status', () => {
      const row = mod.parseListItem(item({}));
      const summary = mod.communicationListSummary(row.latestCommunication);
      assert.match(summary, /Purchase confirmation · .+ · Delivery unknown/);
      assert.equal(row.latestCommunication.deliveryKnown, false);
      assert.equal(summary.toLowerCase().includes('delivered'), false);
      assert.equal(summary.includes('Confirmation recorded'), false);
      assert.equal(summary.includes('Historical or reconstructed'), false);
    });

    await check('unknown reason codes do not crash', () => {
      const label = mod.humanizeCode('brand_new_reason_code', {});
      assert.equal(label, 'Brand New Reason Code');
      assert.equal(mod.ownershipLabel('future_ownership'), 'Future Ownership');
    });

    await check('filter query contract mapping', () => {
      const qs = mod.buildListQuery(
        {
          q: 'Ada',
          ownership: 'purchaser',
          purchaseSource: 'barnes_noble',
          confidence: 'confirmed',
          review: 'clear',
          contactability: 'contactable',
          status: '',
          includeArchived: false,
        },
        null,
      );
      assert.equal(qs.get('q'), 'Ada');
      assert.equal(qs.get('ownership'), 'purchaser');
      assert.equal(qs.get('purchaseSource'), 'barnes_noble');
      assert.equal(qs.get('confidence'), 'confirmed');
      assert.equal(qs.get('review'), 'clear');
      assert.equal(qs.get('contactability'), 'contactable');
      assert.equal(qs.get('pageSize'), '50');
      assert.equal(qs.get('cursor'), null);
      const archived = mod.buildListQuery({ ...mod.EMPTY_FILTERS, includeArchived: true }, 'opaque-cursor');
      assert.equal(archived.get('includeArchived'), 'true');
      assert.equal(archived.get('cursor'), 'opaque-cursor');
      const all = mod.buildListQuery({ ...mod.EMPTY_FILTERS, status: 'all', includeArchived: true }, null);
      assert.equal(all.get('status'), 'all');
      assert.equal(all.get('includeArchived'), null);
    });

    await check('cursor history next/previous without duplicates and filter reset', () => {
      let hist = mod.initialCursorHistory();
      hist = mod.goNextPage(hist, 'cursor-page-2');
      assert.deepEqual(hist.stack, [null]);
      assert.equal(hist.current, 'cursor-page-2');
      hist = mod.goNextPage(hist, 'cursor-page-3');
      assert.deepEqual(hist.stack, [null, 'cursor-page-2']);
      hist = mod.goPreviousPage(hist);
      assert.equal(hist.current, 'cursor-page-2');
      assert.deepEqual(hist.stack, [null]);
      hist = mod.goPreviousPage(hist);
      assert.equal(hist.current, null);
      assert.deepEqual(hist.stack, []);
      hist = mod.goNextPage(hist, 'cursor-page-2');
      hist = mod.resetCursorHistory();
      assert.deepEqual(hist, mod.initialCursorHistory());
    });

    await check('error classification for 401, 500, and 502', () => {
      assert.equal(mod.classifyHttpError(401, 'unauthorized'), 'unauthorized');
      assert.equal(mod.classifyHttpError(500, 'admin_not_configured'), 'not_configured');
      assert.equal(mod.classifyHttpError(502, 'proxy_unavailable'), 'unavailable');
      assert.equal(mod.classifyHttpError(418, 'nope'), 'generic');
      assert.equal(mod.classifyHttpError(404, 'Not found'), 'not_found');
    });

    await check('empty list parse and partial flag', () => {
      const parsed = mod.parseListResponse({
        ok: true,
        items: [],
        nextCursor: null,
        hasMore: false,
        partial: true,
        totalCount: null,
      });
      assert.equal(parsed.items.length, 0);
      assert.equal(parsed.partial, true);
      assert.equal(parsed.hasMore, false);
    });

    await check('existing Reader Manager files are untouched', () => {
      for (const file of READERS_FILES) {
        const diff = spawnSync('git', ['diff', '--', file], { cwd: REPO_ROOT, encoding: 'utf8' });
        assert.equal((diff.stdout || '').trim(), '', file);
      }
    });

    await check('page uses the 3C list proxy only', () => {
      const client = fs.readFileSync(FILES.client, 'utf8');
      const model = fs.readFileSync(FILES.model, 'utf8');
      assert.match(client, /LIST_PROXY_PATH/);
      assert.equal(mod.LIST_PROXY_PATH, '/api/admin/reader-lifecycle/readers');
      assert.match(model, /\/api\/admin\/reader-lifecycle\/readers/);
      assert.doesNotMatch(client, /\/api\/admin\/readers[^-]/);
    });
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }

  console.log(`\nverify-reader-lifecycle-preview: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
