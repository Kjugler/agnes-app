// deepquill/lib/postPurchaseSync.cjs
// Idempotent post-purchase sync: Customer, User, Purchase, Order, Ledger, ReferralConversion, Event.
// Per-model idempotency; no global early-exit. Safely re-runnable and self-healing.
//
// BETA (POST_PURCHASE_BETA=true):
//   Buyer: max 500 PURCHASE_BOOK points/day (ledger-based check)
//   Referrer: max 25,000 REFER_PURCHASE points/day; commission ($2) always awarded
// PRODUCTION: no caps; 500 buyer / 5,000 referrer + $2 per qualifying purchase
//
// Timezone: UTC (start of day = 00:00:00.000 UTC)

const crypto = require('crypto');

function randomId(len = 12) {
  return crypto.randomBytes(len).toString('base64url').slice(0, len);
}

let prisma = null;
try {
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient();
} catch (err) {
  console.warn('[postPurchaseSync] Prisma not available:', err.message);
}

const BUYER_POINTS = 500;
const REFERRER_POINTS = 5000;
const COMMISSION_CENTS = 200;
const BETA_BUYER_DAILY_CAP = 500;
const BETA_REFERRER_DAILY_CAP = 25000;

function getStartOfTodayUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function getBuyerDailyPurchaseBookTotal(prismaClient, userId) {
  const startOfToday = getStartOfTodayUTC();
  const result = await prismaClient.ledger.aggregate({
    where: {
      userId,
      type: 'PURCHASE_BOOK',
      createdAt: { gte: startOfToday },
    },
    _sum: { points: true },
  });
  return result._sum.points ?? 0;
}

async function getReferrerDailyReferPurchaseTotal(prismaClient, userId) {
  const startOfToday = getStartOfTodayUTC();
  const result = await prismaClient.ledger.aggregate({
    where: {
      userId,
      type: 'REFER_PURCHASE',
      createdAt: { gte: startOfToday },
    },
    _sum: { points: true },
  });
  return result._sum.points ?? 0;
}

function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return null;
  return email.trim().toLowerCase();
}

function extractSessionData(session) {
  const customerDetails = session.customer_details || {};
  const shippingDetails = session.shipping_details || {};
  const addr = shippingDetails.address || customerDetails.address || {};
  const metadata = session.metadata || {};

  const email =
    normalizeEmail(customerDetails.email || session.customer_email) ||
    (session.id ? `unknown+${session.id}@checkout.agnes` : null);

  if (!email) {
    throw new Error('[postPurchaseSync] No email in session');
  }

  const name = customerDetails.name || shippingDetails.name || null;

  return {
    email,
    name,
    addr,
    metadata,
    sessionId: session.id,
    amountTotal: session.amount_total ?? null,
    currency: session.currency || 'usd',
    ref: metadata.ref ? String(metadata.ref).trim().toUpperCase() : null,
    refValid: metadata.ref_valid === 'true',
    contestPlayerId: metadata.contestPlayerId || null,
  };
}

/**
 * Sync post-purchase state. Per-model idempotent; no global early-exit.
 * @param {object} session - Stripe checkout.session.completed event.data.object
 * @returns {{ ok: boolean, error?: string }}
 */
