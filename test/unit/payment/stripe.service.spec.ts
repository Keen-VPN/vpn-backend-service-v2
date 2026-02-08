import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StripeService } from '../../../src/payment/stripe/stripe.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TrialService } from '../../../src/subscription/trial.service';
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
      (mockStripeInstance.customers.create as jest.Mock).mockResolvedValue(
        customer,
      );
      (mockStripeInstance.checkout.sessions.create as jest.Mock).mockResolvedValue(
        session,
      );

      const result = await service.createCheckoutSession(
        user.id,
        'individual-annual',
        'https://success.com',
        'https://cancel.com',
      );

      expect(result.url).toBe(session.url);
      expect(mockStripeInstance.checkout.sessions.create).toHaveBeenCalled();
    });

    it('should create Stripe customer if missing', async () => {
      const user = createMockUser({ stripeCustomerId: null });
      const customer = createMockStripeCustomer();
      const session = { id: 'cs_test_123', url: 'https://checkout.stripe.com/test' };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      (mockStripeInstance.customers.create as jest.Mock).mockResolvedValue(
        customer,
      );
      (mockStripeInstance.checkout.sessions.create as jest.Mock).mockResolvedValue(
        session,
      );
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
  });

  describe('handleWebhookEvent', () => {
    it('should handle checkout.session.completed event', async () => {
      const subscription = createMockStripeSubscription();
      const customer = createMockStripeCustomer();
      const session = {
        id: 'cs_test_123',
        subscription: subscription.id,
      };
      const event = createMockStripeEvent('checkout.session.completed', session);

      (mockStripeInstance.subscriptions.retrieve as jest.Mock).mockResolvedValue(
        subscription,
      );
      (mockStripeInstance.customers.retrieve as jest.Mock).mockResolvedValue(
        customer,
      );
      mockPrisma.user.findUnique.mockResolvedValue(createMockUser());
      mockPrisma.subscription.findFirst.mockResolvedValue(null);
      mockPrisma.subscription.create.mockResolvedValue(
        createMockSubscription(),
      );

      await service.handleWebhookEvent(event as any);

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

      await service.handleWebhookEvent(event as any);

      expect(mockPrisma.subscription.create).toHaveBeenCalled();
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

      await service.handleWebhookEvent(event as any);

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { id: existingSubscription.id },
        data: expect.objectContaining({
          status: 'cancelled',
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

      (mockStripeInstance.subscriptions.retrieve as jest.Mock).mockResolvedValue(
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

      await service.handleWebhookEvent(event as any);

      expect(mockStripeInstance.subscriptions.retrieve).toHaveBeenCalled();
    });
  });
});

