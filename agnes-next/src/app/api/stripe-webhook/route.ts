export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import Stripe from 'stripe';

function generateReferralCode(): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.arrayBuffer();
    const sig = req.headers.get('stripe-signature');

    if (!sig) {
      return new NextResponse('No signature', { status: 400 });
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[webhook] STRIPE_WEBHOOK_SECRET missing');
      return new NextResponse('Webhook secret missing', { status: 500 });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        Buffer.from(body),
        sig,
        webhookSecret
      );
    } catch (err: any) {
      console.error('[webhook] signature verification failed', err.message);
      return new NextResponse(`Webhook signature verification failed: ${err.message}`, { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const email = session.customer_details?.email;
  
        console.log('[webhook] checkout.session.completed', { 
          email, 
          sessionId: session.id, 
          payment_status: session.payment_status 
        });
  
        if (!email) {
          console.log('[webhook] No email in session');
          return new NextResponse('No email', { status: 200 });
        }
  
        // Upsert user by email
        let user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });
  
        console.log('[webhook] User lookup result', { 
          found: !!user, 
          userId: user?.id, 
          currentPoints: user?.points 
        });
  
        // ... rest of the code ...
        // Create new user with referral code
        const referralCode = generateReferralCode();
        user = await prisma.user.create({
          data: {
            email: email.toLowerCase(),
            referralCode,
            code: referralCode, // Keep old field for backward compatibility
          },
        });
      } else {
        // Ensure referralCode exists (for old users)
        if (!user.referralCode) {
          const referralCode = generateReferralCode();
          user = await prisma.user.update({
            where: { id: user.id },
            data: { referralCode, code: referralCode },
          });
        }
      }

      // Check idempotency: has this session ID already been processed?
      const existingLedger = await prisma.ledger.findFirst({
        where: {
          userId: user.id,
          note: { contains: `sid: ${session.id}` },
        },
      });

      if (!existingLedger && session.payment_status === 'paid') {
        // Award 500 points for book purchase
        await prisma.ledger.create({
          data: {
            userId: user.id,
            type: 'PURCHASE_BOOK',
            points: 500,
            note: `Book purchase (sid: ${session.id})`,
          },
        });

        await prisma.user.update({
          where: { id: user.id },
          data: {
            points: { increment: 500 },
            earnedPurchaseBook: true,
          },
        });
      }

      // Handle referral payout
      const ref = session.metadata?.ref;
      if (ref && ref !== user.referralCode) {
        const referrer = await prisma.user.findUnique({
          where: { referralCode: ref },
        });

        if (referrer) {
          // Check idempotency for referral payout
          const existingReferralPayout = await prisma.ledger.findFirst({
            where: {
              userId: referrer.id,
              type: 'REFER_FRIEND_PAYOUT',
              note: { contains: `sid: ${session.id}` },
            },
          });

          if (!existingReferralPayout) {
            await prisma.ledger.create({
              data: {
                userId: referrer.id,
                type: 'REFER_FRIEND_PAYOUT',
                usd: 2.0,
                note: `Referral ${email} (sid: ${session.id})`,
              },
            });

            // Update user's referredBy if not set
            if (!user.referredBy) {
              await prisma.user.update({
                where: { id: user.id },
                data: { referredBy: ref },
              });
            }
          }
        }
      }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (err: any) {
    console.error('[webhook] error', err);
    return new NextResponse(`Webhook error: ${err.message}`, { status: 500 });
  }
}