import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import {
  createMockPrismaClient,
  createMockFirebaseConfig,
  createMockConfigService,
  createMockStripe,
  MockPrismaClient,
  MockStripe,
} from '../setup/mocks';
import {
  createMockUser,
  createMockSubscription,
  createMockStripeEvent,
  createMockStripeCustomer,
  createMockStripeSubscription,
  createMockAppleReceipt,
} from '../setup/test-helpers';
import { PrismaService } from '../../src/prisma/prisma.service';
import { FirebaseConfig } from '../../src/config/firebase.config';
import { ConfigService } from '@nestjs/config';
// Mock Stripe module
const mockStripeInstance = createMockStripe();
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => mockStripeInstance);
});

// Mock fetch
global.fetch = jest.fn();

describe('Payment (e2e)', () => {
  let app: INestApplication;
  let mockPrisma: MockPrismaClient;

  beforeEach(async () => {
    mockPrisma = createMockPrismaClient();
    const mockFirebaseConfig = createMockFirebaseConfig();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(FirebaseConfig)
      .useValue(mockFirebaseConfig)
      .overrideProvider(ConfigService)
      .useValue(createMockConfigService())
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /payment/stripe/webhook', () => {
    it('should process webhook with valid signature', async () => {
      const subscription = createMockStripeSubscription();
      const customer = createMockStripeCustomer();
      const event = createMockStripeEvent('customer.subscription.created', subscription);
      const signature = 'valid-signature';

      (mockStripeInstance.webhooks.constructEvent as jest.Mock).mockReturnValue(
        event,
      );
      (mockStripeInstance.customers.retrieve as jest.Mock).mockResolvedValue(
        customer,
      );
      mockPrisma.user.findUnique.mockResolvedValue(createMockUser());
      mockPrisma.subscription.findFirst.mockResolvedValue(null);
      mockPrisma.subscription.create.mockResolvedValue(
        createMockSubscription(),
      );

      const response = await request(app.getHttpServer())
        .post('/payment/stripe/webhook')
        .set('stripe-signature', signature)
        .send(Buffer.from(JSON.stringify(event)))
        .expect(200);

      expect(response.body.received).toBe(true);
    });

    it('should return 400 for invalid signature', async () => {
      (mockStripeInstance.webhooks.constructEvent as jest.Mock).mockImplementation(
        () => {
          throw new Error('Invalid signature');
        },
      );

      await request(app.getHttpServer())
        .post('/payment/stripe/webhook')
        .set('stripe-signature', 'invalid-signature')
        .send({})
        .expect(400);
    });
  });

  describe('POST /payment/apple/receipt', () => {
    it('should verify receipt successfully', async () => {
      const receiptData = 'base64-receipt-data';
      const receiptResult = createMockAppleReceipt();

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(receiptResult),
      });

      const response = await request(app.getHttpServer())
        .post('/payment/apple/receipt')
        .send({ receiptData })
        .expect(200);

      expect(response.body.status).toBe(0);
    });

    it('should return error if receiptData is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/payment/apple/receipt')
        .send({})
        .expect(200);

      expect(response.body.error).toBe('receiptData is required');
    });
  });

  describe('POST /payment/apple/webhook', () => {
    it('should process webhook event', async () => {
      const event = {
        notification_type: 'DID_RENEW',
        unified_receipt: {},
      };

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .post('/payment/apple/webhook')
        .send(event)
        .expect(200);

      expect(response.body.received).toBe(true);
    });
  });
});

