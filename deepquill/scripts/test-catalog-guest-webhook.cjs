#!/usr/bin/env node
/**
 * Integration: signed POST /api/stripe/webhook with checkout.session.completed
 * — no contest_user_id / contest_user_code, paid, customer_details.email, product=ebook,
 * — optional legacy ref metadata for attribution logs.
 *
 * Requires (from deepquill/.env.local or .env): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 * Optional: MAILCHIMP_TRANSACTIONAL_KEY (without it, webhook may return 500 after DB writes; Purchase is still asserted)
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const Stripe = require('stripe');

const root = path.join(__dirname, '..');
const envLocal = path.join(root, '.env.local');
const envFile = path.join(root, '.env');
if (fs.existsSync(envLocal)) require('dotenv').config({ path: envLocal, override: false });
if (fs.existsSync(envFile)) require('dotenv').config({ path: envFile, override: false });

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_SK = process.env.STRIPE_SECRET_KEY;

if (!WEBHOOK_SECRET || !STRIPE_SK) {
  console.error('[TEST] Set STRIPE_WEBHOOK_SECRET and STRIPE_SECRET_KEY (e.g. in deepquill/.env.local).');
  process.exit(1);
}

const { prisma, ensureDatabaseUrl } = require(path.join(root, 'server', 'prisma.cjs'));
const { customAlphabet } = require('nanoid');
const genCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

const stripe = new Stripe(STRIPE_SK.trim());

async function pickUniqueRefCode() {
  for (let i = 0; i < 20; i += 1) {
    const code = genCode();
    const clash = await prisma.user.findFirst({
      where: { OR: [{ code }, { referralCode: code }] },
      select: { id: true },
    });
    if (!clash) return code;
  }
  throw new Error('no unique ref code');
}

async function main() {
  ensureDatabaseUrl();
  const webhookRouter = require(path.join(root, 'api', 'stripe-webhook.cjs'));

  const refCode = await pickUniqueRefCode();
  const refEmail = `referrer_cat_${Date.now()}@example.com`;
  await prisma.user.create({
    data: {
      email: refEmail,
      code: refCode,
      referralCode: refCode,
      firstName: 'Ref',
      fname: 'Ref',
      rabbitSeq: 1,
      rabbitTarget: 500,
    },
  });

  const sessionId = `cs_test_guest_${Date.now()}`;
  const buyerEmail = `catalog_guest_${Date.now()}@example.com`;

  const event = {
    id: `evt_test_guest_${Date.now()}`,
    object: 'event',
    api_version: '2024-04-10',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        payment_status: 'paid',
        amount_total: 999,
        currency: 'usd',
        payment_intent: `pi_test_${Date.now()}`,
        customer_details: {
          email: buyerEmail,
          name: 'Catalog Guest',
        },
        metadata: {
          product: 'ebook',
          ref: refCode,
          ref_valid: 'true',
        },
      },
    },
  };

  const payloadString = JSON.stringify(event);
  const sig = stripe.webhooks.generateTestHeaderString({
    payload: payloadString,
    secret: WEBHOOK_SECRET,
  });

  const captured = [];
  const wrap = (level) => {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      try {
        captured.push(
          args
            .map((a) => {
              if (typeof a === 'string') return a;
              if (a instanceof Error) return a.message;
              return JSON.stringify(a);
            })
            .join(' '),
        );
      } catch {
        captured.push(String(level));
      }
      orig(...args);
    };
    return () => {
      console[level] = orig;
    };
  };
  const restore = ['log', 'warn', 'error'].map((l) => wrap(l));

  const app = express();
  app.use('/api', webhookRouter);
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
  });
  const { port } = server.address();

  let res;
  try {
    res = await fetch(`http://127.0.0.1:${port}/api/stripe/webhook`, {
      method: 'POST',
      headers: {
        'stripe-signature': sig,
        'content-type': 'application/json',
      },
      body: Buffer.from(payloadString, 'utf8'),
    });
  } finally {
    server.close();
    restore.forEach((fn) => fn());
  }

  const bodyText = await res.text();
  const logStr = captured.join('\n');

  const purchase = await prisma.purchase.findUnique({
    where: { sessionId },
    include: { user: { select: { id: true, email: true } } },
  });

  let implicitPurchaseJoins = [];
  if (purchase?.userId) {
    const joins = await prisma.ledger.findMany({
      where: { userId: purchase.userId, type: 'CONTEST_JOIN' },
    });
    implicitPurchaseJoins = joins.filter((e) => {
      const m = e.meta && typeof e.meta === 'object' ? e.meta : {};
      return m.entryMethod === 'purchase';
    });
  }

  const mailConfigured = Boolean(process.env.MAILCHIMP_TRANSACTIONAL_KEY);
  const emailAttempted = /sendPurchaseConfirmation START|Mailchimp Transactional API response|Cannot send purchase email/.test(
    logStr,
  );

  const checks = [
    {
      name: '[BUYER_RESOLUTION] path=email_new_guest_user or email_existing_user',
      ok: /\[BUYER_RESOLUTION\] path=(email_new_guest_user|email_existing_user)/.test(logStr),
    },
    { name: 'Purchase row exists', ok: Boolean(purchase) },
    {
      name: 'eBook: no Order required (paperback only); skip implicit CONTEST_JOIN for new email guest',
      ok: /skip_implicit_contest_join=1/.test(logStr) || implicitPurchaseJoins.length === 0,
    },
    {
      name: 'Referral metadata present in logs (legacy ref)',
      ok: logStr.includes(refCode) && /ATTRIBUTION_REFERRER|Using legacy ref metadata|referralCodeToUse/.test(logStr),
    },
    {
      name: mailConfigured ? 'Confirmation email attempted' : 'Mailchimp missing (500 acceptable after purchase)',
      ok: mailConfigured ? emailAttempted : res.status === 500 || emailAttempted,
    },
  ];

  console.log('\n--- [TEST] catalog guest webhook summary ---');
  console.log('HTTP status:', res.status);
  console.log('Response (first 300 chars):', bodyText.slice(0, 300));
  console.log('Purchase:', purchase ? { id: purchase.id, userId: purchase.userId, email: purchase.user?.email } : null);
  console.log('Implicit CONTEST_JOIN (entryMethod=purchase):', implicitPurchaseJoins.length);
  console.log('Mailchimp key configured:', mailConfigured);
  for (const c of checks) {
    console.log(c.ok ? '✓' : '✗', c.name);
  }

  const failed = checks.filter((c) => !c.ok);
  if (failed.length) {
    console.error('\n[TEST] FAILED:', failed.map((f) => f.name).join('; '));
    process.exit(1);
  }
  console.log('\n[TEST] All checks passed.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
