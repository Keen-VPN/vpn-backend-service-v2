import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionStatus } from '@prisma/client';
import { PaidConversionSlackService } from '../../../src/notification/paid-conversion-slack.service';
import { NotificationService } from '../../../src/notification/notification.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { createMockPrismaClient, MockPrismaClient } from '../../setup/mocks';

describe('PaidConversionSlackService', () => {
  let service: PaidConversionSlackService;
  let mockPrisma: MockPrismaClient;
  const notifyPaidConversion = jest.fn().mockResolvedValue(true);

  beforeEach(async () => {
    mockPrisma = createMockPrismaClient();
    mockPrisma.paidConversionSlackNotification.findUnique.mockResolvedValue(
      null,
    );
    mockPrisma.paidConversionSlackNotification.create.mockResolvedValue(
      {} as any,
    );
    mockPrisma.trialGrant.findUnique.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaidConversionSlackService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: NotificationService,
          useValue: { notifyPaidConversion },
        },
      ],
    }).compile();

    service = module.get(PaidConversionSlackService);
    notifyPaidConversion.mockResolvedValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('Stripe: notifies once on active and records dedupe key', async () => {
    await service.maybeNotifyStripePaidConversion({
      user: { id: 'u1', email: 'a@b.com' },
      stripeSubscriptionId: 'sub_123',
      previousDbStatus: SubscriptionStatus.TRIALING,
      stripeRawStatus: 'active',
      billingPeriod: 'year',
    });

    expect(notifyPaidConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentSource: 'stripe',
        planDisplay: 'Annual',
        conversionType: 'trial_to_paid',
      }),
    );
    expect(
      mockPrisma.paidConversionSlackNotification.create,
    ).toHaveBeenCalledWith({
      data: {
        dedupeKey: 'stripe:sub_123:paid',
        userId: 'u1',
      },
    });
  });

  it('Stripe: skips when not active', async () => {
    await service.maybeNotifyStripePaidConversion({
      user: { id: 'u1', email: 'a@b.com' },
      stripeSubscriptionId: 'sub_123',
      previousDbStatus: SubscriptionStatus.TRIALING,
      stripeRawStatus: 'trialing',
      billingPeriod: 'month',
    });

    expect(notifyPaidConversion).not.toHaveBeenCalled();
  });

  it('Apple: uses trial grant to mark trial_to_paid', async () => {
    mockPrisma.trialGrant.findUnique.mockResolvedValue({ id: 'tg' } as any);

    await service.maybeNotifyApplePaidConversion({
      userId: 'u1',
      userEmail: 'a@b.com',
      originalTransactionId: 'orig1',
      billingPeriod: 'month',
    });

    expect(notifyPaidConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        conversionType: 'trial_to_paid',
        paymentSource: 'apple',
        planDisplay: 'Monthly',
      }),
    );
  });
});
