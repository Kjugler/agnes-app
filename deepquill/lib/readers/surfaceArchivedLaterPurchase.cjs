/**
 * Open a conservative identity review when a later purchase is recorded
 * against an archived operational profile. Does not unarchive, send mail,
 * or change Purchase / accounting rows.
 */
const LATER_PURCHASE_REASON = 'archived_profile_new_purchase';
const ARCHIVE_STATUS = 'archived';

async function surfaceArchivedLaterPurchase(prisma, profile) {
  if (!prisma || !profile || profile.status !== ARCHIVE_STATUS) {
    return { action: 'skipped', reason: 'not_archived' };
  }
  const existing = await prisma.readerIdentityReview.findFirst({
    where: {
      primaryUserId: profile.userId,
      reasonCode: LATER_PURCHASE_REASON,
      status: 'open',
    },
    select: { id: true },
  });
  if (existing) {
    return { action: 'existing', reviewId: existing.id };
  }

  try {
    const created = await prisma.readerIdentityReview.create({
      data: {
        primaryUserId: profile.userId,
        reasonCode: LATER_PURCHASE_REASON,
        details:
          'A later purchase was recorded while this operational profile is archived. The archive was preserved. No discretionary outreach was started.',
        status: 'open',
        actorType: 'system',
        actorLabel: 'purchase_sync',
        actorId: 'system:purchase_sync',
      },
    });
    return { action: 'opened', reviewId: created.id };
  } catch {
    const retry = await prisma.readerIdentityReview.findFirst({
      where: {
        primaryUserId: profile.userId,
        reasonCode: LATER_PURCHASE_REASON,
        status: 'open',
      },
      select: { id: true },
    });
    if (retry) return { action: 'existing', reviewId: retry.id };
    return { action: 'skipped', reason: 'review_create_failed' };
  }
}

module.exports = {
  LATER_PURCHASE_REASON,
  surfaceArchivedLaterPurchase,
};
