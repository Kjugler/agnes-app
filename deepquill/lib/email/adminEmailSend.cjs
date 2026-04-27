const fs = require('fs');
const path = require('path');
const mailchimp = require('@mailchimp/mailchimp_transactional');
const { ensureDatabaseUrl } = require('../../server/prisma.cjs');
const { normalizeEmail } = require('../../src/lib/normalize.cjs');
const { getMailchimpClient } = require('./sendEmail.cjs');
const { getTemplateContent } = require('./adminEmailTemplates.cjs');

const BATCH_SIZE = Math.max(1, Number(process.env.ADMIN_EMAIL_BATCH_SIZE || 50));
const BATCH_DELAY_MS = Math.max(0, Number(process.env.ADMIN_EMAIL_BATCH_DELAY_MS || 1500));
const PER_EMAIL_DELAY_MS = Math.max(0, Number(process.env.ADMIN_EMAIL_PER_EMAIL_MS || 100));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getFromEmail() {
  return process.env.MAILCHIMP_FROM_EMAIL || 'hello@theagnesprotocol.com';
}

function isLocalLikeDatasource(resolved) {
  if (!resolved || typeof resolved !== 'string') return true;
  const s = resolved.toLowerCase();
  if (s.includes('file:') || s.includes('dev.db')) return true;
  if (s.includes('localhost') || s.includes('127.0.0.1') || s.includes('0.0.0.0')) return true;
  if (s.includes(':memory:')) return true;
  if (/^file:/i.test(resolved.trim()) && (s.includes('sqlite') || s.includes('.db'))) return true;
  return false;
}

