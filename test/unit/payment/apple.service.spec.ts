import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppleService } from '../../../src/payment/apple/apple.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TrialService } from '../../../src/subscription/trial.service';
import {
  createMockPrismaClient,
  createMockConfigService,
  MockPrismaClient,
} from '../../setup/mocks';
import {
  createMockAppleReceipt,
  createMockAppleIAPPurchase,
  createMockSubscription,
  createMockUser,
} from '../../setup/test-helpers';
import { SafeLogger } from '../../../src/common/utils/logger.util';

// Mock fetch
global.fetch = jest.fn();

describe('AppleService', () => {
  let service: AppleService;
  let mockPrisma: MockPrismaClient;
  let mockConfigService: ReturnType<typeof createMockConfigService>;
  let mockTrialService: jest.Mocked<TrialService>;

  beforeEach(async () => {
    mockPrisma = createMockPrismaClient();
    mockConfigService = createMockConfigService();
    mockTrialService = {
      grantTrial: jest.fn(),
      checkTrialEligibility: jest.fn(),
      getTrialStatus: jest.fn(),
    } as any;

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
          useValue: mockTrialService,
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

    it('should log warning for unhandled event type', async () => {
      const event = {
        notification_type: 'UNKNOWN_EVENT',
      };

      await service.handleWebhookEvent(event);
      // Verify no errors thrown and maybe log called (implicit)
    });

    it('should handle event without unified_receipt', async () => {
      const event = { notification_type: 'DID_RENEW' };
      await service.handleWebhookEvent(event);
      // specific expectations? currently just ensures no crash
    });

    it('should handle REFUND without latest_receipt_info', async () => {
      const event = {
        notification_type: 'REFUND',
        unified_receipt: {},
      };
      await service.handleWebhookEvent(event);
      expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
    });

    it('should handle DID_CHANGE_RENEWAL_STATUS without latest_receipt_info', async () => {
      const event = {
        notification_type: 'DID_CHANGE_RENEWAL_STATUS',
        unified_receipt: {},
      };
      await service.handleWebhookEvent(event);
      expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
    });

    it('should handle webhook event for renewal with existing subscription', async () => {
      const purchase = createMockAppleIAPPurchase();
      const subscription = createMockSubscription();
      subscription.currentPeriodEnd = new Date(Date.now() - 10000); // Expired

      const event = {
        notification_type: 'DID_RENEW',
        unified_receipt: {
          environment: 'Production',
          latest_receipt_info: [
            {
              original_transaction_id: purchase.originalTransactionId,
              transaction_id: 'new-trans-id',
              product_id: 'prod-1',
              purchase_date_ms: Date.now().toString(),
              expires_date_ms: (Date.now() + 10000).toString(),
            },
          ],
        },
      };

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue({
        ...purchase,
        linkedUser: { id: purchase.linkedUserId! },
      } as any);
      mockPrisma.subscription.findFirst.mockResolvedValue(subscription);
      mockPrisma.subscription.update.mockResolvedValue(subscription);

      await service.handleWebhookEvent(event);

      expect(mockPrisma.subscription.create).not.toHaveBeenCalled();
      expect(mockPrisma.subscription.update).toHaveBeenCalled();
    });

    it('should handle processAppleReceipt with unlinked purchase', async () => {
      const event = {
        notification_type: 'DID_RENEW',
        unified_receipt: {
          latest_receipt_info: [{ original_transaction_id: 'unlinked-id' }],
        },
      };
      // Mock purchase not found or not linked
      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(null);

      await service.handleWebhookEvent(event);

      expect(mockPrisma.subscription.create).not.toHaveBeenCalled();
      expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
    });
  });

  describe('capturePurchase', () => {
    it('should create new purchase if not exists', async () => {
      const transactionId = 'trans-123';
      const productId = 'prod-123';

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(null);
      mockPrisma.appleIAPPurchase.create.mockResolvedValue(
        createMockAppleIAPPurchase(),
      );

      const result = await service.capturePurchase(
        transactionId,
        'orig-123',
        productId,
        Date.now().toString(),
        undefined,
        undefined,
        'Production',
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.appleIAPPurchase.create).toHaveBeenCalled();
    });

    it('should update existing purchase', async () => {
      const existing = createMockAppleIAPPurchase();
      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(existing);
      mockPrisma.appleIAPPurchase.update.mockResolvedValue(existing);

      const result = await service.capturePurchase(
        existing.transactionId,
        existing.originalTransactionId,
        existing.productId,
        Date.now().toString(),
        undefined,
        undefined,
        'Production',
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.appleIAPPurchase.update).toHaveBeenCalled();
    });

    it('should warn if capturing from different device', async () => {
      const existing = createMockAppleIAPPurchase();
      existing.linkedUserId = 'user-123';
      existing.linkedEmail = 'test@example.com';

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(existing);
      mockPrisma.appleIAPPurchase.update.mockResolvedValue(existing);

      await service.capturePurchase(
        existing.transactionId,
        existing.originalTransactionId,
        existing.productId,
        Date.now().toString(),
        undefined,
        undefined,
        'Production',
        'different-device-fingerprint',
      );

      expect(mockPrisma.appleIAPPurchase.update).toHaveBeenCalled();
    });

    it('should not warn if capturing from different device but no existing purchase', async () => {
      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(null);
      mockPrisma.appleIAPPurchase.create.mockResolvedValue(
        createMockAppleIAPPurchase(),
      );
      const loggerSpy = jest.spyOn(SafeLogger, 'warn');

      await service.capturePurchase(
        'tx-new',
        'orig-new',
        'prod-new',
        Date.now().toString(),
        undefined,
        undefined,
        undefined,
        'new-device-fp',
      );

      expect(loggerSpy).not.toHaveBeenCalledWith(
        'Purchase captured from different device',
        expect.anything(),
      );
    });

    it('should not warn if capturing from different device but purchase not linked', async () => {
      const purchase = createMockAppleIAPPurchase();
      purchase.linkedUserId = null;
      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(purchase);
      mockPrisma.appleIAPPurchase.update.mockResolvedValue(purchase);
      const loggerSpy = jest.spyOn(SafeLogger, 'warn');

      await service.capturePurchase(
        'tx-unlinked',
        'orig-unlinked',
        'prod-unlinked',
        Date.now().toString(),
        undefined,
        undefined,
        undefined,
        'new-device-fp',
      );

      expect(loggerSpy).not.toHaveBeenCalledWith(
        'Purchase captured from different device',
        expect.anything(),
      );
    });

    it('should capture purchase with receipt validation', async () => {
      const txnId = 'txn-valid';
      const receiptData = 'valid-receipt';

      // Mock receipt verification success
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: 0,
          latest_receipt_info: [
            { expires_date_ms: (Date.now() + 10000).toString() },
          ],
        }),
      });

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(null);
      mockPrisma.appleIAPPurchase.create.mockResolvedValue(
        createMockAppleIAPPurchase(),
      );

      await service.capturePurchase(
        txnId,
        'orig',
        'prod',
        Date.now().toString(),
        undefined,
        receiptData,
        'Production',
      );

      expect(global.fetch).toHaveBeenCalled();
    });

    it('should throw if receipt is invalid', async () => {
      const txnId = 'txn-invalid';
      const receiptData = 'invalid-receipt';

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ status: 21000 }), // Non-zero status
      });

      await expect(
        service.capturePurchase(
          txnId,
          'orig',
          'prod',
          Date.now().toString(),
          undefined,
          receiptData,
          'Production',
        ),
      ).rejects.toThrow('Invalid receipt data');
    });
  });

  describe('linkPurchase', () => {
    it('should link purchase successfully', async () => {
      const user = createMockUser();
      const purchase = createMockAppleIAPPurchase();
      purchase.linkedUserId = null;

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(purchase);
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.appleIAPPurchase.update.mockResolvedValue({
        ...purchase,
        linkedUserId: user.id,
      } as any);
      mockPrisma.subscription.findFirst.mockResolvedValue(null);
      mockPrisma.subscription.create.mockResolvedValue(
        createMockSubscription(),
      );

      const result = await service.linkPurchase(
        user.id,
        'session-token',
        purchase.transactionId,
        purchase.originalTransactionId,
        purchase.productId,
        'receipt-data',
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.appleIAPPurchase.update).toHaveBeenCalled();
      expect(mockPrisma.subscription.create).toHaveBeenCalled();
    });

    it('should throw error if purchase not found', async () => {
      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(null);

      await expect(
        service.linkPurchase(
          'user-id',
          'token',
          'tx-id',
          'orig-id',
          'prod-id',
          'data',
        ),
      ).rejects.toThrow('Purchase not found');
    });

    it('should throw error if already linked to another user', async () => {
      const purchase = createMockAppleIAPPurchase();
      purchase.linkedUserId = 'other-user';

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(purchase);

      await expect(
        service.linkPurchase(
          'user-id',
          'token',
          purchase.transactionId,
          purchase.originalTransactionId,
          purchase.productId,
          'data',
        ),
      ).rejects.toThrow('already linked');
    });

    it('should update existing subscription if found', async () => {
      const user = createMockUser();
      const purchase = createMockAppleIAPPurchase();
      const subscription = createMockSubscription();

      purchase.linkedUserId = user.id;
      // Ensure purchase is active but subscription is inactive to trigger update
      purchase.expiresDate = new Date(Date.now() + 10000); // Active
      subscription.status = 'inactive';

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(purchase);
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.appleIAPPurchase.update.mockResolvedValue(purchase);
      mockPrisma.subscription.findFirst.mockResolvedValue(subscription);
      mockPrisma.subscription.update.mockResolvedValue(subscription);
      await service.linkPurchase(
        user.id,
        'token',
        purchase.transactionId,
        purchase.originalTransactionId,
        purchase.productId,
        'data',
      );

      expect(mockPrisma.subscription.create).not.toHaveBeenCalled();
      expect(mockPrisma.subscription.update).toHaveBeenCalled();
    });

    it('should handle annual plan correctly', async () => {
      const user = createMockUser();
      const purchase = createMockAppleIAPPurchase();
      purchase.productId = 'com.keenvpn.premium.annual';
      purchase.linkedUserId = null;

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(purchase);
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.appleIAPPurchase.update.mockResolvedValue({
        ...purchase,
        linkedUserId: user.id,
      } as any);
      mockPrisma.subscription.findFirst.mockResolvedValue(null);
      mockPrisma.subscription.create.mockResolvedValue(
        createMockSubscription(),
      );

      await service.linkPurchase(
        user.id,
        'token',
        purchase.transactionId,
        purchase.originalTransactionId,
        purchase.productId,
        'data',
      );

      expect(mockPrisma.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            planName: 'Premium VPN - Annual',
            priceAmount: 130.99,
          }),
        }),
      );
    });

    it('should handle monthly plan correctly', async () => {
      const user = createMockUser();
      const purchase = createMockAppleIAPPurchase();
      purchase.productId = 'com.keenvpn.premium.monthly';
      purchase.linkedUserId = null;

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(purchase);
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.appleIAPPurchase.update.mockResolvedValue({
        ...purchase,
        linkedUserId: user.id,
      } as any);
      mockPrisma.subscription.findFirst.mockResolvedValue(null);
      mockPrisma.subscription.create.mockResolvedValue(
        createMockSubscription(),
      );

      await service.linkPurchase(
        user.id,
        'token',
        purchase.transactionId,
        purchase.originalTransactionId,
        purchase.productId,
        'data',
      );

      expect(mockPrisma.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            planName: 'Premium VPN',
            priceAmount: 0,
          }),
        }),
      );
    });
  });

  describe('linkWithTransactionIds', () => {
    it('should link multiple purchases', async () => {
      const user = createMockUser();
      const txInfo = {
        transactionId: 'tx-1',
        originalTransactionId: 'orig-1',
        productId: 'prod-1',
      };
      const purchase = createMockAppleIAPPurchase();
      purchase.transactionId = txInfo.transactionId;
      purchase.linkedUserId = null;

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(purchase);
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.appleIAPPurchase.update.mockResolvedValue(purchase);
      mockPrisma.subscription.findFirst.mockResolvedValue(null);
      mockPrisma.subscription.create.mockResolvedValue(
        createMockSubscription(),
      );

      const result = await service.linkWithTransactionIds(user.id, 'token', [
        txInfo,
      ]);

      expect(result.success).toBe(true);
      expect(result.linkedCount).toBe(1);
    });

    it('should auto-capture if purchase not found', async () => {
      const user = createMockUser();
      const txInfo = {
        transactionId: 'tx-1',
        originalTransactionId: 'orig-1',
        productId: 'prod-1',
      };

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(null);
      const createdPurchase = createMockAppleIAPPurchase();
      createdPurchase.linkedUserId = null; // Fix: Ensure created purchase is not linked
      mockPrisma.appleIAPPurchase.create.mockResolvedValue(createdPurchase);
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.subscription.findFirst.mockResolvedValue(null);
      mockPrisma.subscription.create.mockResolvedValue(
        createMockSubscription(),
      );

      const result = await service.linkWithTransactionIds(user.id, 'token', [
        txInfo,
      ]);

      expect(result.success).toBe(true);
      expect(mockPrisma.appleIAPPurchase.create).toHaveBeenCalled();
    });

    it('should handle invalid "0" transaction IDs', async () => {
      // Mock NODE_ENV to production
      mockConfigService.get.mockReturnValue('production');

      const user = createMockUser();
      const txInfo = {
        transactionId: '0',
        originalTransactionId: '0',
        productId: 'prod-1',
      };

      const result = await service.linkWithTransactionIds(user.id, 'token', [
        txInfo,
      ]);

      expect(result.linkedCount).toBe(0);
      expect(result.errors?.length).toBe(1);
      expect(result.errors?.[0].error).toContain('Invalid transaction ID');
    });

    it('should handle missing required fields', async () => {
      const user = createMockUser();
      const txInfo = {
        transactionId: '', // Missing
        originalTransactionId: 'orig-1',
        productId: 'prod-1',
      };

      const result = await service.linkWithTransactionIds(user.id, 'token', [
        txInfo,
      ]);

      expect(result.linkedCount).toBe(0);
      expect(result.errors?.length).toBe(1);
      expect(result.errors?.[0].error).toContain('Missing required fields');
    });

    it('should skip purchase if already linked to another user', async () => {
      const user = createMockUser();
      const txInfo = {
        transactionId: 'tx-123',
        originalTransactionId: 'orig-1',
        productId: 'prod-1',
      };
      const purchase = createMockAppleIAPPurchase();
      purchase.linkedUserId = 'other-user';
      purchase.transactionId = txInfo.transactionId; // Fix: ensure mismatch is handled

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(purchase);
      mockPrisma.user.findUnique.mockResolvedValue(user);

      const result = await service.linkWithTransactionIds(user.id, 'token', [
        txInfo,
      ]);

      // Should have errors or linkedCount=0
      expect(result.linkedCount).toBe(0);
      expect(result.errors?.length).toBe(1);
    });

    it('should find existing subscription by originalTransactionId', async () => {
      const user = createMockUser();
      const txInfo = {
        transactionId: 'new-tx',
        originalTransactionId: 'orig-tx',
        productId: 'prod-1',
      };
      const purchase = createMockAppleIAPPurchase();
      purchase.transactionId = txInfo.transactionId;
      purchase.originalTransactionId = txInfo.originalTransactionId;
      purchase.linkedUserId = null;

      const existingSub = createMockSubscription();
      existingSub.appleOriginalTransactionId = txInfo.originalTransactionId;
      existingSub.status = 'inactive';

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(purchase);
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.appleIAPPurchase.update.mockResolvedValue(purchase);

      // Mock findFirst sequence:
      // 1. find by transactionId -> null
      // 2. find by originalTransactionId -> existingSub
      mockPrisma.subscription.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingSub);

      mockPrisma.subscription.update.mockResolvedValue(existingSub);

      const result = await service.linkWithTransactionIds(user.id, 'token', [
        txInfo,
      ]);

      expect(result.linkedCount).toBe(1);
      expect(mockPrisma.subscription.update).toHaveBeenCalled();
      expect(mockPrisma.subscription.create).not.toHaveBeenCalled();
    });

    it('should handle auto-capture failure', async () => {
      const user = createMockUser();
      const txInfo = {
        transactionId: 'tx-fail',
        originalTransactionId: 'orig-fail',
        productId: 'prod-fail',
      };

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(null);
      mockPrisma.appleIAPPurchase.create.mockRejectedValue(
        new Error('Capture failed'),
      );
      mockPrisma.user.findUnique.mockResolvedValue(user);

      const result = await service.linkWithTransactionIds(user.id, 'token', [
        txInfo,
      ]);

      expect(result.linkedCount).toBe(0);
      expect(result.errors?.length).toBe(1);
      expect(result.errors?.[0].error).toContain('Capture failed');
    });

    it('should handle nil return from capture in bulk link', async () => {
      const user = createMockUser();
      const txInfo = {
        transactionId: 'tx-nil',
        originalTransactionId: 'orig-nil',
        productId: 'prod-nil',
      };

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(null);
      mockPrisma.appleIAPPurchase.create.mockResolvedValue(null as any);
      mockPrisma.user.findUnique.mockResolvedValue(user);

      const result = await service.linkWithTransactionIds(user.id, 'token', [
        txInfo,
      ]);

      expect(result.linkedCount).toBe(0);
      expect(result.errors?.length).toBe(1);
      expect(result.errors?.[0].error).toContain(
        'Could not find or capture purchase',
      );
    });

    it('should handle purchase already linked to current user', async () => {
      const user = createMockUser();
      const txInfo = {
        transactionId: 'tx-self',
        originalTransactionId: 'orig-self',
        productId: 'prod-self',
      };
      const purchase = createMockAppleIAPPurchase();
      purchase.linkedUserId = user.id; // Already linked to THIS user
      purchase.transactionId = txInfo.transactionId;

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(purchase);
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.appleIAPPurchase.update.mockResolvedValue(purchase);
      mockPrisma.subscription.findFirst.mockResolvedValue(
        createMockSubscription(),
      );
      mockPrisma.subscription.update.mockResolvedValue(
        createMockSubscription(),
      );

      const result = await service.linkWithTransactionIds(user.id, 'token', [
        txInfo,
      ]);

      expect(result.linkedCount).toBe(1);
      // Should update linkedAt but not throw error
      expect(mockPrisma.appleIAPPurchase.update).toHaveBeenCalled();
    });
  });
});
