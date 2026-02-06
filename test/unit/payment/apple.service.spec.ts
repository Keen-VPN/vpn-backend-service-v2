import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppleService } from '../../../src/payment/apple/apple.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import {
  createMockPrismaClient,
  createMockConfigService,
  createMockTrialService,
  MockPrismaClient,
} from '../../setup/mocks';
import { TrialService } from '../../../src/subscription/trial.service';
import {
  createMockAppleReceipt,
  createMockAppleIAPPurchase,
  createMockSubscription,
} from '../../setup/test-helpers';

// Mock fetch
global.fetch = jest.fn();

describe('AppleService', () => {
  let service: AppleService;
  let mockPrisma: MockPrismaClient;
  let mockConfigService: ReturnType<typeof createMockConfigService>;

  beforeEach(async () => {
    mockPrisma = createMockPrismaClient();
    mockConfigService = createMockConfigService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppleService,
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
          useValue: createMockTrialService(),
        },
      ],
    }).compile();

    service = module.get<AppleService>(AppleService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('verifyReceipt', () => {
    it('should verify production receipt successfully', async () => {
      const receiptData = 'base64-receipt-data';
      const receiptResult = createMockAppleReceipt();

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(receiptResult),
      });

      const result = await service.verifyReceipt(receiptData);

      expect(result.status).toBe(0);
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should fallback to sandbox on status 21007', async () => {
      const receiptData = 'base64-receipt-data';
      const sandboxResult = createMockAppleReceipt();

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ status: 21007 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(sandboxResult),
        });

      const result = await service.verifyReceipt(receiptData);

      expect(result.status).toBe(0);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleWebhookEvent', () => {
    it('should handle REFUND event', async () => {
      const purchase = createMockAppleIAPPurchase();
      const event = {
        notification_type: 'REFUND',
        unified_receipt: {
          latest_receipt_info: [
            {
              original_transaction_id: purchase.originalTransactionId,
            },
          ],
        },
      };

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue({
        ...purchase,
        linkedUser: { id: purchase.linkedUserId! },
      } as any);
      mockPrisma.subscription.findFirst.mockResolvedValue(
        createMockSubscription(),
      );
      mockPrisma.subscription.update.mockResolvedValue(
        createMockSubscription(),
      );

      await service.handleWebhookEvent(event);

      expect(mockPrisma.subscription.update).toHaveBeenCalled();
    });

    it('should handle DID_RENEW event', async () => {
      const purchase = createMockAppleIAPPurchase();
      const event = {
        notification_type: 'DID_RENEW',
        unified_receipt: {
          environment: 'Production',
          latest_receipt_info: [
            {
              original_transaction_id: purchase.originalTransactionId,
              transaction_id: 'new-transaction-id',
              product_id: 'com.keenvpn.premium.annual',
              purchase_date_ms: Date.now().toString(),
              expires_date_ms: (
                Date.now() +
                365 * 24 * 60 * 60 * 1000
              ).toString(),
            },
          ],
        },
      };

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue({
        ...purchase,
        linkedUser: { id: purchase.linkedUserId! },
      } as any);
      mockPrisma.subscription.findFirst.mockResolvedValue(null);
      mockPrisma.subscription.create.mockResolvedValue(
        createMockSubscription(),
      );

      await service.handleWebhookEvent(event);

      expect(mockPrisma.subscription.create).toHaveBeenCalled();
    });

    it('should handle DID_CHANGE_RENEWAL_STATUS event', async () => {
      const purchase = createMockAppleIAPPurchase();
      const subscription = createMockSubscription();
      const event = {
        notification_type: 'DID_CHANGE_RENEWAL_STATUS',
        auto_renew_status: false,
        unified_receipt: {
          latest_receipt_info: [
            {
              original_transaction_id: purchase.originalTransactionId,
            },
          ],
        },
      };

      mockPrisma.subscription.findFirst.mockResolvedValue(subscription);
      mockPrisma.subscription.update.mockResolvedValue(subscription);

      await service.handleWebhookEvent(event);

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { id: subscription.id },
        data: { cancelAtPeriodEnd: true },
      });
    });
  });
});
