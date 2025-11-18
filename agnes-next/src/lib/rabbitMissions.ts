import { prisma } from './db';

export type ActionsSnapshot = {
  facebookShareEver: boolean;
  xShareEver: boolean;
  instagramShareEver: boolean;
  purchasedBook: boolean;
};

/**
 * Check if user has ever shared on a platform (lifetime, not daily)
 */
async function hasSharedEver(userId: string, platform: 'facebook' | 'x' | 'instagram'): Promise<boolean> {
  const ledgerTypeMap: Record<'facebook' | 'x' | 'instagram', 'SHARE_FB' | 'SHARE_X' | 'SHARE_IG'> = {
    facebook: 'SHARE_FB',
    x: 'SHARE_X',
    instagram: 'SHARE_IG',
  };

  const ledgerType = ledgerTypeMap[platform];

  const exists = await prisma.ledger.findFirst({
    where: {
      userId,
      type: ledgerType,
    },
    select: { id: true },
  });

  return Boolean(exists);
}

/**
 * Get current actions snapshot for a user
 */
export async function getActionsSnapshot(userId: string): Promise<ActionsSnapshot> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      earnedPurchaseBook: true,
    },
  });

  if (!user) {
    return {
      facebookShareEver: false,
      xShareEver: false,
      instagramShareEver: false,
      purchasedBook: false,
    };
  }

  const [facebookShareEver, xShareEver, instagramShareEver] = await Promise.all([
    hasSharedEver(userId, 'facebook'),
    hasSharedEver(userId, 'x'),
    hasSharedEver(userId, 'instagram'),
  ]);

  return {
    facebookShareEver,
    xShareEver,
    instagramShareEver,
    purchasedBook: user.earnedPurchaseBook,
  };
}

/**
 * Check and award Rabbit 1 bonus (500 points) when user completes:
 * - Posted to Facebook (ever)
 * - Posted to X (ever)
 * - Posted to Instagram (ever)
 * - Purchased the book
 */
export async function checkAndAwardRabbit1(userId: string, actions?: ActionsSnapshot): Promise<boolean> {
  // Get user's current rabbit status
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      rabbit1Completed: true,
    },
  });

  if (!user) {
    return false;
  }

  // Already completed
  if (user.rabbit1Completed) {
    return false;
  }

  // Get actions snapshot if not provided
  const snapshot = actions || (await getActionsSnapshot(userId));

  // Check if all conditions are met
  const allSocialAndBook =
    snapshot.facebookShareEver &&
    snapshot.xShareEver &&
    snapshot.instagramShareEver &&
    snapshot.purchasedBook;

  if (!allSocialAndBook) {
    return false;
  }

  // Award the rabbit bonus (500 points)
  const rabbitBonus = 500;

  await prisma.$transaction([
    prisma.ledger.create({
      data: {
        userId,
        type: 'RABBIT_BONUS',
        points: rabbitBonus,
        note: 'Rabbit 1 bonus - Social + Book',
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        points: { increment: rabbitBonus },
        rabbit1Completed: true,
      },
    }),
  ]);

  return true;
}