function ensureDirForTemplate(template) {
  const dir = path.join(__dirname, '../..', 'scripts', 'audit', 'admin-email');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${template}-sent.json`);
}

function loadSentIndex(template) {
  const p = ensureDirForTemplate(template);
  try {
    if (!fs.existsSync(p)) return new Set();
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!Array.isArray(raw?.sent)) return new Set();
    return new Set(raw.sent.map((e) => normalizeEmail(e)).filter(Boolean));
  } catch (err) {
    console.warn('[adminEmail] sent index read failed', { template, error: err.message });
    return new Set();
  }
}

function saveSentIndex(template, set) {
  const p = ensureDirForTemplate(template);
  const payload = {
    template,
    updatedAt: new Date().toISOString(),
    sent: Array.from(set).sort(),
  };
  fs.writeFileSync(p, JSON.stringify(payload, null, 2), 'utf8');
}

async function fetchSuppressedSet() {
  const apiKey = process.env.MAILCHIMP_TRANSACTIONAL_KEY;
  if (!apiKey) {
    return { set: new Set(), fetched: false, reason: 'missing MAILCHIMP_TRANSACTIONAL_KEY' };
  }
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

function emptySkip() {
  return { invalid: 0, duplicate: 0, example: 0, suppressed: 0, alreadySent: 0 };
}

/**
 * Build eligible list from DB union + filter rules.
 */
function buildEligiblePipeline(candidateRows, { excludeExample, suppressedSet, sentIndex }) {
  const skip = emptySkip();
  const deduped = new Set();
  const eligible = [];

  for (const row of candidateRows) {
    const normalized = normalizeEmail(row.email);
    if (!normalized) {
      skip.invalid += 1;
      continue;
    }
    if (excludeExample && normalized.endsWith('@example.com')) {
      skip.example += 1;
      continue;
    }
    if (deduped.has(normalized)) {
      skip.duplicate += 1;
      continue;
    }
    deduped.add(normalized);
    if (suppressedSet.has(normalized)) {
      skip.suppressed += 1;
      continue;
    }
    if (sentIndex.has(normalized)) {
      skip.alreadySent += 1;
      continue;
    }
    eligible.push(normalized);
  }
  return { totalCandidates: candidateRows.length, uniqueNormalized: deduped.size, eligible, skip };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function collectCandidateRows(prisma) {
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

/**
 * @returns {Promise<object>}
 */
const VALID_MODES = new Set(['dry-run', 'test', 'selected', 'all']);

async function runAdminEmailSend(prisma, body) {
  const mode = body?.mode != null ? String(body.mode) : 'dry-run';
  const template = String(body?.template || '').trim();
  const confirm = body?.confirm === true;
  const testEmail = normalizeEmail(body?.testEmail || '');
  const emailsIn = Array.isArray(body?.emails) ? body.emails : [];
  const excludeExample = body?.excludeExampleEmails !== false;

  const emptyResponse = (extra = {}) => ({
    mode,
    template: template || null,
    totalCandidates: 0,
    eligible: 0,
    skipped: emptySkip(),
    sent: 0,
    failed: 0,
    resultsSummary: 'No op',
    error: null,
    ...extra,
  });

  if (!VALID_MODES.has(mode)) {
    return { ...emptyResponse(), ok: false, error: `Invalid mode. Use one of: ${[...VALID_MODES].join(', ')}` };
  }
  if (!template) {
    return { ...emptyResponse(), error: 'template is required', ok: false };
  }
  if (!getTemplateContent(template, { siteUrl: process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || '' })) {
    return { ...emptyResponse(), error: `Unknown template: ${template}`, ok: false };
  }

  ensureDatabaseUrl();
  const resolvedDb = (process.env.DATABASE_URL || '').trim();
  const siteUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || '';

  const content = getTemplateContent(template, { siteUrl });
  const { subject, html, text } = content;
  const fromEmail = getFromEmail();
  const fromName = 'The Agnes Protocol';

  const willSend = mode === 'test' || mode === 'selected' || mode === 'all';
  if (willSend && isLocalLikeDatasource(resolvedDb) && process.env.ALLOW_LOCAL_SEND !== 'true') {
    return {
      ...emptyResponse(),
      ok: false,
      error:
        'Refusing send: DATABASE_URL looks like local dev. Set ALLOW_LOCAL_SEND=true to override, or run on production.',
    };
  }

  const client = willSend ? getMailchimpClient() : null;
  if (willSend && !client) {
    return { ...emptyResponse(), ok: false, error: 'Mailchimp not configured (MAILCHIMP_TRANSACTIONAL_KEY missing)' };
  }

  if (mode === 'selected' && !confirm) {
    return { ...emptyResponse(), ok: false, error: 'confirm: true is required for mode=selected' };
  }
  if (mode === 'all' && !confirm) {
    return { ...emptyResponse(), ok: false, error: 'confirm: true is required for mode=all' };
  }
  if (mode === 'test' && !testEmail) {
    return { ...emptyResponse(), ok: false, error: 'testEmail is required for mode=test' };
  }
  if (mode === 'selected' && emailsIn.length === 0) {
    return { ...emptyResponse(), ok: false, error: 'emails: non-empty array is required for mode=selected' };
  }

  const candidateRows = await collectCandidateRows(prisma);
  const suppressed = await fetchSuppressedSet();
  const sentIndex = loadSentIndex(template);

  const { totalCandidates, eligible: baseEligible, skip: baseSkip } = buildEligiblePipeline(
    candidateRows,
    { excludeExample, suppressedSet: suppressed.set, sentIndex },
  );

  let targets = [];
  if (mode === 'dry-run') {
    return {
      ok: true,
      mode,
      template,
      totalCandidates,
      eligible: baseEligible.length,
      skipped: baseSkip,
      sent: 0,
      failed: 0,
      resultsSummary: `Dry run: ${baseEligible.length} would receive; ${Object.values(baseSkip).reduce(
        (a, b) => a + b,
        0,
      )} skipped in pipeline.`,
    };
  }

  let selectionSkip = null;
  if (mode === 'test') {
    if (suppressed.set.has(testEmail)) {
      return {
        ...emptyResponse({ totalCandidates, eligible: 0, skipped: baseSkip }),
        ok: false,
        error: 'testEmail is on Mailchimp reject list',
      };
    }
    if (excludeExample && testEmail.endsWith('@example.com')) {
      return {
        ...emptyResponse(),
        ok: false,
        error: 'testEmail matches excluded @example.com (set excludeExampleEmails: false to allow)',
      };
    }
    targets = [testEmail];
  } else if (mode === 'selected') {
    selectionSkip = emptySkip();
    const seen = new Set();
    for (const raw of emailsIn) {
      const n = normalizeEmail(typeof raw === 'string' ? raw : '');
      if (!n) {
        selectionSkip.invalid += 1;
        continue;
      }
      if (excludeExample && n.endsWith('@example.com')) {
        selectionSkip.example += 1;
        continue;
      }
      if (seen.has(n)) {
        selectionSkip.duplicate += 1;
        continue;
      }
      seen.add(n);
      if (suppressed.set.has(n)) {
        selectionSkip.suppressed += 1;
        continue;
      }
      if (sentIndex.has(n)) {
        selectionSkip.alreadySent += 1;
        continue;
      }
      targets.push(n);
    }
  } else if (mode === 'all') {
    targets = [...baseEligible];
  }

  let sent = 0;
  let failed = 0;
  const logs = [];
  const finalIndex = new Set(sentIndex);

  function isOkStatus(st) {
    return st === 'sent' || st === 'queued' || st === 'scheduled';
  }

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    for (const email of batch) {
      try {
        const result = await client.messages.send({
          message: {
            from_email: fromEmail,
            from_name: fromName,
            subject,
            to: [{ email, type: 'to' }],
            html,
            text,
            headers: { 'Reply-To': fromEmail },
            metadata: { campaign: `admin_email:${template}` },
          },
        });
        const row = Array.isArray(result) ? result[0] : null;
        const st = row?.status || 'unknown';
        const msgId = row?._id || null;
        const rejectReason = row?.reject_reason || null;
        console.log('[adminEmail] Mailchimp messages.send', {
          email,
          template,
          status: st,
          _id: msgId,
          reject_reason: rejectReason,
        });
        logs.push({ email, status: st, _id: msgId, reject_reason: rejectReason });
        if (isOkStatus(st)) {
          sent += 1;
          finalIndex.add(email);
        } else {
          failed += 1;
        }
      } catch (err) {
        failed += 1;
        console.error('[adminEmail] send failed', { email, error: err.message });
        logs.push({ email, status: 'error', _id: null, reject_reason: err.message });
      }
      if (PER_EMAIL_DELAY_MS) await sleep(PER_EMAIL_DELAY_MS);
    }
    if (BATCH_DELAY_MS && i + BATCH_SIZE < targets.length) await sleep(BATCH_DELAY_MS);
  }

  if (finalIndex.size > sentIndex.size) {
    saveSentIndex(template, finalIndex);
  }

  let skippedOut;
  if (mode === 'all' || mode === 'dry-run') {
    skippedOut = baseSkip;
  } else if (mode === 'test') {
    skippedOut = { ...baseSkip, modeNote: 'test: single recipient; idempotency index not used for test' };
  } else {
    skippedOut = { ...baseSkip, selection: selectionSkip };
  }

  const resultsSummary = `Targeted ${targets.length} address(es). Mailchimp: ok=${sent} failed=${failed}.`;

  return {
    ok: true,
    mode,
    template,
    totalCandidates,
    eligible: targets.length,
    skipped: skippedOut,
    sent,
    failed,
    resultsSummary,
    _logs: process.env.ADMIN_EMAIL_RETURN_LOGS === '1' ? logs : undefined,
  };
}

module.exports = {
  runAdminEmailSend,
  collectCandidateRows,
  buildEligiblePipeline,
  fetchSuppressedSet,
  loadSentIndex,
};
