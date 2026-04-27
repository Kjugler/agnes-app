#!/usr/bin/env node
/**
 * Quiet Reveal broadcast sender (safe by default).
 *
 * Modes:
 * - Default dry run: DRY_RUN=true
 * - Test send only: TEST_EMAIL=kris@example.com SEND=true DRY_RUN=false
 * - Retry same test address after a prior success (bypasses local sent-index only):
 *   FORCE_TEST_SEND=true (requires TEST_EMAIL; ignored for production bulk)
 * - Production bulk send (explicit triple-confirm):
 *   SEND=true DRY_RUN=false CONFIRM_QUIET_REVEAL_SEND=YES
 * - Production safety (any real send, SEND=true && DRY_RUN=false):
 *   - Block if DATABASE_URL is local (file:, dev.db, localhost, :memory:) unless ALLOW_LOCAL_SEND=true
 * - Production bulk only (not TEST_EMAIL):
 *   - Require CONFIRM_QUIET_REVEAL_SEND=YES
 *   - Require RECIPIENT_SOURCE=railway_production OR ALLOW_LOCAL_SEND=true (override)
 * - Optional: RECIPIENT_SOURCE=local_dev|railway_production|unknown (overrides auto-detect)
 * - EXCLUDE_EXAMPLE_EMAILS=true (default): skip *@example.com
 *
 * Env precedence:
 * - On Railway (RAILWAY_ENVIRONMENT | RAILWAY_PROJECT_ID | RAILWAY_SERVICE_ID): do not load .env files;
 *   use process.env only so DATABASE_URL comes from the platform.
 * - Locally: load .env.local then .env (same as deepquill server).
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const IS_RAILWAY = Boolean(
  process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID,
);

const ENV_ROOT = path.join(__dirname, '..');
const ENV_LOCAL_PATH = path.join(ENV_ROOT, '.env.local');
const ENV_DEFAULT_PATH = path.join(ENV_ROOT, '.env');

if (!IS_RAILWAY) {
  if (fs.existsSync(ENV_LOCAL_PATH)) dotenv.config({ path: ENV_LOCAL_PATH, override: false });
  if (fs.existsSync(ENV_DEFAULT_PATH)) dotenv.config({ path: ENV_DEFAULT_PATH, override: false });
}

const { prisma, ensureDatabaseUrl, datasourceUrl } = require('../server/prisma.cjs');
ensureDatabaseUrl();

const mailchimp = require('@mailchimp/mailchimp_transactional');
const { normalizeEmail } = require('../src/lib/normalize.cjs');
const { getMailchimpClient } = require('../lib/email/sendEmail.cjs');

function getResolvedDatasource() {
  return (process.env.DATABASE_URL || String(datasourceUrl || '')).trim();
}

function getMaskedDatabaseUrlType() {
  const db = getResolvedDatasource();
  if (!db) return 'unset';
  const lower = db.toLowerCase();
  if (lower.startsWith('postgres://') || lower.startsWith('postgresql://')) {
    return IS_RAILWAY ? 'postgres (railway)' : 'postgres (remote)';
  }
  if (lower.includes('sqlite') || lower.startsWith('file:') || lower.includes(':memory:')) {
    return 'sqlite (local)';
  }
  return 'unknown';
}

console.log(`[QUIET_REVEAL] ENV SOURCE: ${IS_RAILWAY ? 'railway' : 'local'}`);
console.log(`[QUIET_REVEAL] DATABASE_URL type: ${getMaskedDatabaseUrlType()}`);

const SCRIPT_TAG = 'quiet_reveal_apr30_may1_2026';
const SUBJECT = 'Something is opening — quietly';
const FROM_NAME = 'The Agnes Protocol';

const DEFAULT_DRY_RUN = process.env.DRY_RUN == null ? true : process.env.DRY_RUN === 'true';
const SEND = process.env.SEND === 'true';
const DRY_RUN = DEFAULT_DRY_RUN;
const TEST_EMAIL = normalizeEmail(process.env.TEST_EMAIL || '');
const FORCE_TEST_SEND_RAW = process.env.FORCE_TEST_SEND === 'true';
const FORCE_TEST_SEND = FORCE_TEST_SEND_RAW && Boolean(TEST_EMAIL);
const CONFIRM_SEND = process.env.CONFIRM_QUIET_REVEAL_SEND === 'YES';
const ALLOW_LOCAL_SEND = process.env.ALLOW_LOCAL_SEND === 'true';
const EXCLUDE_EXAMPLE_EMAILS = process.env.EXCLUDE_EXAMPLE_EMAILS !== 'false';

const BATCH_SIZE = Math.max(1, Number(process.env.BATCH_SIZE || 50));
const BATCH_DELAY_MS = Math.max(0, Number(process.env.BATCH_DELAY_MS || 1500));
const PER_EMAIL_DELAY_MS = Math.max(0, Number(process.env.PER_EMAIL_DELAY_MS || 100));

const AUDIT_DIR = path.join(__dirname, 'audit', 'quiet-reveal');
const SENT_INDEX_PATH = path.join(AUDIT_DIR, 'sent-index.json');
const now = new Date();
const ts = now.toISOString().replace(/[:.]/g, '-');
const RUN_JSON_PATH = path.join(AUDIT_DIR, `run-${ts}.json`);
const RUN_JSONL_PATH = path.join(AUDIT_DIR, `run-${ts}.jsonl`);

function getEnvFileStatus() {
  return { envLocalPath: ENV_LOCAL_PATH, envPath: ENV_DEFAULT_PATH, dotenvLoaded: !IS_RAILWAY };
}

/**
 * Heuristic: local / dev sqlite file DB (block real sends unless ALLOW_LOCAL_SEND).
 */
