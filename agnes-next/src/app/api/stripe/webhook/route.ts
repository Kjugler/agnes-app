import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { normalizeEmail } from '@/lib/email';
import { ensureAssociateMinimal } from '@/lib/associate';
import { sendOrderConfirmationEmail } from '@/lib/email/orderConfirmation';
import { sendAssociateCommissionEmail } from '@/lib/email/associateCommission';
import { ASSOCIATE_EARNING_CENTS, FRIEND_DISCOUNT_CENTS, BOOK_RETAIL_PRICE_CENTS } from '@/config/associate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const secretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Purchase points bonus (configurable constant)
const PURCHASE_POINTS_BONUS = 500;

const stripe = secretKey
  ? new Stripe(secretKey, { apiVersion: '2024-06-20' as any })
  : null;

/**
 * Upsert Customer and Order, then award points atomically
 */
async function upsertCustomerAndOrderAndAwardPoints(params: {
  stripeSessionId: string;
  email: string | null;
  name: string | null;
  address: Stripe.Address | null;
  amountTotal: number | null;
  currency: string | null;
  contestPlayerId?: string | null;
  referralCode?: string | null;
  shippingName?: string | null;
  shippingPhone?: string | null;
}) {
  const {
    stripeSessionId,
    email,
    name,
    address,
    amountTotal,
    currency,
    contestPlayerId,
    referralCode,
    shippingName,
    shippingPhone,
  } = params;

  // Normalize email if provided
  const normalizedEmail = email ? normalizeEmail(email) : null;

  if (!normalizedEmail) {
    console.warn('[webhook] No email provided, cannot create Customer');
    // Still try to create Order with a placeholder email
  }

  // Find or create User (ContestPlayer) before transaction if we have email
  // This ensures the user exists before we try to award points
  let playerUserId: string | null = null;
  if (normalizedEmail && !contestPlayerId) {
    try {
      const user = await ensureAssociateMinimal(normalizedEmail);
      playerUserId = user.id;
    } catch (err) {
      console.error('[webhook] Failed to ensure associate before transaction', err);
    }
  }

  // Use a transaction to ensure atomicity
  return await prisma.$transaction(async (tx) => {
    // 1. Upsert Customer by email (if email is available)
    let customerId: string | null = null;
    if (normalizedEmail) {
      const customer = await tx.customer.upsert({
        where: { email: normalizedEmail },
        update: {
          name: name || undefined,
          shippingStreet: address?.line1 || undefined,
          shippingCity: address?.city || undefined,
          shippingState: address?.state || undefined,
          shippingZip: address?.postal_code || undefined,
          shippingCountry: address?.country || undefined,
        },
        create: {
          email: normalizedEmail,
          name: name || undefined,
          shippingStreet: address?.line1 || undefined,
          shippingCity: address?.city || undefined,
          shippingState: address?.state || undefined,
          shippingZip: address?.postal_code || undefined,
          shippingCountry: address?.country || undefined,
        },
      });
      customerId = customer.id;
    } else {
      // If no email, we can't create a Customer record
      // But we'll still create the Order with a fallback
      console.warn('[webhook] No email for session, skipping Customer creation');
    }

    // 2. Create Order record if not already existing (idempotent by stripeSessionId)
    const existingOrder = await tx.order.findUnique({
      where: { stripeSessionId },
      select: { id: true, pointsAwarded: true, customerId: true },
    });

    let orderId: string;
    let pointsAlreadyAwarded = false;

    if (existingOrder) {
      orderId = existingOrder.id;
      pointsAlreadyAwarded = existingOrder.pointsAwarded;
      // Update order if customerId was missing before
      if (!existingOrder.customerId && customerId) {
        await tx.order.update({
          where: { id: orderId },
          data: { customerId },
        });
      }
    } else {
      // Create new order
      if (!customerId) {
        // We need a customer - create one with a placeholder email if needed
        const placeholderEmail = `unknown+${stripeSessionId.slice(0, 8)}@example.org`;
        const placeholderCustomer = await tx.customer.create({
          data: {
            email: placeholderEmail,
            name: name || undefined,
            shippingStreet: address?.line1 || undefined,
            shippingCity: address?.city || undefined,
            shippingState: address?.state || undefined,
            shippingZip: address?.postal_code || undefined,
            shippingCountry: address?.country || undefined,
          },
        });
        customerId = placeholderCustomer.id;
      }

      // Extract shipping information from address
      const shippingAddressLine1 = address?.line1 || null;
      const shippingAddressLine2 = address?.line2 || null;
      const shippingCity = address?.city || null;
      const shippingState = address?.state || null;
      const shippingPostalCode = address?.postal_code || null;
      const shippingCountry = address?.country || null;

      const order = await tx.order.create({
        data: {
          customerId: customerId!,
          stripeSessionId,
          amountTotal: amountTotal ? Math.round(amountTotal) : null,
          currency: currency || null,
          contestPlayerId: contestPlayerId || null,
          referralCode: referralCode || null,
          pointsAwarded: false,
          // Shipping fields
          shippingName: shippingName || null,
          shippingAddressLine1,
          shippingAddressLine2,
          shippingCity,
          shippingState,
          shippingPostalCode,
          shippingCountry,
          shippingPhone: shippingPhone || null,
        },
      });
      orderId = order.id;
    }

    // 3. Find ContestPlayer (User) by contestPlayerId or the userId we found earlier
    let player: { id: string; points: number } | null = null;

    if (contestPlayerId) {
      // Try to find by contestPlayerId first
      const userById = await tx.user.findUnique({
        where: { id: contestPlayerId },
        select: { id: true, points: true },
      });
      if (userById) {
        player = userById;
      }
    }

    if (!player && playerUserId) {
      // Use the user we found/created before the transaction
      const user = await tx.user.findUnique({
        where: { id: playerUserId },
        select: { id: true, points: true },
      });
      if (user) {
        player = user;
      }
    }

    if (!player && normalizedEmail) {
      // Last resort: try to find by email within transaction
      const userByEmail = await tx.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, points: true },
      });
      if (userByEmail) {
        player = userByEmail;
      }
    }

    // 4. If Order.points_awarded is false, award points
    if (!pointsAlreadyAwarded && player) {
      // Increment the player's total_points
      const updatedPlayer = await tx.user.update({
        where: { id: player.id },
        data: {
          points: {
            increment: PURCHASE_POINTS_BONUS,
          },
        },
        select: { id: true, points: true },
      });

      // Mark Order.points_awarded = true
      await tx.order.update({
        where: { id: orderId },
        data: { pointsAwarded: true },
      });

      // Create a ledger entry for tracking
      await tx.ledger.create({
        data: {
          userId: player.id,
          type: 'PURCHASE_BOOK',
          points: PURCHASE_POINTS_BONUS,
          usd: amountTotal ? amountTotal / 100 : 0,
          note: `Purchase bonus for order ${stripeSessionId}`,
        },
      });

      // Create an event record
      await tx.event.create({
        data: {
          userId: player.id,
          type: 'PURCHASE_COMPLETED',
          meta: {
            sessionId: stripeSessionId,
            orderId,
            pointsAwarded: PURCHASE_POINTS_BONUS,
          },
        },
      });

      console.log('[webhook] Points awarded', {
        userId: player.id,
        pointsAwarded: PURCHASE_POINTS_BONUS,
        newTotal: updatedPlayer.points,
        orderId,
      });

      return {
        customerId,
        orderId,
        playerId: player.id,
        pointsAwarded: PURCHASE_POINTS_BONUS,
        newTotal: updatedPlayer.points,
      };
    } else if (pointsAlreadyAwarded) {
      console.log('[webhook] Points already awarded for this order', { orderId });
      return {
        customerId,
        orderId,
        playerId: player?.id || null,
        pointsAwarded: 0,
        alreadyAwarded: true,
      };
    } else {
      console.warn('[webhook] No player found to award points', {
        contestPlayerId,
        email: normalizedEmail,
      });
      return {
        customerId,
        orderId,
        playerId: null,
        pointsAwarded: 0,
      };
    }
  });
}

