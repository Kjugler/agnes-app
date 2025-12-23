import { prisma } from '@/lib/db';

export interface AssociatePublisher {
  id: string;
  email: string;
  referralCode: string;
  isActive: boolean;
}

/**
 * Validate an associate publisher referral code
 * Returns the associate record if valid and active, null otherwise
 */
export async function isValidAssociatePublisherRef(
  ref: string
): Promise<AssociatePublisher | null> {
  if (!ref || typeof ref !== 'string' || ref.trim().length === 0) {
    return null;
  }

  const normalizedRef = ref.trim().toUpperCase();

  try {
    const user = await prisma.user.findUnique({
      where: {
        referralCode: normalizedRef,
      },
      select: {
        id: true,
        email: true,
        referralCode: true,
      },
    });

    if (!user) {
      return null;
    }

    // For now, all users with referralCode are considered active
    // In the future, you could add an isActive field to User model
    return {
      id: user.id,
      email: user.email,
      referralCode: user.referralCode,
      isActive: true,
    };
  } catch (error) {
    console.error('[isValidAssociatePublisherRef] Error validating ref', {
      ref: normalizedRef,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

