#!/usr/bin/env node
/**
 * Local checks for the read-only Reader Lifecycle detail preview.
 * Synthetic fixtures only. Does not call production or touch databases.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getDetailPayload, getListPayload } from './reader-lifecycle-preview-mock.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const AGNES_NEXT_ROOT = path.resolve(SCRIPT_DIR, '..');
const REPO_ROOT = path.resolve(AGNES_NEXT_ROOT, '..');
const PREVIEW_DIR = path.join(AGNES_NEXT_ROOT, 'src', 'app', 'admin', 'reader-lifecycle-preview');
const DETAIL_DIR = path.join(PREVIEW_DIR, '[readerProfileId]');

const FILES = {
  listPage: path.join(PREVIEW_DIR, 'page.tsx'),
  listClient: path.join(PREVIEW_DIR, 'ReaderLifecyclePreviewClient.tsx'),
  listModel: path.join(PREVIEW_DIR, 'readerLifecyclePreviewModel.ts'),
  detailPage: path.join(DETAIL_DIR, 'page.tsx'),
  detailClient: path.join(DETAIL_DIR, 'ReaderLifecycleDetailClient.tsx'),
  detailModel: path.join(DETAIL_DIR, 'readerLifecycleDetailModel.ts'),
  detailCss: path.join(DETAIL_DIR, 'detail.module.css'),
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

function transpile(file) {
  const require = createRequire(path.join(AGNES_NEXT_ROOT, 'package.json'));
  const ts = require('typescript');
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
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-checkpoint4b-'));
  const listOut = path.join(outDir, 'readerLifecyclePreviewModel.mjs');
  const detailOut = path.join(outDir, 'readerLifecycleDetailModel.mjs');
  fs.writeFileSync(listOut, transpile(FILES.listModel));
  let detailText = transpile(FILES.detailModel);
  detailText = detailText.replace("from '../readerLifecyclePreviewModel'", "from './readerLifecyclePreviewModel.mjs'");
  fs.writeFileSync(detailOut, detailText);
  const detail = await import(pathToFileURL(detailOut).href);
  const list = await import(pathToFileURL(listOut).href);
  return { outDir, detail, list };
}

function scanSource(file) {
  return fs.readFileSync(file, 'utf8');
}

async function main() {
  const { outDir, detail, list } = await loadModels();
  try {
    await check('detail files exist', () => {
      for (const file of Object.values(FILES)) assert.equal(fs.existsSync(file), true, file);
    });

    await check('list has View details links using encoded preview path', () => {
      const client = scanSource(FILES.listClient);
      assert.match(client, /View details/);
      assert.match(client, /detailPreviewPath/);
    });

    await check('no mutation methods, email, or backfill imports', () => {
      for (const file of Object.values(FILES)) {
        if (file.endsWith('.css')) continue;
        const src = scanSource(file);
        assert.doesNotMatch(src, /method:\s*['"]POST['"]/);
        assert.doesNotMatch(src, /method:\s*['"]PATCH['"]/);
        assert.doesNotMatch(src, /method:\s*['"]PUT['"]/);
        assert.doesNotMatch(src, /method:\s*['"]DELETE['"]/);
        assert.doesNotMatch(src, /mailchimp|nodemailer|backfill|send-reader-recommendation/i);
      }
      assert.match(scanSource(FILES.detailClient), /method: 'GET'/);
      assert.doesNotMatch(scanSource(FILES.detailClient), />Merge</);
      assert.doesNotMatch(scanSource(FILES.detailClient), /Save|Approve batch|Send email|Backfill/i);
      assert.doesNotMatch(scanSource(FILES.detailPage), /console\.(log|debug|info)/);
      assert.doesNotMatch(scanSource(FILES.detailClient), /console\.(log|debug|info)/);
    });

    await check('existing Reader Manager files are untouched', () => {
      for (const file of READERS_FILES) {
        const diff = spawnSync('git', ['diff', '--', file], { cwd: REPO_ROOT, encoding: 'utf8' });
        assert.equal((diff.stdout || '').trim(), '', file);
      }
    });

    const web = detail.parseDetailResponse(getDetailPayload('rp_web').body);
    await check('confirmed website purchaser with live and archived-beta purchases', () => {
      assert.equal(detail.listOwnershipLabel(web), 'Purchaser');
      assert.equal(web.purchases.length, 2);
      assert.equal(detail.isArchivedBetaPurchase(web.purchases[1]), true);
      assert.match(detail.saleStatusLabel('archived_beta'), /Archived beta/);
      assert.equal(web.purchases[0].accountingTruth, true);
      assert.ok(!('sessionId' in web.purchases[0]));
    });

    await check('display translations keep stored codes and use plain labels', () => {
      assert.equal(web.purchases[0].fulfillmentStatus, 'label_printed');
      assert.equal(detail.fulfillmentStatusLabel(web.purchases[0].fulfillmentStatus), 'Label printed');
      assert.equal(web.communications[0].templateOrAskId, 'purchase_confirmation_v1');
      assert.equal(
        detail.templateOrAskLabel(web.communications[0].templateOrAskId),
        'Purchase confirmation—Version 1',
      );
      assert.equal(web.evidenceHistory[0].reason, 'live_website_purchase');
      assert.equal(web.evidenceHistory[0].origin, 'mock');
      assert.equal(
        detail.evidenceReasonOriginLabel(web.evidenceHistory[0]),
        'Website purchase record · Synthetic preview',
      );
      const amazon = detail.parseDetailResponse(getDetailPayload('rp_amz').body);
      assert.equal(amazon.evidenceHistory[0].reason, 'provisional_manual_retailer');
      assert.equal(
        detail.evidenceReasonOriginLabel(amazon.evidenceHistory[0]),
        'Manual retailer record · Synthetic preview',
      );
      assert.equal(detail.templateOrAskLabel('ask_2'), 'Ask #2');
      const client = scanSource(FILES.detailClient);
      assert.match(client, /fulfillmentStatusLabel/);
      assert.match(client, /templateOrAskLabel/);
      assert.match(client, /evidenceReasonOriginLabel/);
      assert.doesNotMatch(client, /row\.fulfillmentStatus \|\|/);
      assert.doesNotMatch(client, /row\.templateOrAskId \|\|/);
    });

    await check('provisional Amazon and Barnes & Noble purchasers', () => {
      const amazon = detail.parseDetailResponse(getDetailPayload('rp_amz').body);
      const bn = detail.parseDetailResponse(getDetailPayload('rp_bn').body);
      assert.equal(amazon.sources[0], 'amazon');
      assert.equal(amazon.evidenceHistory[0].status, 'provisional');
      assert.equal(bn.sources[0], 'barnes_noble');
      assert.equal(detail.evidenceKindLabel(bn.evidenceHistory[0].kind), 'Personal-knowledge evidence');
    });

    await check('multiple-source, gifted, non-purchaser, and empty histories', () => {
      const multi = detail.parseDetailResponse(getDetailPayload('rp_multi').body);
      const gift = detail.parseDetailResponse(getDetailPayload('rp_gift').body);
      const non = detail.parseDetailResponse(getDetailPayload('rp_non').body);
      assert.equal(detail.sourcesLabel(multi.sources), 'Website + Barnes & Noble');
      assert.equal(detail.listOwnershipLabel(gift), 'Book Owner—Gifted');
      assert.equal(non.purchases.length, 0);
      assert.equal(non.evidenceHistory.length, 0);
      assert.equal(non.communications.length, 0);
      assert.equal(non.contactDecisions.length, 0);
      assert.equal(non.identityReviews.length, 0);
    });

    await check('conflict row presentation and outreach pause', () => {
      const conflict = detail.parseDetailResponse(getDetailPayload('rp_conf').body);
      assert.equal(detail.listOwnershipLabel(conflict), 'Ownership unresolved');
      assert.equal(detail.listReviewSummary(conflict).primary, 'Conflicting evidence');
      assert.equal(detail.listContactLabel(conflict), 'Nurture paused until resolved');
      assert.equal(detail.isOutreachPaused(conflict), true);
      assert.equal(conflict.evidenceHistory[0].status, 'disputed');
    });

    await check('identity review required with no merge control', () => {
      const row = detail.parseDetailResponse(getDetailPayload('rp_idrev').body);
      assert.equal(detail.isOutreachPaused(row), true);
      assert.equal(detail.identityStatusLabel(row.identityReviews[0].status), 'Open');
      assert.equal(detail.identityReasonLabel('duplicate_name'), 'Possible duplicate name');
      assert.equal(detail.safeRelatedUserId('user_other_synthetic'), 'user_other_synthetic');
      assert.equal(detail.IDENTITY_NO_MERGE.includes('automatic merge'), true);
    });

    await check('manual DNC suppress then allow history', () => {
      const row = detail.parseDetailResponse(getDetailPayload('rp_dnc').body);
      assert.equal(row.contactDecisions[0].decision, 'suppress');
      assert.equal(row.contactDecisions[1].decision, 'allow');
      assert.equal(detail.decisionLabel('suppress'), 'Suppress / Do Not Contact');
      assert.equal(detail.decisionLabel('allow'), 'Allow / contact permitted');
    });

    await check('no mailable email and honest communication wording', () => {
      const noMail = detail.parseDetailResponse(getDetailPayload('rp_nomail').body);
      assert.equal(detail.emailDisplay(noMail), 'No mailable email.');
      const mix = detail.parseDetailResponse(getDetailPayload('rp_comms').body);
      const outcomes = mix.communications.map((row) => detail.communicationHistoryOutcome(row));
      assert.deepEqual(outcomes, [
        'Accepted',
        'Rejected',
        'Failed',
        'Recorded as sent—delivery unknown',
      ]);
      assert.equal(outcomes.some((label) => label === 'Delivered'), false);
    });

    await check('current, disputed, superseded, and aggregate evidence grouping', () => {
      const row = detail.parseDetailResponse(getDetailPayload('rp_hist').body);
      const grouped = detail.groupEvidence(row.evidenceHistory);
      assert.equal(grouped.currentConfirmed.length, 2);
      assert.equal(grouped.currentProvisional.length, 1);
      assert.equal(grouped.disputed.length, 1);
      assert.equal(grouped.superseded.length, 1);
      assert.equal(grouped.historical.length, 2);
      assert.equal(grouped.disputed[0].id, 'e_hist_disp');
      assert.equal(grouped.superseded[0].id, 'e_hist_sup');
      assert.equal(detail.supersededFoldLabel(1), 'Earlier superseded evidence (1)');
      assert.equal(detail.supersededFoldLabel(2), 'Earlier superseded evidence (2)');
      assert.equal(
        grouped.currentConfirmed.some((item) => detail.isAggregateEvidence(item)),
        true,
      );
      assert.equal(detail.AGGREGATE_NOT_PROOF.includes('not proof'), true);
      const client = scanSource(FILES.detailClient);
      assert.match(client, /Disputed or conflicting evidence/);
      assert.match(client, /<details className=\{styles.supersededFold\}>/);
      assert.match(client, /<summary>\{supersededFoldLabel/);
      assert.doesNotMatch(client, /Earlier, disputed, or superseded/);
    });

    await check('missing reader 404 and backend unavailable 502', () => {
      assert.equal(getDetailPayload('rp_missing').status, 404);
      assert.equal(getDetailPayload('rp_down').status, 502);
      assert.equal(list.classifyHttpError(404, 'Not found'), 'not_found');
      assert.equal(list.classifyHttpError(502, 'proxy_unavailable'), 'unavailable');
    });

    await check('list mock still returns synthetic readers', () => {
      const payload = getListPayload(new URL('http://127.0.0.1/api/admin/reader-lifecycle/readers?pageSize=50'));
      assert.equal(payload.items.length, 12);
      assert.equal(payload.items[0].name, 'Website Confirmed');
      assert.equal(payload.totalCount, 12);
      assert.equal(payload.pageSize, 100);
    });

    await check('detail workbench labels historical CRM notes and session mode', () => {
      assert.equal(detail.HISTORICAL_CRM_NOTES_LABEL, 'Historical CRM notes');
      assert.equal(detail.purchaseSessionModeLabel('test'), 'TEST');
      assert.equal(detail.purchaseSessionModeLabel('live'), 'LIVE');
      const client = scanSource(FILES.detailClient);
      assert.match(client, /HISTORICAL_CRM_NOTES_LABEL/);
      assert.match(client, /IdentityClusterSection/);
      assert.match(client, /purchaseSessionModeLabel/);
      assert.doesNotMatch(client, />CRM notes</);
    });

    await check('detail proxy path encodes the id', () => {
      assert.equal(list.detailProxyPath('rp_web'), '/api/admin/reader-lifecycle/readers/rp_web');
      assert.equal(
        list.detailPreviewPath('rp_web/../x'),
        '/admin/reader-lifecycle-preview/rp_web%2F..%2Fx',
      );
    });
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }

  console.log(`\nverify-reader-lifecycle-detail: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`${err && err.stack ? err.stack : err}\n`);
  process.exit(1);
});
