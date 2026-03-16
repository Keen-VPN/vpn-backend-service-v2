import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StripeWebhookController } from '../../../src/payment/stripe/stripe.webhook.controller';
import { StripeService } from '../../../src/payment/stripe/stripe.service';
import { FirebaseConfig } from '../../../src/config/firebase.config';
import { SessionAuthGuard } from '../../../src/auth/guards/session-auth.guard';
import {
  createMockConfigService,
  createMockStripe,
  createMockFirebaseConfig,
} from '../../setup/mocks';
import { createMockStripeEvent } from '../../setup/test-helpers';
import Stripe from 'stripe';

// Mock Stripe - we'll create the mock instance in beforeEach

// Mock Stripe module
const mockStripeInstance = createMockStripe();
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => mockStripeInstance);
});

describe('StripeWebhookController', () => {
  let controller: StripeWebhookController;
  let stripeService: jest.Mocked<StripeService>;
  let mockConfigService: ReturnType<typeof createMockConfigService>;

  beforeEach(async () => {
    const mockStripeService = {
      handleWebhookEvent: jest.fn(),
      createCheckoutSession: jest.fn(),
      createCustomerPortalSession: jest.fn(),
      getCustomerIdByUserId: jest.fn(),
    };

    mockConfigService = createMockConfigService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        {
          provide: StripeService,
          useValue: mockStripeService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: FirebaseConfig,
          useValue: createMockFirebaseConfig(),
        },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({
        canActivate: jest.fn((context) => {
          const request = context.switchToHttp().getRequest();
          request.user = { uid: 'user-123' };
          return true;
        }),
      })
      .compile();

    controller = module.get<StripeWebhookController>(StripeWebhookController);
    stripeService = module.get(StripeService);
    // Replace internal stripe instance with mock
    Object.defineProperty(controller, 'stripe', {
      value: mockStripeInstance,
      writable: true,
    });
    Object.defineProperty(controller, 'webhookSecret', {
      value: 'whsec_test',
      writable: true,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /payment/stripe/webhook', () => {
    it('should process webhook with valid signature', async () => {
      const event = createMockStripeEvent('customer.subscription.created', {});
      const mockReq = {
        headers: { 'stripe-signature': 'valid-signature' },
        rawBody: Buffer.from(JSON.stringify(event)),
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        send: jest.fn(),
      };

      (mockStripeInstance.webhooks.constructEvent as jest.Mock).mockReturnValue(
        event,
      );
      stripeService.handleWebhookEvent.mockResolvedValue(undefined);

      await controller.handleWebhook(mockReq as any, mockRes as any);

      expect(mockStripeInstance.webhooks.constructEvent).toHaveBeenCalled();
      expect(stripeService.handleWebhookEvent).toHaveBeenCalledWith(event);
      expect(mockRes.json).toHaveBeenCalledWith({ received: true });
    });

    it('should return 400 for invalid signature', async () => {
      const mockReq = {
        headers: { 'stripe-signature': 'invalid-signature' },
        rawBody: Buffer.from('{}'),
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      (
        mockStripeInstance.webhooks.constructEvent as jest.Mock
      ).mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      await controller.handleWebhook(mockReq as any, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('should return 400 for missing signature', async () => {
      const mockReq = {
        headers: {},
        rawBody: Buffer.from('{}'),
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await controller.handleWebhook(mockReq as any, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('POST /payment/stripe/checkout', () => {
    it('should create checkout session', async () => {
      const session = {
        url: 'https://checkout.stripe.com/test',
        id: 'cs_test',
      };
      const mockReq = {
        body: {
          userId: 'user-123',
          planId: 'individual-annual',
          successUrl: 'https://success.com',
          cancelUrl: 'https://cancel.com',
        },
      };

      stripeService.createCheckoutSession.mockResolvedValue(session as any);

      const result = await controller.createCheckout(mockReq as any, {
        uid: 'user-123',
      });

      expect(result.url).toBe(session.url);
      expect(stripeService.createCheckoutSession).toHaveBeenCalled();
    });
  });

  describe('POST /payment/stripe/portal', () => {
    it('should create portal session', async () => {
      const session = { url: 'https://billing.stripe.com/test' };
      const mockReq = {
        body: {
          customerId: 'cus_test',
          returnUrl: 'https://return.com',
        },
      };

      stripeService.getCustomerIdByUserId.mockResolvedValue('cus_test');
      stripeService.createCustomerPortalSession.mockResolvedValue(
        session as any,
      );

      const result = await controller.createPortal(mockReq as any, {
        uid: 'user-123',
      });

      expect(result.url).toBe(session.url);
    });
  });
});
