import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionController } from '../../../src/subscription/subscription.controller';
import { SubscriptionService } from '../../../src/subscription/subscription.service';
import { SessionAuthGuard } from '../../../src/auth/guards/session-auth.guard';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../src/prisma/prisma.service';
import {
  createMockConfigService,
  createMockPrismaClient,
} from '../../setup/mocks';

describe('SubscriptionController', () => {
  let controller: SubscriptionController;
  let subscriptionService: jest.Mocked<SubscriptionService>;

  beforeEach(async () => {
    const mockSubscriptionService = {
      getStatusWithSession: jest.fn(),
      cancel: jest.fn(),
    };
    const mockConfigService = createMockConfigService();
    const mockPrismaService = createMockPrismaClient();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionController],
      providers: [
        {
          provide: SubscriptionService,
          useValue: mockSubscriptionService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        SessionAuthGuard,
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .compile();

    controller = module.get<SubscriptionController>(SubscriptionController);
    subscriptionService = module.get(SubscriptionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /subscription/status-session', () => {
    it('should return subscription status', async () => {
      const body = { sessionToken: 'session_token' };

      subscriptionService.getStatusWithSession.mockResolvedValue({
        success: true,
        hasActiveSubscription: true,
        subscription: {
          status: 'active',
          endDate: '2024-12-31T00:00:00Z',
          cancelAtPeriodEnd: false,
          subscriptionType: 'stripe',
        },
        trial: {
          trialActive: false,
          trialEndsAt: null,
          daysRemaining: 0,
          isPaid: true,
          tier: null,
        },
      });

      const result = await controller.getStatusWithSession(body);

      expect(result.success).toBe(true);
      expect(result.hasActiveSubscription).toBe(true);
      expect(subscriptionService.getStatusWithSession).toHaveBeenCalledWith(
        body.sessionToken,
      );
    });
  });

  describe('POST /subscription/cancel', () => {
    it('should cancel subscription successfully', async () => {
      const user = { uid: 'user_123', email: 'test@example.com' };

      subscriptionService.cancel.mockResolvedValue({
        success: true,
        message:
          'Subscription will be cancelled at the end of the current period',
        error: null,
      });

      const result = await controller.cancel(user as any);

      expect(result.success).toBe(true);
      expect(subscriptionService.cancel).toHaveBeenCalledWith(user.uid);
    });

    it('should handle no active subscription', async () => {
      const user = { uid: 'user_123', email: 'test@example.com' };

      subscriptionService.cancel.mockResolvedValue({
        success: false,
        message: 'No active subscription found',
        error: 'No active subscription to cancel',
      });

      const result = await controller.cancel(user as any);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
