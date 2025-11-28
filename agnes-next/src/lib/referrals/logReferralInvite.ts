interface LogReferralInviteParams {
  referralCode: string;
  friendEmail: string;
  videoId: string;
  channel: 'email';
}

export async function logReferralInvite(
  params: LogReferralInviteParams
): Promise<void> {
  // TODO: wire to deepquill backend API once available.
  // For now, just log on the server for debugging.
  if (process.env.NODE_ENV !== 'production') {
    console.log('[REFERRAL_INVITE]', params);
  }

  // Example of future implementation:
  // await fetch(`${process.env.DEEPQUILL_API_URL}/referral-invites`, {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //     Authorization: `Bearer ${process.env.DEEPQUILL_API_TOKEN}`,
  //   },
  //   body: JSON.stringify(params),
  // });
}