async function syncPostPurchase(session) {
  if (!prisma) {
    console.error('[postPurchaseSync] Prisma not available');
    return { ok: false, error: 'Prisma not available' };
  }

  const {
    email,
    name,
    addr,
    metadata,
    sessionId,
    amountTotal,
    currency,
    ref,
    refValid,
    contestPlayerId,
  } = extractSessionData(session);

  try {
    // 1. Customer: upsert by email
    const customer = await prisma.customer.upsert({
      where: { email },
      update: {
        name: name ?? undefined,
        shippingStreet: addr.line1 ?? undefined,
        shippingCity: addr.city ?? undefined,
        shippingState: addr.state ?? undefined,
        shippingZip: addr.postal_code ?? undefined,
        shippingCountry: addr.country ?? undefined,
      },
      create: {
        email,
        name: name ?? undefined,
        shippingStreet: addr.line1 ?? undefined,
        shippingCity: addr.city ?? undefined,
        shippingState: addr.state ?? undefined,
        shippingZip: addr.postal_code ?? undefined,
        shippingCountry: addr.country ?? undefined,
      },
      select: { id: true },
    });

    // 2. User: upsert by email (buyer)
    const code = randomId(8).toUpperCase();
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        code,
        referralCode: code,
      },
      select: { id: true },
    });

    // 3. Purchase: upsert by sessionId (check if existed for Event guard)
    const existingPurchase = await prisma.purchase.findUnique({
      where: { sessionId },
      select: { id: true },
    });

    await prisma.purchase.upsert({
      where: { sessionId },
      update: {
        amount: amountTotal ?? undefined,
        currency: currency ?? undefined,
      },
      create: {
        id: randomId(24),
        sessionId,
        userId: user.id,
        amount: amountTotal,
        currency: currency ?? null,
      },
    });

    const purchaseWasNew = !existingPurchase;

    // 4. Order: guarded create (only if !exists by stripeSessionId)
    let order = await prisma.order.findUnique({
      where: { stripeSessionId: sessionId },
      select: { id: true, pointsAwarded: true },
    });

    const shippingName = name || undefined;
    const shippingAddressLine1 = addr.line1 || undefined;
    const shippingAddressLine2 = addr.line2 || undefined;
    const shippingCity = addr.city || undefined;
    const shippingState = addr.state || undefined;
    const shippingPostalCode = addr.postal_code || undefined;
    const shippingCountry = addr.country || undefined;
    const shippingPhone = shippingDetails.phone || undefined;

    if (!order) {
      order = await prisma.order.create({
        data: {
          customerId: customer.id,
          stripeSessionId: sessionId,
          amountTotal,
          currency: currency ?? undefined,
          contestPlayerId: contestPlayerId || undefined,
          referralCode: ref || undefined,
          commissionCents: refValid && ref ? COMMISSION_CENTS : undefined,
          pointsAwarded: false,
          shippingName,
          shippingAddressLine1,
          shippingAddressLine2,
          shippingCity,
          shippingState,
          shippingPostalCode,
          shippingCountry,
          shippingPhone,
        },
        select: { id: true, pointsAwarded: true },
      });
    }

    // 5. Ledger PURCHASE_BOOK: award only when purchaseWasNew (idempotency)
    //    Beta: max 500/day (ledger-based). Production: 500 per purchase.
    let envConfig;
    try {
      envConfig = require('../src/config/env.cjs');
    } catch {
      envConfig = { POST_PURCHASE_BETA: false };
    }
    const isBeta = envConfig.POST_PURCHASE_BETA === true;

    if (purchaseWasNew) {
      let shouldAwardBuyer = true;
      if (isBeta) {
        const dailyTotal = await getBuyerDailyPurchaseBookTotal(prisma, user.id);
        shouldAwardBuyer = dailyTotal < BETA_BUYER_DAILY_CAP;
      }
      if (shouldAwardBuyer) {
        await prisma.$transaction([
          prisma.ledger.create({
            data: {
              userId: user.id,
              type: 'PURCHASE_BOOK',
              points: BUYER_POINTS,
              note: 'checkout bonus',
            },
          }),
          prisma.user.update({
            where: { id: user.id },
            data: {
              points: { increment: BUYER_POINTS },
              earnedPurchaseBook: true,
            },
          }),
          prisma.order.update({
            where: { id: order.id },
            data: { pointsAwarded: true },
          }),
        ]);
      }
      // When capped: do not update order.pointsAwarded (stays false)
    }
    // Replay (purchaseWasNew=false): do not touch Order.pointsAwarded

    // 6. ReferralConversion + commission (always) + Ledger REFER_PURCHASE (capped in beta)
    //    Beta: max 25k REFER_PURCHASE points/day; commission always awarded
    //    Prod: 5k points + $2 commission per qualifying purchase
    if (ref && refValid) {
      const existingConversion = await prisma.referralConversion.findUnique({
        where: { stripeSessionId: sessionId },
        select: { id: true },
      });

      if (!existingConversion) {
        const referrer = await prisma.user.findFirst({
          where: { referralCode: ref },
          select: { id: true },
        });

        if (referrer) {
          // Always: ReferralConversion + commission ($2)
          await prisma.$transaction([
            prisma.referralConversion.create({
              data: {
                referrerUserId: referrer.id,
                referralCode: ref,
                buyerEmail: email,
                stripeSessionId: sessionId,
                commissionCents: COMMISSION_CENTS,
              },
            }),
            prisma.user.update({
              where: { id: referrer.id },
              data: { referralEarningsCents: { increment: COMMISSION_CENTS } },
            }),
          ]);

          // Points: beta = only if daily total < 25k; prod = always
          let shouldAwardReferrerPoints = true;
          if (isBeta) {
            const dailyTotal = await getReferrerDailyReferPurchaseTotal(prisma, referrer.id);
            shouldAwardReferrerPoints = dailyTotal + REFERRER_POINTS <= BETA_REFERRER_DAILY_CAP;
          }
          if (shouldAwardReferrerPoints) {
            await prisma.$transaction([
              prisma.ledger.create({
                data: {
                  userId: referrer.id,
                  type: 'REFER_PURCHASE',
                  points: REFERRER_POINTS,
                  note: 'referral purchase bonus',
                },
              }),
              prisma.user.update({
                where: { id: referrer.id },
                data: { points: { increment: REFERRER_POINTS } },
              }),
            ]);
          }
        }
      }
    }

    // 7. Event: guarded create (only if Purchase was newly created)
    if (purchaseWasNew) {
      await prisma.event.create({
        data: {
          userId: user.id,
          type: 'PURCHASE_COMPLETED',
          meta: {
            session_id: sessionId,
            amount_total: amountTotal,
            currency,
            ...metadata,
          },
        },
      });
    }

    return { ok: true };
  } catch (err) {
    console.error('[postPurchaseSync] Error:', err.message, err.stack);
    return { ok: false, error: err.message };
  }
}

module.exports = { syncPostPurchase };
