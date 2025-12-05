export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { checkAndAwardRabbit1, getActionsSnapshot } from '@/lib/rabbitMissions';
import { handleReferralConversion } from '@/lib/referrals/handleReferralConversion';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' })
  : null;

const BOOK_POINTS = 500;

function normalizeCode(code: string | null | undefined) {
  return (code ?? '').trim().toLowerCase();
}

async function resolveAssociate(code: string) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;

  return prisma.user.findFirst({
    where: {
      OR: [{ code: normalized }, { referralCode: normalized }],
    },
  });
}

async function resolveAssociateByEmail(email: string) {
  const normalized = (email ?? '').trim().toLowerCase();
  if (!normalized) return null;

  return prisma.user.findUnique({
    where: { email: normalized },
  });
}

async function alreadyCredited(userId: string, intent: string) {
  if (!intent) return true; // avoid double credit if intent missing

  const existing = await prisma.ledger.findFirst({
    where: {
      userId,
      type: 'PURCHASE_BOOK',
      note: { contains: `intent:${intent}` },
    },
    select: { id: true },
  });

  return Boolean(existing);
}

async function addPointsForAssociate(
  userId: string,
  points: number,
  intent: string,
  source: string,
  session: Stripe.Checkout.Session,
) {
  const amount = typeof session.amount_total === 'number' ? session.amount_total : null;
  const currency = session.currency ?? null;

  await prisma.$transaction([
    prisma.ledger.create({
      data: {
        userId,
        type: 'PURCHASE_BOOK',
        points,
        note: `Book purchase intent:${intent}`,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { points: { increment: points }, earnedPurchaseBook: true },
    }),
    prisma.purchase.upsert({
      where: { sessionId: session.id },
      update: {
        userId,
        amount,
        currency,
        source,
      },
      create: {
        userId,
        sessionId: session.id,
        amount,
        currency,
        source,
      },
    }),
    prisma.event.create({
      data: {
        userId,
        type: 'PURCHASE_COMPLETED',
        meta: {
          sessionId: session.id,
          intent,
          source,
          amount,
          currency,
        },
      },
    }),
  ]);
}

export async function POST(req: NextRequest) {
  try {
    if (!stripe || !stripeSecretKey) {
      console.error('[stripe-webhook] missing STRIPE_SECRET_KEY');
      return new NextResponse('Server not configured for Stripe', { status: 500 });
    }

    if (!webhookSecret) {
      console.error('[stripe-webhook] missing STRIPE_WEBHOOK_SECRET');
      return new NextResponse('Webhook secret not configured', { status: 500 });
    }

    const rawBody = Buffer.from(await req.arrayBuffer());
    const signature = req.headers.get('stripe-signature') || '';

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      console.error('[stripe-webhook] signature verification failed', err?.message);
      return new NextResponse(`Webhook Error: ${err?.message}`, { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.payment_status !== 'paid') {
        return NextResponse.json({ received: true });
      }

      // Create order in deepquill orders store (non-blocking)
      try {
        const deepquillApiBase = process.env.DEEPQUILL_API_BASE || 'http://localhost:5055';
        await fetch(`${deepquillApiBase}/api/orders/create-from-stripe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(session),
        }).catch((err) => {
          console.warn('[stripe-webhook] Failed to create order in deepquill (non-blocking):', err.message);
        });
      } catch (err: any) {
        console.warn('[stripe-webhook] Error calling deepquill orders endpoint (non-blocking):', err.message);
      }

      // Handle referral conversion if referralCode is present
      const referralCode = (session.metadata?.referralCode || '').trim();
      if (referralCode) {
        try {
          await handleReferralConversion({ session, referralCode });
        } catch (err: any) {
          console.error('[stripe-webhook] Error handling referral conversion:', err);
          // Don't block the rest of the webhook processing
        }
      }

      const associateCode = normalizeCode(session.metadata?.associateCode || session.metadata?.ref);
      const mockEmail = (session.metadata?.mockEmail || '').trim().toLowerCase();
      const paymentIntent = session.payment_intent ? session.payment_intent.toString() : '';
      const source = (session.metadata?.source || 'contest').trim() || 'contest';

      if (!associateCode && !mockEmail) {
        console.log('[stripe-webhook] missing associate identifier', {
          associateCode,
          mockEmail,
        });
        return NextResponse.json({ received: true });
      }

      const associate =
        (associateCode ? await resolveAssociate(associateCode) : null) ??
        (mockEmail ? await resolveAssociateByEmail(mockEmail) : null);

      if (!associate || !paymentIntent) {
        console.log('[stripe-webhook] associate not found or missing intent', {
          associateCode,
          mockEmail,
          paymentIntent,
        });
        return NextResponse.json({ received: true });
      }

      const credited = await alreadyCredited(associate.id, paymentIntent);
      if (credited) {
        return NextResponse.json({ received: true });
      }

      await addPointsForAssociate(associate.id, BOOK_POINTS, paymentIntent, source, session);
      
      // Check and award Rabbit 1 after purchase
      const actionsSnapshot = await getActionsSnapshot(associate.id);
      await checkAndAwardRabbit1(associate.id, actionsSnapshot);
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('[stripe-webhook] error', err);
    return new NextResponse(`Webhook error: ${err?.message ?? 'unknown error'}`, { status: 500 });
  }
}