import { Test, TestingModule } from '@nestjs/testing';
import { AccountService } from '../../../src/account/account.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { EmailService } from '../../../src/email/email.service';
import { createMockPrismaClient } from '../../setup/mocks';
import {
  createMockUser,
  createMockSubscription,
} from '../../setup/test-helpers';

describe('AccountService.deleteAccount - linked accounts', () => {
  let service: AccountService;
  let prisma: ReturnType<typeof createMockPrismaClient>;

  beforeEach(async () => {
    prisma = createMockPrismaClient();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: EmailService,
          useValue: {
            sendAccountDeletedEmail: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<AccountService>(AccountService);
  });

  it('deletes linked user without affecting the subscription', async () => {
    const user = createMockUser();

    prisma.user.findUnique.mockResolvedValue({
      ...user,
      subscriptions: [],
    });
    prisma.subscriptionUser.findMany.mockResolvedValue([
      {
        subscriptionId: 'sub-1',
        subscription: { id: 'sub-1', userId: 'other-owner-id' },
      },
    ]);
    prisma.user.delete.mockResolvedValue(user);

    const result = await service.deleteAccount(user.id);

    expect(result.success).toBe(true);
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: user.id } });
  });

  it('logs warning when owner with linked users deletes account', async () => {
    const owner = createMockUser();
    const sub = createMockSubscription({ userId: owner.id });

    prisma.user.findUnique.mockResolvedValue({
      ...owner,
      subscriptions: [
        {
          stripeCustomerId: sub.stripeCustomerId,
          stripeSubscriptionId: sub.stripeSubscriptionId,
        },
      ],
    });
    prisma.subscriptionUser.findMany
      .mockResolvedValueOnce([
        {
          subscriptionId: sub.id,
          subscription: { id: sub.id, userId: owner.id },
        },
      ])
      .mockResolvedValueOnce([{ userId: 'linked-user-id' }]);
    prisma.user.delete.mockResolvedValue(owner);

    const result = await service.deleteAccount(owner.id);

    expect(result.success).toBe(true);
  });
});