export async function POST(req: NextRequest) {
  if (!stripe || !webhookSecret) {
    console.error('[webhook] Stripe configuration missing', {
      hasStripe: !!stripe,
      hasWebhookSecret: !!webhookSecret,
    });
    return NextResponse.json(
      { error: 'Webhook configuration missing' },
      { status: 500 }
    );
  }

  try {
    // Read raw body for signature verification
    const body = await req.arrayBuffer();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      console.error('[webhook] No Stripe signature header');
      return NextResponse.json(
        { error: 'No signature' },
        { status: 400 }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        Buffer.from(body),
        signature,
        webhookSecret
      );
    } catch (err: any) {
      console.error('[webhook] Signature verification failed', {
        error: err?.message,
      });
      return NextResponse.json(
        { error: `Webhook signature verification failed: ${err?.message}` },
        { status: 400 }
      );
    }

    console.log('[webhook] Event received', {
      type: event.type,
      id: event.id,
    });

    // Handle checkout.session.completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      
      console.log('[webhook] Processing checkout.session.completed', {
        sessionId: session.id,
        amountTotal: session.amount_total,
        currency: session.currency,
        customerEmail: session.customer_email,
        metadata: session.metadata,
      });

      // Retrieve full session with expanded details
      // Note: shipping_details cannot be expanded - it's available directly on the session
      const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['customer_details', 'payment_intent'],
      });
      
      console.log('[webhook] Retrieved full session', {
        sessionId: fullSession.id,
        hasCustomerDetails: !!fullSession.customer_details,
        hasShippingDetails: !!(fullSession as any).shipping_details,
        hasPaymentIntent: !!fullSession.payment_intent,
      });

      // Extract data from session
      const customerDetails = fullSession.customer_details as Stripe.Checkout.Session.CustomerDetails | null;
      const email =
        customerDetails?.email ||
        fullSession.customer_email ||
        null;

      const name =
        customerDetails?.name ||
        null;

      // shipping_details is available directly on the session (not expanded)
      const shippingDetails = (fullSession as any).shipping_details as Stripe.Checkout.Session.ShippingDetails | null;
      
      // Also check payment_intent.shipping if available
      const paymentIntent = fullSession.payment_intent as Stripe.PaymentIntent | null;
      const shippingFromPI = (paymentIntent as any)?.shipping as Stripe.ShippingDetails | null;
      
      // Prefer shipping_details, fall back to payment_intent.shipping, then customer_details
      const shipping = shippingDetails || shippingFromPI || null;
      const address = shipping?.address || customerDetails?.address || null;
      
      // Extract shipping name and phone
      const shippingName = shipping?.name || customerDetails?.name || null;
      const shippingPhone = shipping?.phone || customerDetails?.phone || null;

      const amountTotal = fullSession.amount_total; // in cents
      const currency = fullSession.currency || null;

      // Extract metadata
      const contestPlayerId = fullSession.metadata?.contestPlayerId || null;
      const referralCode = fullSession.metadata?.referralCode || null;

      // Debug log to see where Stripe places shipping data
      console.log('[webhook] Shipping data sources', {
        hasShippingDetails: !!shippingDetails,
        hasPaymentIntentShipping: !!shippingFromPI,
        hasCustomerDetailsAddress: !!customerDetails?.address,
        shippingName,
        shippingPhone,
        hasAddress: !!address,
        addressSource: shippingDetails ? 'shipping_details' : shippingFromPI ? 'payment_intent.shipping' : customerDetails?.address ? 'customer_details' : 'none',
      });

      console.log('[webhook] Processing checkout.session.completed', {
        sessionId: fullSession.id,
        email,
        contestPlayerId,
        referralCode,
        amountTotal,
        currency,
        hasAddress: !!address,
      });

      // Upsert Customer, create Order, and award points
      console.log('[webhook] Calling upsertCustomerAndOrderAndAwardPoints...');
      const result = await upsertCustomerAndOrderAndAwardPoints({
        stripeSessionId: fullSession.id,
        email,
        name,
        address,
        amountTotal,
        currency,
        contestPlayerId,
        referralCode,
        shippingName,
        shippingPhone,
      });

      // Fetch the order and customer for email sending
      const order = await prisma.order.findUnique({
        where: { id: result.orderId },
        select: {
          id: true,
          shippingName: true,
          shippingPhone: true,
          shippingAddressLine1: true,
          shippingAddressLine2: true,
          shippingCity: true,
          shippingState: true,
          shippingPostalCode: true,
          shippingCountry: true,
          amountTotal: true,
        },
      });

      const customer = result.customerId
        ? await prisma.customer.findUnique({
            where: { id: result.customerId },
            select: { id: true },
          })
        : null;

      const user = result.playerId
        ? await prisma.user.findUnique({
            where: { id: result.playerId },
            select: { id: true, points: true },
          })
        : null;

      console.log('[webhook] Points awarded', {
        userId: user?.id,
        pointsAwarded: result.pointsAwarded,
        newTotal: user?.points,
        orderId: order?.id,
      });

      console.log('[webhook] ✅ Checkout processed successfully', {
        sessionId: fullSession.id,
        customerEmail: email,
        customerId: customer?.id,
        orderId: order?.id,
        playerId: user?.id,
        purchasePointsAwarded: result.pointsAwarded,
        alreadyAwarded: result.alreadyAwarded || false,
      });

      // Send order confirmation email (best-effort, errors logged but do not fail webhook)
      if (email && order) {
        await sendOrderConfirmationEmail({
          to: email,
          orderId: order.id,
          sessionId: fullSession.id,
          shippingName: order.shippingName,
          shippingPhone: order.shippingPhone,
          shippingAddressLine1: order.shippingAddressLine1,
          shippingAddressLine2: order.shippingAddressLine2,
          shippingCity: order.shippingCity,
          shippingState: order.shippingState,
          shippingPostalCode: order.shippingPostalCode,
          shippingCountry: order.shippingCountry,
          amountTotalCents: order.amountTotal ?? amountTotal ?? 0,
          currency: currency || 'usd',
        }).catch((err) => {
          // Log but don't fail webhook if email fails
          console.error('[webhook] Email sending failed (non-blocking)', {
            error: err,
            orderId: order.id,
          });
        });
      }

      // Process associate commission if referral code is present
      if (referralCode && email) {
        try {
          const normalizedPurchaserEmail = normalizeEmail(email);
          
          // Find the referrer by referral code
          const referrer = await prisma.user.findUnique({
            where: { referralCode },
            select: {
              id: true,
              email: true,
              firstName: true,
              fname: true,
              associateBalanceCents: true,
              associateLifetimeEarnedCents: true,
              associateFriendsSavedCents: true,
            },
          });

          if (referrer) {
            const normalizedReferrerEmail = normalizeEmail(referrer.email);
            
            // Check that purchaser is not the same as referrer (no self-commission)
            if (normalizedPurchaserEmail !== normalizedReferrerEmail) {
              // Get values from metadata (set during checkout) or use defaults
              const finalPriceCentsFromMetadata = fullSession.metadata?.finalPriceCents
                ? parseInt(fullSession.metadata.finalPriceCents, 10)
                : null;
              
              const friendDiscountCentsFromMetadata = fullSession.metadata?.friendDiscountCents
                ? parseInt(fullSession.metadata.friendDiscountCents, 10)
                : null;
              
              const associateEarningCentsFromMetadata = fullSession.metadata?.associateEarningCents
                ? parseInt(fullSession.metadata.associateEarningCents, 10)
                : null;
              
              // Use metadata values if available, otherwise calculate from defaults
              const finalPriceCents = finalPriceCentsFromMetadata || amountTotal || BOOK_RETAIL_PRICE_CENTS;
              const friendSavedCents = friendDiscountCentsFromMetadata || (referralCode ? FRIEND_DISCOUNT_CENTS : 0);
              const earningCents = associateEarningCentsFromMetadata || (referralCode ? ASSOCIATE_EARNING_CENTS : 0);
              
              console.log('[ASSOCIATE_COMMISSION] Price calculation', {
                finalPriceCentsFromMetadata,
                amountTotal,
                finalPriceCents,
                friendSavedCents,
                earningCents,
                retailPriceCents: BOOK_RETAIL_PRICE_CENTS,
              });

              // Award commission in a transaction
              const updatedReferrer = await prisma.$transaction(async (tx) => {
                // Create ReferralConversion record with all details
                await tx.referralConversion.create({
                  data: {
                    referrerUserId: referrer.id,
                    referralCode,
                    buyerEmail: normalizedPurchaserEmail,
                    stripeSessionId: fullSession.id,
                    commissionCents: earningCents, // $2.00 flat earning
                  },
                });

                // Create ledger entry for commission
                await tx.ledger.create({
                  data: {
                    userId: referrer.id,
                    type: 'REFER_PURCHASE',
                    points: 0, // This is money, not points
                    usd: earningCents / 100,
                    note: `Commission from ${normalizedPurchaserEmail} purchase`,
                  },
                });

                // Update referrer totals
                const updated = await tx.user.update({
                  where: { id: referrer.id },
                  data: {
                    associateBalanceCents: {
                      increment: earningCents,
                    },
                    associateLifetimeEarnedCents: {
                      increment: earningCents,
                    },
                    associateFriendsSavedCents: {
                      increment: friendSavedCents,
                    },
                  },
                  select: {
                    associateBalanceCents: true,
                    associateLifetimeEarnedCents: true,
                    associateFriendsSavedCents: true,
                  },
                });

                // Update order with commission info (optional, for admin visibility)
                await tx.order.update({
                  where: { id: result.orderId },
                  data: {
                    commissionCents: earningCents, // $2.00 flat earning
                    friendSavedCents: friendSavedCents, // $3.90 discount
                  },
                });

                return updated;
              });

              // Count total friends converted
              const totalFriendsConverted = await prisma.referralConversion.count({
                where: { referrerUserId: referrer.id },
              });

              console.log('[ASSOCIATE_COMMISSION] Friend purchased via referral', {
                referrerEmail: referrer.email,
                friendEmail: normalizedPurchaserEmail,
                earningCents, // $2.00 flat
                friendSavedCents, // $3.90 discount
                finalPriceCents,
                newBalanceCents: updatedReferrer.associateBalanceCents,
                lifetimeEarnedCents: updatedReferrer.associateLifetimeEarnedCents,
                lifetimeSavedCents: updatedReferrer.associateFriendsSavedCents,
                totalFriendsConverted,
                orderId: result.orderId,
              });

              // Send commission email (best-effort, don't fail webhook if email fails)
              await sendAssociateCommissionEmail({
                referrerEmail: referrer.email,
                referrerCode: referralCode,
                lastEarningCents: earningCents,
                totalEarnedCents: updatedReferrer.associateLifetimeEarnedCents,
                totalSavedForFriendsCents: updatedReferrer.associateFriendsSavedCents,
                totalFriendsConverted,
                referrerFirstName: referrer.firstName || referrer.fname || undefined,
              }).catch((err) => {
                console.error('[webhook] Commission email sending failed (non-blocking)', {
                  error: err,
                  referrerEmail: referrer.email,
                  orderId: result.orderId,
                });
              });
            } else {
              console.log('[ASSOCIATE_COMMISSION] Skipping self-commission', {
                email: normalizedPurchaserEmail,
                referralCode,
              });
            }
          } else {
            console.log('[ASSOCIATE_COMMISSION] Referrer not found for referral code', {
              referralCode,
            });
          }
        } catch (err) {
          // Log but don't fail webhook if commission processing fails
          console.error('[webhook] Commission processing failed (non-blocking)', {
            error: err,
            referralCode,
            orderId: result.orderId,
          });
        }
      }

      return NextResponse.json({ received: true, result });
    }

    // For other event types, just acknowledge
    console.log('[webhook] Event type not handled', { type: event.type });
    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('[webhook] Error processing webhook', {
      error: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

