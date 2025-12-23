/**
 * Referral conversion handler
 * 
 * NOTE: This function is no longer used in agnes-next since webhook handling
 * is now proxied to deepquill. Kept for reference but will be removed in future cleanup.
 */

import { awardReferralCommission } from './awardReferralCommission';

interface SessionData {
  id: string;
  customer_details?: { email?: string | null } | null;
  customer_email?: string | null;
}

interface HandleReferralConversionParams {
  session: SessionData;
  referralCode: string;
}

export async function handleReferralConversion({
  session,
  referralCode,
}: HandleReferralConversionParams): Promise<void> {
  // Basic sanity check
  if (!referralCode || referralCode.trim() === '') {
    console.warn('[REFERRAL_CONVERSION] Empty referral code, skipping');
    return;
  }

  const buyerEmail =
    (session.customer_details?.email ||
      session.customer_email ||
      '') as string;

  // For now, our commission is fixed at $2.00
  const commissionCents = 200;

  console.log('[REFERRAL_CONVERSION] Processing referral conversion', {
    referralCode,
    buyerEmail: buyerEmail || '(not provided)',
    stripeSessionId: session.id,
    commissionCents,
  });

  await awardReferralCommission({
    referralCode: referralCode.trim(),
    buyerEmail: buyerEmail || undefined,
    stripeSessionId: session.id,
    commissionCents,
  });
}
