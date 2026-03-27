import { getActiveSubscriptionForUser } from '../../../src/subscription/subscription-lookup.util';
import { createMockPrismaClient } from '../../setup/mocks';
import {
  createMockUser,
  createMockSubscription,
  createMockSubscriptionUser,
} from '../../setup/test-helpers';
import { SubscriptionStatus } from '@prisma/client';

describe('getActiveSubscriptionForUser', () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;

  beforeEach(() => {
    prisma = createMockPrismaClient();
  });

  it('returns subscription found via direct userId FK', async () => {
    const user = createMockUser();
    const sub = createMockSubscription({
      userId: user.id,
      status: SubscriptionStatus.ACTIVE,
    });
    prisma.subscription.findFirst.mockResolvedValue(sub);

    const result = await getActiveSubscriptionForUser(prisma as any, user.id);

    expect(result).toEqual(sub);
    expect(prisma.subscriptionUser.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to subscription_users mapping when direct FK returns null', async () => {
    const user = createMockUser();
    const sub = createMockSubscription({ status: SubscriptionStatus.ACTIVE });
    const mapping = createMockSubscriptionUser({
      userId: user.id,
      subscriptionId: sub.id,
    });

    prisma.subscription.findFirst.mockResolvedValue(null);
    prisma.subscriptionUser.findFirst.mockResolvedValue({
      ...mapping,
      subscription: sub,
    });

    const result = await getActiveSubscriptionForUser(prisma as any, user.id);

    expect(result).toEqual(sub);
    expect(prisma.subscriptionUser.findFirst).toHaveBeenCalled();
  });

  it('returns null when no subscription found through either path', async () => {
    prisma.subscription.findFirst.mockResolvedValue(null);
    prisma.subscriptionUser.findFirst.mockResolvedValue(null);

    const result = await getActiveSubscriptionForUser(
      prisma as any,
      'nonexistent-id',
    );

    expect(result).toBeNull();
  });

  it('includes TRIALING status in the lookup', async () => {
    const sub = createMockSubscription({ status: SubscriptionStatus.TRIALING });
    prisma.subscription.findFirst.mockResolvedValue(sub);

    const result = await getActiveSubscriptionForUser(
      prisma as any,
      sub.userId,
    );

    expect(result).toEqual(sub);
    expect(prisma.subscription.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
          },
        }),
      }),
    );
  });
});
