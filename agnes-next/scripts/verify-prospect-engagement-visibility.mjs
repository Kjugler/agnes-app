#!/usr/bin/env node
/**
 * Stage C2 display/read-only checks for Reader Lifecycle engagement visibility.
 * Synthetic and production-shaped fixtures only. Does not write production data.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const AGNES_NEXT_ROOT = path.resolve(SCRIPT_DIR, '..');
const REPO_ROOT = path.resolve(AGNES_NEXT_ROOT, '..');
const PREVIEW_DIR = path.join(AGNES_NEXT_ROOT, 'src', 'app', 'admin', 'reader-lifecycle-preview');
const DETAIL_DIR = path.join(PREVIEW_DIR, '[readerProfileId]');

const FILES = {
  listClient: path.join(PREVIEW_DIR, 'ReaderLifecyclePreviewClient.tsx'),
  listModel: path.join(PREVIEW_DIR, 'readerLifecyclePreviewModel.ts'),
  listCss: path.join(PREVIEW_DIR, 'preview.module.css'),
  detailClient: path.join(DETAIL_DIR, 'ReaderLifecycleDetailClient.tsx'),
  detailModel: path.join(DETAIL_DIR, 'readerLifecycleDetailModel.ts'),
  detailCss: path.join(DETAIL_DIR, 'detail.module.css'),
  readCjs: path.join(REPO_ROOT, 'deepquill', 'lib', 'readers', 'readerLifecycleRead.cjs'),
  classifyCjs: path.join(REPO_ROOT, 'deepquill', 'lib', 'readers', 'classifyProspectEngagement.cjs'),
};

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

function scan(file) {
  return fs.readFileSync(file, 'utf8');
}

function engagement(partial) {
  return {
    engagement: null,
    retailerReturn: false,
    retailerOrigin: null,
    sampleEngaged: false,
    chaptersSampled: [],
    latestEngagementAt: null,
    reasons: [],
    analyticsOnly: true,
    identityAnchor: null,
    ...partial,
  };
}

function row(partial) {
  return {
    readerProfileId: partial.readerProfileId || 'rp_x',
    userId: partial.userId || 'user_x',
    name: partial.name || 'Reader',
    email: partial.email || null,
    emailDisplay: partial.email || null,
    hasRealEmail: Boolean(partial.email),
    legacy: partial.legacy || { source: null, readerType: null, status: 'active' },
    ownership: partial.ownership || 'non_purchaser',
    sources: partial.sources || [],
    confidence: partial.confidence || 'unknown',
    contactability: partial.contactability || 'contactable',
    review: partial.review || 'clear',
    nurtureSuppressed: partial.nurtureSuppressed === true,
    reasons: partial.reasons || [],
    prospectEngagement: engagement(partial.prospectEngagement || {}),
    primaryQueue: partial.primaryQueue || 'prospects',
    purchaseMode: partial.purchaseMode || 'none',
    recommendedAction: partial.recommendedAction || 'Leave as prospect.',
    evidenceSummary: partial.evidenceSummary || 'No purchase or evidence',
    identityWarning: false,
    identityClusterPeers: [],
    latestCommunication: null,
    createdAt: partial.createdAt || '2026-09-16T16:00:00.000Z',
    leadCaptureSnapshot: partial.leadCaptureSnapshot || null,
    legacyProspectNurture: partial.legacyProspectNurture || null,
  };
}

const PRODUCTION_SHAPED = [
  row({
    name: 'Stage A sample',
    email: 'a11d6ab-deploy-verify@example.com',
    ownership: 'non_purchaser',
    primaryQueue: 'test_synthetic',
    prospectEngagement: engagement({
      engagement: 'sample_engaged',
      retailerReturn: false,
      retailerOrigin: 'amazon',
      sampleEngaged: true,
      chaptersSampled: ['1'],
      latestEngagementAt: '2026-09-16T16:40:00.000Z',
      reasons: ['email_captured', 'chapter_opened', 'dwell_90s'],
      identityAnchor: 'readers_agree_lead_attribution',
    }),
    leadCaptureSnapshot: {
      capturedAt: '2026-09-16T16:00:00.000Z',
      captureSurface: 'landing',
      retailerOrigin: 'amazon',
    },
  }),
  row({
    name: 'Known B2 Amazon',
    email: 'amazon-b2-identity-0916@example.com',
    ownership: 'non_purchaser',
    primaryQueue: 'test_synthetic',
    prospectEngagement: engagement({
      engagement: 'retailer_return_engaged',
      retailerReturn: true,
      retailerOrigin: 'amazon',
      sampleEngaged: true,
      chaptersSampled: ['1'],
      latestEngagementAt: '2026-09-16T16:40:00.000Z',
      reasons: ['email_captured', 'retailer_return', 'dwell_90s', 'jody_90s'],
      identityAnchor: 'readers_agree_lead_attribution',
    }),
  }),
  row({
    name: 'Pre-cutoff RETURN',
    email: 'stage-b2-verify-0916@example.com',
    ownership: 'non_purchaser',
    primaryQueue: 'test_synthetic',
    prospectEngagement: engagement({
      engagement: 'sample_engaged',
      retailerReturn: false,
      retailerOrigin: 'amazon',
      sampleEngaged: true,
      chaptersSampled: ['1'],
      latestEngagementAt: '2026-09-16T16:20:00.000Z',
      reasons: ['email_captured', 'dwell_90s'],
      identityAnchor: 'readers_agree_lead_attribution',
    }),
  }),
  row({
    name: 'Unrelated purchaser',
    email: 'dparkinson03@hotmail.com',
    ownership: 'purchaser',
    primaryQueue: 'clear_no_action',
    nurtureSuppressed: true,
    prospectEngagement: engagement({}),
  }),
  row({
    name: 'Gift CRM row',
    email: 'wallacebartw@gmail.com',
    ownership: 'unknown',
    primaryQueue: 'needs_review',
    nurtureSuppressed: true,
    prospectEngagement: engagement({}),
  }),
  row({
    name: 'Historical nurture 1',
    email: 'historical-nurture-1@example.test',
    ownership: 'non_purchaser',
    primaryQueue: 'prospects',
    prospectEngagement: engagement({}),
    legacyProspectNurture: {
      enrolledAt: '2026-03-20T00:00:00.000Z',
      step: 1,
      lastSentAt: '2026-03-21T00:00:00.000Z',
      suppressedAt: null,
      suppressedReason: null,
    },
  }),
  row({
    name: 'Historical nurture 2',
    email: 'historical-nurture-2@example.test',
    ownership: 'non_purchaser',
    primaryQueue: 'prospects',
    prospectEngagement: engagement({}),
    legacyProspectNurture: {
      enrolledAt: '2026-03-20T00:00:00.000Z',
      step: 1,
      lastSentAt: '2026-03-21T00:00:00.000Z',
      suppressedAt: null,
      suppressedReason: null,
    },
  }),
  row({
    name: 'Historical nurture 3',
    email: 'historical-nurture-3@example.test',
    ownership: 'non_purchaser',
    primaryQueue: 'prospects',
    prospectEngagement: engagement({}),
    legacyProspectNurture: {
      enrolledAt: '2026-03-20T00:00:00.000Z',
      step: 1,
      lastSentAt: '2026-03-21T00:00:00.000Z',
      suppressedAt: null,
      suppressedReason: null,
    },
  }),
  row({
    name: 'Historical nurture 4',
    email: 'historical-nurture-4@example.test',
    ownership: 'non_purchaser',
    primaryQueue: 'prospects',
    prospectEngagement: engagement({}),
    legacyProspectNurture: {
      enrolledAt: '2026-03-20T00:00:00.000Z',
      step: 2,
      lastSentAt: '2026-03-21T00:00:00.000Z',
      suppressedAt: null,
      suppressedReason: null,
    },
  }),
];

async function loadModels() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-c2-visibility-'));
  const listOut = path.join(outDir, 'readerLifecyclePreviewModel.mjs');
  const detailOut = path.join(outDir, 'readerLifecycleDetailModel.mjs');
  fs.writeFileSync(listOut, transpile(FILES.listModel));
  let detailText = transpile(FILES.detailModel);
  detailText = detailText.replace("from '../readerLifecyclePreviewModel'", "from './readerLifecyclePreviewModel.mjs'");
  fs.writeFileSync(detailOut, detailText);
  const list = await import(pathToFileURL(listOut).href);
  const detail = await import(pathToFileURL(detailOut).href);
  return { outDir, list, detail };
}

function printProductionShapedTable(list) {
  console.log('\nC2 production-shaped render table (local fixtures from C1 verified shapes):\n');
  console.log(
    [
      'email',
      'ownership',
      'queue',
      'engagement',
      'listBadge',
      'retailerReturn',
      'origin',
      'sampleEngaged',
      'chapters',
      'outreach',
      'legacyWarning',
    ].join(' | '),
  );
  for (const reader of PRODUCTION_SHAPED) {
    const pe = reader.prospectEngagement;
    console.log(
      [
        reader.email,
        list.ownershipLabel(reader.ownership),
        list.queueLabel(reader.primaryQueue),
        list.hasDisplayableProspectEngagement(pe) ? list.engagementStateLabel(pe.engagement) : '—',
        list.showProspectEngagementListBadge(reader)
          ? list.engagementListBadgeLabel(pe.engagement)
          : 'none',
        pe.retailerReturn ? 'Yes' : 'No',
        list.retailerOriginLabel(pe.retailerOrigin),
        pe.sampleEngaged ? 'Yes' : 'No',
        list.chaptersSampledLabel(pe.chaptersSampled),
        list.promotionalOutreachSituationLabel(reader),
        list.hasLegacyProspectNurture(reader.legacyProspectNurture) ? 'inactive warning' : '—',
      ].join(' | '),
    );
  }
  console.log('');
}

async function main() {
  const { outDir, list } = await loadModels();
  try {
    await check('C2 files exist and remain GET-only', () => {
      for (const file of Object.values(FILES)) assert.equal(fs.existsSync(file), true, file);
      for (const file of [FILES.listClient, FILES.detailClient, FILES.listModel, FILES.detailModel]) {
        const src = scan(file);
        assert.doesNotMatch(src, /method:\s*['"]POST['"]/);
        assert.doesNotMatch(src, /method:\s*['"]PATCH['"]/);
        assert.doesNotMatch(src, /method:\s*['"]PUT['"]/);
        assert.doesNotMatch(src, /method:\s*['"]DELETE['"]/);
        assert.doesNotMatch(src, /mailchimp|nodemailer|trySendProspectNurture|send-prospect-nurture/i);
        assert.doesNotMatch(src, /Enable nurture|Send nurture|Enroll/);
      }
      assert.match(scan(FILES.listClient), /method: 'GET'/);
      assert.match(scan(FILES.detailClient), /method: 'GET'/);
    });

    await check('read path still does not assign prospectNurture enrollment', () => {
      const readSrc = scan(FILES.readCjs);
      assert.match(readSrc, /serializeLeadCaptureSnapshot/);
      assert.match(readSrc, /serializeLegacyProspectNurture/);
      assert.doesNotMatch(readSrc, /prospectNurtureEnrolledAt\s*:/);
      assert.doesNotMatch(readSrc, /prisma\.readerProfile\.(create|update|upsert|delete)/);
      assert.match(scan(FILES.classifyCjs), /B2_TRUE_RESUME_VERIFIED_AT/);
    });

    await check('list badges never appear for owners or empty engagement', () => {
      const prospect = row({
        ownership: 'non_purchaser',
        primaryQueue: 'prospects',
        prospectEngagement: engagement({ engagement: 'retailer_return_engaged', retailerReturn: true }),
      });
      const purchaser = row({
        ownership: 'purchaser',
        primaryQueue: 'clear_no_action',
        nurtureSuppressed: true,
        prospectEngagement: engagement({ engagement: 'sample_engaged', sampleEngaged: true }),
      });
      const gifted = row({
        ownership: 'book_owner_gifted',
        primaryQueue: 'clear_no_action',
        prospectEngagement: engagement({ engagement: 'identified' }),
      });
      const emptyProspect = row({
        ownership: 'non_purchaser',
        primaryQueue: 'prospects',
        prospectEngagement: engagement({}),
      });
      assert.equal(list.showProspectEngagementListBadge(prospect), true);
      assert.equal(list.engagementListBadgeLabel('retailer_return_engaged'), 'Retailer Return');
      assert.equal(list.showProspectEngagementListBadge(purchaser), false);
      assert.equal(list.showProspectEngagementListBadge(gifted), false);
      assert.equal(list.showProspectEngagementListBadge(emptyProspect), false);
    });

    await check('detail labels stay qualitative and omit tracking internals', () => {
      assert.equal(list.engagementStateLabel('identified'), 'Identified');
      assert.equal(list.engagementStateLabel('sample_engaged'), 'Sample Engaged');
      assert.equal(list.engagementStateLabel('retailer_return_engaged'), 'Retailer Return Engaged');
      assert.equal(list.retailerOriginLabel('amazon'), 'Amazon');
      assert.equal(list.retailerOriginLabel('bn'), 'Barnes & Noble');
      assert.equal(list.retailerOriginLabel(null), '—');
      assert.deepEqual(list.engagementReasonChips(['email_captured', 'dwell_90s', 'dwell_90s_sum', 'jody_90s']), [
        'Readers Agree email captured',
        'Meaningful sample engagement',
      ]);
      assert.equal(list.identityAnchorLabel('readers_agree_lead_attribution'), 'Readers Agree lead');
      const snapshot = list.parseLeadCaptureSnapshot({
        capturedAt: '2026-09-16T16:00:00.000Z',
        captureSurface: 'bridge',
        retailerOrigin: 'bn',
        visitorId: 'secret-visitor',
        ap_funnel_uid: 'secret-uid',
      });
      assert.equal(snapshot.captureSurface, 'bridge');
      assert.equal(JSON.stringify(snapshot).includes('visitorId'), false);
      assert.equal(JSON.stringify(snapshot).includes('secret'), false);
      assert.equal(list.AUTOMATED_PROSPECT_NURTURE_STATUS, 'Not armed');
      assert.equal(list.HISTORICAL_NURTURE_WARNING_TITLE, 'Historical nurture enrollment — inactive');
      assert.equal(list.LEAD_CAPTURE_SNAPSHOT_LABEL, 'Latest Readers Agree capture snapshot');
    });

    await check('production-shaped C1 rows render the expected C2 labels', () => {
      const byEmail = Object.fromEntries(PRODUCTION_SHAPED.map((r) => [r.email, r]));
      const stageA = byEmail['a11d6ab-deploy-verify@example.com'];
      const b2 = byEmail['amazon-b2-identity-0916@example.com'];
      const pre = byEmail['stage-b2-verify-0916@example.com'];
      const purchaser = byEmail['dparkinson03@hotmail.com'];
      const gift = byEmail['wallacebartw@gmail.com'];
      const hist = PRODUCTION_SHAPED.filter((r) => r.legacyProspectNurture);
      assert.equal(list.engagementStateLabel(stageA.prospectEngagement.engagement), 'Sample Engaged');
      assert.equal(list.showProspectEngagementListBadge(stageA), false);
      assert.equal(list.engagementStateLabel(b2.prospectEngagement.engagement), 'Retailer Return Engaged');
      assert.equal(b2.prospectEngagement.retailerReturn, true);
      assert.equal(list.engagementStateLabel(pre.prospectEngagement.engagement), 'Sample Engaged');
      assert.equal(pre.prospectEngagement.retailerReturn, false);
      assert.equal(list.showProspectEngagementListBadge(purchaser), false);
      assert.equal(list.hasDisplayableProspectEngagement(purchaser.prospectEngagement), false);
      assert.equal(list.showProspectEngagementListBadge(gift), false);
      assert.equal(hist.length, 4);
      for (const histRow of hist) {
        assert.equal(list.hasLegacyProspectNurture(histRow.legacyProspectNurture), true);
        assert.equal(list.showProspectEngagementListBadge(histRow), false);
        assert.equal(list.hasDisplayableProspectEngagement(histRow.prospectEngagement), false);
      }
      printProductionShapedTable(list);
    });
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }

  console.log(`\nverify-prospect-engagement-visibility: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`${err && err.stack ? err.stack : err}\n`);
  process.exit(1);
});
