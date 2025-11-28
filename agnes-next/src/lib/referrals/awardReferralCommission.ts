interface AwardReferralCommissionParams {
  referralCode: string;
  buyerEmail?: string;
  stripeSessionId: string;
  commissionCents: number; // 200
}

export async function awardReferralCommission(
  params: AwardReferralCommissionParams
): Promise<void> {
  const { referralCode, buyerEmail, stripeSessionId, commissionCents } = params;

  const apiUrl = process.env.DEEPQUILL_API_URL;
  const apiToken = process.env.DEEPQUILL_API_TOKEN;

  if (!apiUrl || !apiToken) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[REFERRAL_COMMISSION] Missing DEEPQUILL_API_URL or DEEPQUILL_API_TOKEN. Skipping commission award.',
        params
      );
    }
    return;
  }

  try {
    const response = await fetch(`${apiUrl}/referrals/award-commission`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        referralCode,
        buyerEmail,
        stripeSessionId,
        commissionCents,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error('[REFERRAL_COMMISSION] Backend API error:', {
        status: response.status,
        error: errorText,
      });
      throw new Error(`Backend API error: ${response.status}`);
    }

    console.log('[REFERRAL_COMMISSION] Commission awarded successfully', {
      referralCode,
      commissionCents,
    });
  } catch (error: any) {
    console.error('[REFERRAL_COMMISSION] Failed to award commission:', error);
    // Don't throw - we don't want to block the webhook if commission award fails
    // The backend should handle retries or manual fixes
  }
}