function isLocalLikeDatasource(resolved) {
  if (!resolved || typeof resolved !== 'string') return true;
  const s = resolved.toLowerCase();
  if (s.includes('file:') || s.includes('dev.db')) return true;
  if (s.includes('localhost') || s.includes('127.0.0.1') || s.includes('0.0.0.0')) return true;
  if (s.includes(':memory:')) return true;
  if (/^file:/i.test(resolved.trim()) && (s.includes('sqlite') || s.includes('.db'))) return true;
  return false;
}

const RECIPIENT_SOURCE_VALUES = new Set(['local_dev', 'railway_production', 'unknown']);

/**
 * @returns {{ label: 'local_dev' | 'railway_production' | 'unknown', reason: string }}
 */
function resolveRecipientSource() {
  const override = (process.env.RECIPIENT_SOURCE || '').trim();
  if (RECIPIENT_SOURCE_VALUES.has(override)) {
    return { label: override, reason: 'RECIPIENT_SOURCE env' };
  }
  const db = getResolvedDatasource();
  if (isLocalLikeDatasource(db)) {
    return { label: 'local_dev', reason: 'local sqlite/file or localhost' };
  }
  const hasRailwayHint =
    process.env.RAILWAY_ENVIRONMENT === 'production' ||
    process.env.RAILWAY_PROJECT_ID ||
    /railway|rlwy|\.up\.railway\.app/i.test(db);
  if (hasRailwayHint) {
    return { label: 'railway_production', reason: 'remote DB + Railway / production signals' };
  }
  if (/^postgres(ql)?:\/\//i.test(db)) {
    return { label: 'unknown', reason: 'remote postgres; set RECIPIENT_SOURCE for production bulk' };
  }
  return { label: 'unknown', reason: 'set RECIPIENT_SOURCE explicitly' };
}

