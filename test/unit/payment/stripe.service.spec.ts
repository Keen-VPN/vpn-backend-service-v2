import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StripeService } from '../../../src/payment/stripe/stripe.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TrialService } from '../../../src/subscription/trial.service';
import { PaidConversionSlackService } from '../../../src/notification/paid-conversion-slack.service';
import { EmailService } from '../../../src/email/email.service';
import { SubscriptionStatus } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import {
  createMockPrismaClient,
  createMockConfigService,
  createMockStripe,
  MockPrismaClient,
  MockStripe,
} from '../../setup/mocks';
import {
  createMockUser,
  createMockSubscription,
  createMockStripeCustomer,
  createMockStripeSubscription,
  createMockStripeEvent,
} from '../../setup/test-helpers';

// Mock Stripe module
const mockStripeInstance = createMockStripe();
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => mockStripeInstance);
});

describe('StripeService', () => {
  let service: StripeService;
  let mockPrisma: MockPrismaClient;
  let mockConfigService: ReturnType<typeof createMockConfigService>;

  beforeEach(async () => {
    mockPrisma = createMockPrismaClient();
    mockConfigService = createMockConfigService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: TrialService,
          useValue: {
            checkTrialStatus: jest.fn(),
            activateTrial: jest.fn(),
            grantIfEligible: jest
              .fn()
              .mockResolvedValue({ granted: false, userId: '' }),
          },
        },
        {
          provide: PaidConversionSlackService,
          useValue: {
            maybeNotifyStripePaidConversion: jest
              .fn()
              .mockResolvedValue(undefined),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendSubscriptionStartedEmail: jest.fn().mockResolvedValue(true),
            sendSubscriptionRenewedEmail: jest.fn().mockResolvedValue(true),
            sendSubscriptionCancelledEmail: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<StripeService>(StripeService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createCheckoutSession', () => {
    it('should create checkout session successfully', async () => {
      const user = createMockUser();
      const customer = createMockStripeCustomer();
      const session = {
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/test',
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      // Reservation attempt occurs when user appears eligible; default to "not reserved"
      // so the checkout is created without trial settings in this base test.
      mockPrisma.user.updateMany.mockResolvedValueOnce({ count: 0 } as any);
      // 1) getActiveSubscriptionForUser(direct) 2) existingStripeSubscription check
      mockPrisma.subscription.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      (mockStripeInstance.customers.create as jest.Mock).mockResolvedValue(
        customer,
      );
      (
        mockStripeInstance.checkout.sessions.create as jest.Mock
      ).mockResolvedValue(session);

      const result = await service.createCheckoutSession(
        user.id,
        'individual-annual',
        'https://success.com',
        'https://cancel.com',
      );

      expect(result.url).toBe(session.url);
      expect(mockStripeInstance.checkout.sessions.create).toHaveBeenCalled();
    });

    it('should include 30-day Stripe trial for first-time user only', async () => {
      const user = createMockUser({
        stripeCustomerId: 'cus_test_123',
        stripeTrialUsedAt: null,
      });
      const session = {
        id: 'cs_test_trial',
        url: 'https://checkout.stripe.com/test-trial',
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      // Reserve the one-time trial during checkout creation
      mockPrisma.user.updateMany.mockResolvedValueOnce({ count: 1 } as any);
      mockPrisma.subscription.findFirst
        .mockResolvedValueOnce(null) // active-sub check
        .mockResolvedValueOnce(null); // any stripe subscription history check
      (
        mockStripeInstance.checkout.sessions.create as jest.Mock
      ).mockResolvedValue(session);

      await service.createCheckoutSession(
        user.id,
        'individual-annual',
        'https://success.com',
        'https://cancel.com',
      );

      expect(mockStripeInstance.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          subscription_data: expect.objectContaining({
            trial_period_days: 30,
            metadata: expect.objectContaining({
              userId: user.id,
              provider: 'stripe',
              trialType: 'first_time_30_days',
              trialReservationKey: expect.any(String) as string,
            }),
          }),
        }),
      );
    });

    it('should NOT include Stripe trial when user already used Stripe trial', async () => {
      const user = createMockUser({
        stripeCustomerId: 'cus_test_123',
        stripeTrialUsedAt: new Date(),
      });
      const session = {
        id: 'cs_test_no_trial_used',
        url: 'https://checkout.stripe.com/test-no-trial-used',
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.subscription.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      (
        mockStripeInstance.checkout.sessions.create as jest.Mock
      ).mockResolvedValue(session);

      await service.createCheckoutSession(
        user.id,
        'individual-annual',
        'https://success.com',
        'https://cancel.com',
      );

      const call = (mockStripeInstance.checkout.sessions.create as jest.Mock)
        .mock.calls[0][0];
      expect(call.subscription_data).toBeUndefined();
    });

    it('should NOT include Stripe trial when user has previous Stripe subscription history', async () => {
      const user = createMockUser({
        stripeCustomerId: 'cus_test_123',
        stripeTrialUsedAt: null,
      });
      const session = {
        id: 'cs_test_no_trial_history',
        url: 'https://checkout.stripe.com/test-no-trial-history',
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.subscription.findFirst
        .mockResolvedValueOnce(null) // active-sub check
        .mockResolvedValueOnce({ id: 'sub_row_1' } as any); // stripe history exists
      (
        mockStripeInstance.checkout.sessions.create as jest.Mock
      ).mockResolvedValue(session);

      await service.createCheckoutSession(
        user.id,
        'individual-annual',
        'https://success.com',
        'https://cancel.com',
      );

      const call = (mockStripeInstance.checkout.sessions.create as jest.Mock)
        .mock.calls[0][0];
      expect(call.subscription_data).toBeUndefined();
    });

    it('should create Stripe customer if missing', async () => {
      const user = createMockUser({ stripeCustomerId: null });
      const customer = createMockStripeCustomer();
      const session = {
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/test',
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.updateMany.mockResolvedValueOnce({ count: 0 } as any);
      mockPrisma.subscription.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      (mockStripeInstance.customers.create as jest.Mock).mockResolvedValue(
        customer,
      );
      (
        mockStripeInstance.checkout.sessions.create as jest.Mock
      ).mockResolvedValue(session);
      mockPrisma.user.update.mockResolvedValue({
        ...user,
        stripeCustomerId: customer.id,
      });

      await service.createCheckoutSession(
        user.id,
        'individual-annual',
        'https://success.com',
        'https://cancel.com',
      );

      expect(mockStripeInstance.customers.create).toHaveBeenCalled();
      expect(mockPrisma.user.update).toHaveBeenCalled();
    });

    it('should block checkout when user already has active subscription', async () => {
      const user = createMockUser();
      const activeSubscription = createMockSubscription({
        userId: user.id,
        status: SubscriptionStatus.ACTIVE,
      });

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.subscription.findFirst.mockResolvedValue(activeSubscription);

      await expect(
        service.createCheckoutSession(
          user.id,
          'individual-annual',
          'https://success.com',
          'https://cancel.com',
        ),
      ).rejects.toThrow(ConflictException);

      expect(
        mockStripeInstance.checkout.sessions.create,
      ).not.toHaveBeenCalled();
    });
  });

  describe('handleWebhookEvent', () => {
    it('should handle checkout.session.completed event', async () => {
      const subscription = createMockStripeSubscription();
      const customer = createMockStripeCustomer();
      const session = {
        id: 'cs_test_123',
        subscription: subscription.id,
      };
      const event = createMockStripeEvent(
        'checkout.session.completed',
        session,
      );

      (
        mockStripeInstance.subscriptions.retrieve as jest.Mock
      ).mockResolvedValue(subscription);
      (mockStripeInstance.customers.retrieve as jest.Mock).mockResolvedValue(
        customer,
      );
      mockPrisma.user.findUnique.mockResolvedValue(createMockUser());
      mockPrisma.subscription.findFirst.mockResolvedValue(null);
      mockPrisma.subscription.create.mockResolvedValue(
        createMockSubscription(),
      );
      mockPrisma.subscriptionUser.create.mockResolvedValue({} as any);
      mockPrisma.linkedAccount.findMany.mockResolvedValue([]);

      await service.handleWebhookEvent(event);

      expect(mockStripeInstance.subscriptions.retrieve).toHaveBeenCalled();
      expect(mockStripeInstance.customers.retrieve).toHaveBeenCalled();
    });

    it('should handle customer.subscription.created event', async () => {
      const subscription = createMockStripeSubscription();
      const event = createMockStripeEvent(
        'customer.subscription.created',
        subscription,
      );

      (mockStripeInstance.customers.retrieve as jest.Mock).mockResolvedValue(
        createMockStripeCustomer(),
      );
      mockPrisma.user.findUnique.mockResolvedValue(createMockUser());
      mockPrisma.subscription.findFirst.mockResolvedValue(null);
      mockPrisma.subscription.create.mockResolvedValue(
        createMockSubscription(),
      );
      mockPrisma.subscriptionUser.create.mockResolvedValue({} as any);
      mockPrisma.linkedAccount.findMany.mockResolvedValue([]);

      await service.handleWebhookEvent(event);

      expect(mockPrisma.subscription.create).toHaveBeenCalled();
    });

    it('marks Stripe trial used immediately when subscription is trialing (idempotent)', async () => {
      const user = createMockUser();
      const subscription = createMockStripeSubscription();
      subscription.status = 'trialing';
      subscription.trial_start = Math.floor(Date.now() / 1000);
      subscription.trial_end = Math.floor(
        (Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000,
      );
      const event = createMockStripeEvent(
        'customer.subscription.created',
        subscription,
      );

      (mockStripeInstance.customers.retrieve as jest.Mock).mockResolvedValue({
        ...createMockStripeCustomer(),
        metadata: { userId: user.id },
        email: user.email,
      });
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.updateMany
        .mockResolvedValueOnce({ count: 1 } as any)
        .mockResolvedValueOnce({ count: 1 } as any)
        .mockResolvedValueOnce({ count: 0 } as any);
      mockPrisma.subscription.findFirst.mockResolvedValue(null);
      mockPrisma.subscription.create.mockResolvedValue(
        createMockSubscription(),
      );
      mockPrisma.subscriptionUser.create.mockResolvedValue({} as any);
      mockPrisma.linkedAccount.findMany.mockResolvedValue([]);

      await service.handleWebhookEvent(event);
      await service.handleWebhookEvent(event); // replay

      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: user.id,
            stripeTrialUsedAt: null,
          }),
          data: expect.objectContaining({
            stripeTrialUsedAt: expect.any(Date) as Date,
            stripeTrialSubscriptionId: subscription.id,
          }),
        }),
      );

      // User trial fields should be updated (but only if empty/false)
      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: user.id,
            trialActive: false,
            trialEndsAt: null,
            trialStartsAt: null,
          }),
          data: expect.objectContaining({
            trialActive: true,
            trialStartsAt: expect.any(Date) as Date,
            trialEndsAt: expect.any(Date) as Date,
            trialTier: 'free_trial',
          }),
        }),
      );
    });

    it('should handle customer.subscription.deleted event', async () => {
      const subscription = createMockStripeSubscription();
      const event = createMockStripeEvent(
        'customer.subscription.deleted',
        subscription,
      );
      const existingSubscription = createMockSubscription();

      mockPrisma.subscription.findFirst.mockResolvedValue(existingSubscription);
      mockPrisma.subscription.update.mockResolvedValue(existingSubscription);

      await service.handleWebhookEvent(event);

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { id: existingSubscription.id },
        data: expect.objectContaining({
          status: SubscriptionStatus.CANCELLED,
        }),
      });
    });

    it('should handle invoice.payment_succeeded event', async () => {
      const subscription = createMockStripeSubscription();
      const invoice = {
        id: 'in_test_123',
        subscription: subscription.id,
      };
      const event = createMockStripeEvent('invoice.payment_succeeded', invoice);

      (
        mockStripeInstance.subscriptions.retrieve as jest.Mock
      ).mockResolvedValue(subscription);
      (mockStripeInstance.customers.retrieve as jest.Mock).mockResolvedValue(
        createMockStripeCustomer(),
      );
      mockPrisma.user.findUnique.mockResolvedValue(createMockUser());
      mockPrisma.subscription.findFirst.mockResolvedValue(null);
      mockPrisma.subscription.create.mockResolvedValue(
        createMockSubscription(),
      );
      mockPrisma.subscriptionUser.create.mockResolvedValue({} as any);
      mockPrisma.linkedAccount.findMany.mockResolvedValue([]);

      await service.handleWebhookEvent(event);

      expect(mockStripeInstance.subscriptions.retrieve).toHaveBeenCalled();
    });
  });
});
