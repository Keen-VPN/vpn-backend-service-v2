import { SubscriptionStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Finds an active subscription for a user, with fallback through subscription_users mapping.
 * This is a standalone function (not a service method) to avoid circular module dependencies.
 * Any service that needs this can import it and pass its own PrismaService instance.
 */
export async function getActiveSubscriptionForUser(
  prisma: PrismaService,
  userId: string,
) {
  // Primary path: direct FK (existing behavior)
  const direct = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
      OR: [
        { currentPeriodEnd: null },
        { currentPeriodEnd: { gte: new Date() } },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
  if (direct) return direct;

  // Fallback: subscription_users mapping (linked accounts)
  const mapping = await prisma.subscriptionUser.findFirst({
    where: {
      userId,
      subscription: {
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
        },
        OR: [
          { currentPeriodEnd: null },
          { currentPeriodEnd: { gte: new Date() } },
        ],
      },
    },
    include: { subscription: true },
    orderBy: { subscription: { currentPeriodEnd: 'desc' } },
  });
  return mapping?.subscription ?? null;
}