function getFromEmail() {
  return process.env.MAILCHIMP_FROM_EMAIL || 'hello@theagnesprotocol.com';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureAuditDir() {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
}

function loadSentIndex() {
  try {
    if (!fs.existsSync(SENT_INDEX_PATH)) return new Set();
    const raw = JSON.parse(fs.readFileSync(SENT_INDEX_PATH, 'utf8'));
    if (!Array.isArray(raw?.sent)) return new Set();
    return new Set(raw.sent.map((e) => normalizeEmail(e)).filter(Boolean));
  } catch (err) {
    console.warn('[QUIET_REVEAL] Failed to read sent-index.json, starting empty', { error: err.message });
    return new Set();
  }
}

function saveSentIndex(set) {
  const payload = {
    updatedAt: new Date().toISOString(),
    scriptTag: SCRIPT_TAG,
    sent: Array.from(set).sort(),
  };
  fs.writeFileSync(SENT_INDEX_PATH, JSON.stringify(payload, null, 2), 'utf8');
}

function appendJsonl(row) {
  fs.appendFileSync(RUN_JSONL_PATH, `${JSON.stringify(row)}\n`, 'utf8');
}

function buildEmailCopy(siteUrl) {
  const manageUrl = siteUrl ? `${siteUrl.replace(/\/+$/, '')}/preferences` : null;
  const footerText = manageUrl
    ? `You are receiving this email because you have interacted with The Agnes Protocol. Manage preferences: ${manageUrl} or reply to this email to opt out.`
    : 'You are receiving this email because you have interacted with The Agnes Protocol. Reply to this email to opt out.';

  const text = [
    'Something is opening — quietly.',
    '',
    'Not everything is being explained yet.',
    '',
    'Over the next few days, a small group will get early access to something that hasn’t been fully revealed.',
    '',
    'No rollout. No announcement. Just… access.',
    '',
    'If you’ve been paying attention, you’ll know where to look.',
    '',
    'April 30 – May 1',
    '',
    'Take your time.',
    '',
    '— Simon McQuade',
    '',
    footerText,
  ].join('\n');

  const html = `
<div style="font-family: Arial, Helvetica, sans-serif; line-height:1.6; color:#111; max-width:640px; margin:0 auto;">
  <p>Something is opening — quietly.</p>
  <p>Not everything is being explained yet.</p>
  <p>Over the next few days, a small group will get early access to something that hasn’t been fully revealed.</p>
  <p>No rollout. No announcement. Just… access.</p>
  <p>If you’ve been paying attention, you’ll know where to look.</p>
  <p>April 30 – May 1</p>
  <p>Take your time.</p>
  <p>— Simon McQuade</p>
  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0;" />
  <p style="font-size:12px;color:#666;">
    ${
      manageUrl
        ? `You are receiving this email because you have interacted with The Agnes Protocol. <a href="${manageUrl}">Manage preferences</a> or reply to this email to opt out.`
        : 'You are receiving this email because you have interacted with The Agnes Protocol. Reply to this email to opt out.'
    }
  </p>
</div>
`.trim();

  return { subject: SUBJECT, text, html };
}

async function fetchSuppressedSet() {
  const apiKey = process.env.MAILCHIMP_TRANSACTIONAL_KEY;
  if (!apiKey) return { set: new Set(), fetched: false, reason: 'missing MAILCHIMP_TRANSACTIONAL_KEY' };

  try {
    const client = mailchimp(apiKey);
    if (!client?.rejects?.list) {
      return { set: new Set(), fetched: false, reason: 'rejects.list unavailable' };
    }
    const rejects = await client.rejects.list({});
    const set = new Set(
      (Array.isArray(rejects) ? rejects : [])
        .map((r) => normalizeEmail(r?.email))
        .filter(Boolean),
    );
    return { set, fetched: true, reason: null };
  } catch (err) {
    return { set: new Set(), fetched: false, reason: err.message || 'rejects list failed' };
  }
}

async function collectCandidates() {
  ensureDatabaseUrl();

  const [users, customers, conversions] = await Promise.all([
    prisma.user.findMany({ select: { email: true } }),
    prisma.customer.findMany({ select: { email: true } }),
    prisma.referralConversion.findMany({ select: { buyerEmail: true } }),
  ]);

  const rows = [];
  for (const u of users) rows.push({ source: 'User.email', email: u.email });
  for (const c of customers) rows.push({ source: 'Customer.email', email: c.email });
  for (const r of conversions) rows.push({ source: 'ReferralConversion.buyerEmail', email: r.buyerEmail });
  return rows;
}

function summarizeSkips(skip) {
  return (
    skip.invalid + skip.duplicate + skip.suppressed + skip.alreadySent + (skip.example || 0)
  );
}

async function main() {
  const envFiles = getEnvFileStatus();
  ensureDatabaseUrl();
  const resolvedDatasource = getResolvedDatasource();
  const recipientSource = resolveRecipientSource();

  ensureAuditDir();
  const fromEmail = getFromEmail();

  const siteUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || '';
  const { subject, text, html } = buildEmailCopy(siteUrl);
  const sentIndex = loadSentIndex();
  const suppressed = await fetchSuppressedSet();
  const candidateRows = await collectCandidates();

  const skip = {
    invalid: 0,
    duplicate: 0,
    suppressed: 0,
    alreadySent: 0,
    example: 0,
    testOnlyFiltered: 0,
  };

  const deduped = new Set();
  const eligible = [];

  for (const row of candidateRows) {
    const normalized = normalizeEmail(row.email);
    if (!normalized) {
      skip.invalid += 1;
      continue;
    }
    if (EXCLUDE_EXAMPLE_EMAILS && normalized.endsWith('@example.com')) {
      skip.example += 1;
      continue;
    }
    if (deduped.has(normalized)) {
      skip.duplicate += 1;
      continue;
    }
    deduped.add(normalized);

    if (suppressed.set.has(normalized)) {
      skip.suppressed += 1;
      continue;
    }
    if (sentIndex.has(normalized)) {
      skip.alreadySent += 1;
      continue;
    }
    eligible.push(normalized);
  }

  let targets = eligible;
  if (TEST_EMAIL) {
    targets = [TEST_EMAIL];
    if (!eligible.includes(TEST_EMAIL)) {
      skip.testOnlyFiltered = eligible.length;
    } else {
      skip.testOnlyFiltered = Math.max(0, eligible.length - 1);
    }
  }

  if (FORCE_TEST_SEND_RAW && !TEST_EMAIL) {
    console.warn('[QUIET_REVEAL] FORCE_TEST_SEND=true ignored (TEST_EMAIL not set)');
  }

  const summary = {
    scriptTag: SCRIPT_TAG,
    timestamp: now.toISOString(),
    mode: {
      DRY_RUN,
      SEND,
      TEST_EMAIL: TEST_EMAIL || null,
      FORCE_TEST_SEND: FORCE_TEST_SEND,
      CONFIRM_QUIET_REVEAL_SEND: CONFIRM_SEND,
      ALLOW_LOCAL_SEND,
      EXCLUDE_EXAMPLE_EMAILS,
    },
    database: {
      envSource: IS_RAILWAY ? 'railway' : 'local',
      dotenvLoaded: envFiles.dotenvLoaded,
      resolvedDatasource: resolvedDatasource || null,
      databaseUrlType: getMaskedDatabaseUrlType(),
      recipientSource: recipientSource.label,
      recipientSourceReason: recipientSource.reason,
    },
    sourceQuery: {
      includedFrom: ['User.email', 'Customer.email', 'ReferralConversion.buyerEmail'],
      notes:
        'Union by normalized email; invalid/duplicate/example.com/suppressed/already-sent excluded.',
    },
    counts: {
      candidateTotal: candidateRows.length,
      uniqueNormalized: deduped.size,
      eligibleTotal: eligible.length,
      targetsAfterMode: targets.length,
      skipped: {
        invalid: skip.invalid,
        duplicate: skip.duplicate,
        example: skip.example,
        suppressed: skip.suppressed,
        alreadySent: skip.alreadySent,
        testOnlyFiltered: skip.testOnlyFiltered,
        totalCoreSkipped: summarizeSkips(skip),
      },
    },
    suppression: {
      fetched: suppressed.fetched,
      reasonIfNotFetched: suppressed.reason,
      suppressedCount: suppressed.set.size,
    },
    config: {
      BATCH_SIZE,
      BATCH_DELAY_MS,
      PER_EMAIL_DELAY_MS,
      fromEmail: fromEmail,
      fromName: FROM_NAME,
      subject,
    },
    files: {
      runJsonPath: RUN_JSON_PATH,
      runJsonlPath: RUN_JSONL_PATH,
      sentIndexPath: SENT_INDEX_PATH,
    },
  };

  fs.writeFileSync(RUN_JSON_PATH, JSON.stringify(summary, null, 2), 'utf8');

  const key = process.env.MAILCHIMP_TRANSACTIONAL_KEY || '';
  const keyFingerprint = key ? `${key.slice(0, 6)}...${key.slice(-4)}` : '(missing)';
  console.log('[QUIET_REVEAL] Mailchimp/client config', {
    envSource: IS_RAILWAY ? 'railway' : 'local',
    dotenvLoaded: envFiles.dotenvLoaded,
    envLocalExists: fs.existsSync(envFiles.envLocalPath),
    envDefaultExists: fs.existsSync(envFiles.envPath),
    mailchimpKeyPresent: Boolean(key),
    mailchimpKeyFingerprint: keyFingerprint,
    fromEmail: fromEmail,
    fromName: FROM_NAME,
    clientInit: 'getMailchimpClient() -> @mailchimp/mailchimp_transactional(apiKey)',
    webhookFlowComparison: 'stripe-webhook uses the same MAILCHIMP_TRANSACTIONAL_KEY + messages.send path',
  });

  console.log('\n[QUIET_REVEAL] Final confirmation summary');
  console.log('----------------------------------------');
  console.log(`resolved DATABASE_URL: ${resolvedDatasource || '(empty)'}`);
  console.log(
    `RECIPIENT_SOURCE: ${recipientSource.label} (${recipientSource.reason})`,
  );
  console.log(`EXCLUDE_EXAMPLE_EMAILS: ${EXCLUDE_EXAMPLE_EMAILS} (skip @example.com)`);
  console.log(`total candidate emails: ${summary.counts.candidateTotal}`);
  console.log(`total eligible emails: ${summary.counts.eligibleTotal}`);
  console.log(
    `total skipped (invalid/duplicate/@example.com/suppressed/already sent): ${summary.counts.skipped.totalCoreSkipped}`,
  );
  if (summary.counts.skipped.example) {
    console.log(`  skipped @example.com: ${summary.counts.skipped.example}`);
  }
  console.log(`TEST_EMAIL: ${summary.mode.TEST_EMAIL || '(none)'}`);
  console.log(`FORCE_TEST_SEND (sent-index bypass for TEST_EMAIL only): ${FORCE_TEST_SEND}`);
  console.log(`send mode active (SEND=true && DRY_RUN=false): ${SEND && !DRY_RUN}`);
  console.log(`CONFIRM_QUIET_REVEAL_SEND=YES: ${CONFIRM_SEND}`);
  console.log(`ALLOW_LOCAL_SEND: ${ALLOW_LOCAL_SEND}`);
  console.log('----------------------------------------\n');

  const realSend = SEND && !DRY_RUN;
  const isLocalDb = isLocalLikeDatasource(resolvedDatasource);
  if (realSend && isLocalDb && !ALLOW_LOCAL_SEND) {
    console.error(
      '[QUIET_REVEAL] Blocked: DATABASE_URL points at a local dev database. Set ALLOW_LOCAL_SEND=true to send from this machine, or run against production DATABASE_URL.',
      { resolvedDatasource, isLocalDb: true },
    );
    process.exit(1);
  }

  const productionBulk = SEND && !DRY_RUN && !TEST_EMAIL;
  if (productionBulk && !CONFIRM_SEND) {
    console.error(
      '[QUIET_REVEAL] Refusing production bulk send. Set CONFIRM_QUIET_REVEAL_SEND=YES after reviewing summary.',
    );
    process.exit(1);
  }

  if (productionBulk && !ALLOW_LOCAL_SEND && recipientSource.label !== 'railway_production') {
    console.error(
      '[QUIET_REVEAL] Refusing production bulk send. RECIPIENT_SOURCE must be railway_production (or set RECIPIENT_SOURCE explicitly), or set ALLOW_LOCAL_SEND=true.',
      { recipientSource: recipientSource.label },
    );
    process.exit(1);
  }

  if (!SEND || DRY_RUN) {
    console.log('[QUIET_REVEAL] DRY RUN ONLY - no emails sent.');
    console.log(`[QUIET_REVEAL] would send to ${targets.length} recipient(s).`);
    return;
  }

  const client = getMailchimpClient();
  if (!client) {
    throw new Error('Mailchimp client not available (MAILCHIMP_TRANSACTIONAL_KEY missing?)');
  }

  if (TEST_EMAIL && suppressed.set.has(TEST_EMAIL)) {
    console.warn('[QUIET_REVEAL] TEST_EMAIL is on Mailchimp rejects list; not sending.', {
      email: TEST_EMAIL,
    });
    appendJsonl({
      at: new Date().toISOString(),
      email: TEST_EMAIL,
      status: 'skipped_suppressed',
      providerMessageId: null,
    });
    console.log('[QUIET_REVEAL] Send complete', {
      sent: 0,
      failed: 0,
      skipped: 1,
      totalTargets: 1,
      auditJson: RUN_JSON_PATH,
      auditJsonl: RUN_JSONL_PATH,
    });
    return;
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let batchIndex = 0;

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    batchIndex += 1;
    console.log(
      `[QUIET_REVEAL] Sending batch ${batchIndex} (${batch.length} recipients, offset ${i})`,
    );

    for (const email of batch) {
      const bypassSentIndexForForceTest = FORCE_TEST_SEND && email === TEST_EMAIL;
      if (bypassSentIndexForForceTest) {
        console.log('[QUIET_REVEAL] FORCE_TEST_SEND: bypassing local sent-index for test recipient', {
          email,
        });
      }
      if (sentIndex.has(email) && !bypassSentIndexForForceTest) {
        skipped += 1;
        appendJsonl({
          at: new Date().toISOString(),
          email,
          status: 'skipped_already_sent',
          providerMessageId: null,
        });
        continue;
      }

      try {
        const result = await client.messages.send({
          message: {
            from_email: fromEmail,
            from_name: FROM_NAME,
            subject,
            to: [{ email, type: 'to' }],
            html,
            text,
            headers: { 'Reply-To': fromEmail },
            metadata: { campaign: SCRIPT_TAG },
          },
        });

        const row = Array.isArray(result) ? result[0] : null;
        const status = row?.status || 'unknown';
        const providerMessageId = row?._id || null;
        const rejectReason = row?.reject_reason || null;
        console.log('[QUIET_REVEAL] Mailchimp messages.send response', {
          email,
          status,
          reject_reason: rejectReason,
          _id: providerMessageId,
        });

        if (status === 'rejected' || status === 'invalid' || status === 'error') {
          failed += 1;
          appendJsonl({
            at: new Date().toISOString(),
            email,
            status: `failed_${status}`,
            rejectReason,
            providerMessageId,
          });
        } else {
          sent += 1;
          sentIndex.add(email);
          appendJsonl({
            at: new Date().toISOString(),
            email,
            status,
            providerMessageId,
          });
        }
      } catch (err) {
        failed += 1;
        appendJsonl({
          at: new Date().toISOString(),
          email,
          status: 'failed_exception',
          error: err.message,
          providerMessageId: null,
        });
      }

      if (PER_EMAIL_DELAY_MS > 0) {
        await sleep(PER_EMAIL_DELAY_MS);
      }
    }

    saveSentIndex(sentIndex);
    if (BATCH_DELAY_MS > 0 && i + BATCH_SIZE < targets.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log('[QUIET_REVEAL] Send complete', {
    sent,
    failed,
    skipped,
    totalTargets: targets.length,
    auditJson: RUN_JSON_PATH,
    auditJsonl: RUN_JSONL_PATH,
  });

  if (TEST_EMAIL && sent > 0) {
    try {
      const resultRows = fs
        .readFileSync(RUN_JSONL_PATH, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      const testRow = resultRows.find((row) => row.email === TEST_EMAIL && row.providerMessageId);
      if (testRow?.providerMessageId && client?.messages?.info) {
        const info = await client.messages.info({ id: testRow.providerMessageId });
        console.log('[QUIET_REVEAL] Mailchimp messages.info for TEST_EMAIL', {
          email: TEST_EMAIL,
          _id: testRow.providerMessageId,
          state: info?.state || null,
          reject_reason: info?.reject_reason || null,
          ts: info?.ts || null,
        });
      }
    } catch (infoErr) {
      console.warn('[QUIET_REVEAL] Unable to fetch messages.info for TEST_EMAIL', {
        error: infoErr.message,
      });
    }
  }
}

main()
  .then(async () => {
    if (prisma && prisma.$disconnect) {
      await prisma.$disconnect();
    }
  })
  .catch(async (err) => {
    console.error('[QUIET_REVEAL] Fatal error', err);
    if (prisma && prisma.$disconnect) {
      await prisma.$disconnect();
    }
    process.exit(1);
  });
