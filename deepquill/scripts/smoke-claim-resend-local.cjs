/**
 * Local smoke: token cross-rejection + HTTP against a running DeepQuill (default http://127.0.0.1:5055).
 * Run from deepquill: node scripts/smoke-claim-resend-local.cjs
 *
 * Requires: DATABASE_URL, FULFILLMENT_TOKEN_SECRET (32+ chars), STRIPE_SECRET_KEY (for Stripe session fetch on resend).
 * Admin routes: NODE_ENV=development on server OR x-admin-key matching ADMIN_KEY.
 */
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const envLocal = path.join(root, '.env.local');
const envFile = path.join(root, '.env');
if (fs.existsSync(envLocal)) require('dotenv').config({ path: envLocal, override: false });
if (fs.existsSync(envFile)) require('dotenv').config({ path: envFile, override: false });

const { verifyToken } = require(path.join(root, 'src', 'lib', 'fulfillmentToken.cjs'));
const { signReaderClaimToken, verifyReaderClaimToken } = require(path.join(root, 'src', 'lib', 'readerClaimToken.cjs'));
const { signToken } = require(path.join(root, 'src', 'lib', 'fulfillmentToken.cjs'));
const { prisma, ensureDatabaseUrl } = require(path.join(root, 'server', 'prisma.cjs'));

const BASE = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:5055').replace(/\/$/, '');

async function main() {
  ensureDatabaseUrl();
  console.log('[smoke] Token cross-rejection (no HTTP)');
  const ebookTok = signToken({
    email: 'smoke-ebook@example.com',
    sessionId: 'cs_smoke_session_only',
  });
  const { stripe } = require(path.join(root, 'src', 'lib', 'stripe.cjs'));

  let purchase = null;
  const candidates = await prisma.purchase.findMany({
    include: { user: { select: { id: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 25,
  });
  for (const p of candidates) {
    if (!p.user?.email) continue;
    try {
      await stripe.checkout.sessions.retrieve(p.sessionId);
      purchase = p;
      break;
    } catch {
      /* try next */
    }
  }
  if (!purchase) {
    console.error('[smoke] No purchase with resolvable Stripe session + user email — claim-verify + token checks above still ran.');
    process.exitCode = 2;
    return;
  }
  const em = String(purchase.user.email).trim().toLowerCase();
  const readerTok = signReaderClaimToken({
    userId: purchase.userId,
    email: em,
    purchaseId: purchase.id,
    sessionId: purchase.sessionId,
  });

  const ebookAsReader = verifyReaderClaimToken(ebookTok);
  const readerAsEbook = verifyToken(readerTok);
  if (ebookAsReader !== null) {
    console.error('[smoke] FAIL: eBook download token was accepted as reader-claim token');
    process.exitCode = 1;
    return;
  }
  if (readerAsEbook !== null) {
    console.error('[smoke] FAIL: reader-claim token was accepted as eBook fulfillment token');
    process.exitCode = 1;
    return;
  }
  console.log('[smoke] OK: eBook token rejected by reader verifier; reader token rejected by fulfillment verifier');

  const countBefore = await prisma.purchase.count();

  const r0 = await fetch(
    BASE + `/api/contest/claim-verify?token=${encodeURIComponent(readerTok)}`,
    { cache: 'no-store' }
  );
  const j0 = await r0.json().catch(() => ({}));
  console.log('[smoke] GET /api/contest/claim-verify (reader) status=', r0.status, 'body=', JSON.stringify(j0).slice(0, 240));
  if (!r0.ok || !j0.ok) {
    console.error('[smoke] FAIL: valid reader token claim-verify expected ok', r0.status, j0);
    process.exitCode = 1;
    return;
  }

  const rBad = await fetch(
    BASE + `/api/contest/claim-verify?token=${encodeURIComponent(ebookTok)}`,
    { cache: 'no-store' }
  );
  const jBad = await rBad.json().catch(() => ({}));
  console.log('[smoke] GET /api/contest/claim-verify (eBook token) status=', rBad.status, 'body=', JSON.stringify(jBad).slice(0, 200));
  if (rBad.ok || jBad.ok) {
    console.error('[smoke] FAIL: eBook token must not verify as reader claim', rBad.status, jBad);
    process.exitCode = 1;
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY || !/^sk_(test|live)_/.test(String(process.env.STRIPE_SECRET_KEY).trim())) {
    console.warn(
      '[smoke] SKIP resend POST tests: STRIPE_SECRET_KEY not set (resend loads Stripe session). Token + claim-verify checks above still ran.'
    );
    const countAfterSkip = await prisma.purchase.count();
    console.log('[smoke] Purchase count (no resend POSTs):', countAfterSkip);
    return;
  }

  const adminKey = (process.env.ADMIN_KEY || '').trim();
  const headers = { 'Content-Type': 'application/json' };
  if (adminKey) headers['x-admin-key'] = adminKey;

  for (const kind of ['resend-confirmation', 'resend-ebook-link']) {
    const url = `${BASE}/api/admin/purchases/${encodeURIComponent(purchase.id)}/${kind}`;
    const r = await fetch(url, { method: 'POST', headers, body: '{}' });
    const j = await r.json().catch(() => ({}));
    console.log('[smoke] POST', kind, 'status=', r.status, 'body=', JSON.stringify(j));
  }

  const claimUrl = `${BASE}/api/admin/users/${encodeURIComponent(purchase.userId)}/send-claim-profile-email`;
  const rc = await fetch(claimUrl, { method: 'POST', headers, body: '{}' });
  const jc = await rc.json().catch(() => ({}));
  console.log('[smoke] POST send-claim-profile-email status=', rc.status, 'body=', JSON.stringify(jc));

  const countAfter = await prisma.purchase.count();
  if (countAfter !== countBefore) {
    console.error('[smoke] FAIL: Purchase row count changed', countBefore, '->', countAfter);
    process.exitCode = 1;
    return;
  }
  console.log('[smoke] OK: Purchase count unchanged:', countBefore);
}

main().catch((e) => {
  console.error('[smoke] fatal', e);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect().catch(() => {}));
