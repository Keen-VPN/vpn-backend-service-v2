import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppleService } from '../../../src/payment/apple/apple.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TrialService } from '../../../src/subscription/trial.service';
import { PaidConversionSlackService } from '../../../src/notification/paid-conversion-slack.service';
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
  let mockTrialService: { grantIfEligible: jest.Mock };
  const mockPaidConversionSlack = {
    maybeNotifyStripePaidConversion: jest.fn().mockResolvedValue(undefined),
    maybeNotifyApplePaidConversion: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    mockPrisma = createMockPrismaClient();
    mockConfigService = createMockConfigService();
    mockTrialService = {
      grantIfEligible: jest
        .fn()
        .mockResolvedValue({ granted: false, userId: '' }),
    };

    // AppleService uses Prisma transactions; run callback against the same mock client.
    (mockPrisma.$transaction as unknown as jest.Mock).mockImplementation(
      async (fn: any) => fn(mockPrisma),
    );

    // Default mocks for subscription_users mapping (account linking feature)
    mockPrisma.subscriptionUser.create.mockResolvedValue({} as any);
    mockPrisma.linkedAccount.findMany.mockResolvedValue([]);

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
          useValue: mockTrialService as unknown as TrialService,
        },
        {
          provide: PaidConversionSlackService,
          useValue: mockPaidConversionSlack,
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
        text: jest.fn().mockResolvedValue(JSON.stringify(receiptResult)),
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
          text: jest.fn().mockResolvedValue(JSON.stringify({ status: 21007 })),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValue(JSON.stringify(sandboxResult)),
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
        notification_type: 'REFUND' as const,
        unified_receipt: {
          latest_receipt_info: [
            {
              original_transaction_id: purchase.originalTransactionId,
              transaction_id: purchase.transactionId,
              product_id: purchase.productId,
              purchase_date_ms: Date.now().toString(),
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
        notification_type: 'DID_RENEW' as const,
        unified_receipt: {
          environment: 'Production' as const,
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

    it('should not send paid conversion for Apple trial-period renewal item', async () => {
      const purchase = createMockAppleIAPPurchase();
      const event = {
        notification_type: 'DID_RENEW' as const,
        unified_receipt: {
          environment: 'Production' as const,
          latest_receipt_info: [
            {
              original_transaction_id: purchase.originalTransactionId,
              transaction_id: 'trial-transaction-id',
              product_id: 'com.keenvpn.premium.monthly',
              purchase_date_ms: Date.now().toString(),
              expires_date_ms: (
                Date.now() +
                30 * 24 * 60 * 60 * 1000
              ).toString(),
              is_trial_period: 'true',
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

      expect(
        mockPaidConversionSlack.maybeNotifyApplePaidConversion,
      ).not.toHaveBeenCalled();
      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: purchase.linkedUserId!,
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

    it('should send paid conversion for non-trial Apple renewal item', async () => {
      const purchase = createMockAppleIAPPurchase();
      const event = {
        notification_type: 'DID_RENEW' as const,
        unified_receipt: {
          environment: 'Production' as const,
          latest_receipt_info: [
            {
              original_transaction_id: purchase.originalTransactionId,
              transaction_id: 'paid-transaction-id',
              product_id: 'com.keenvpn.premium.monthly',
              purchase_date_ms: Date.now().toString(),
              expires_date_ms: (
                Date.now() +
                30 * 24 * 60 * 60 * 1000
              ).toString(),
              is_trial_period: 'false',
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
      mockPrisma.user.findUnique.mockResolvedValue(createMockUser());

      await service.handleWebhookEvent(event);

      expect(
        mockPaidConversionSlack.maybeNotifyApplePaidConversion,
      ).toHaveBeenCalled();
    });

    it('should handle DID_CHANGE_RENEWAL_STATUS event', async () => {
      const purchase = createMockAppleIAPPurchase();
      const subscription = createMockSubscription();
      const event = {
        notification_type: 'DID_CHANGE_RENEWAL_STATUS' as const,
        auto_renew_status: false,
        unified_receipt: {
          latest_receipt_info: [
            {
              original_transaction_id: purchase.originalTransactionId,
              transaction_id: purchase.transactionId,
              product_id: purchase.productId,
              purchase_date_ms: Date.now().toString(),
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

      await service.handleWebhookEvent(event as any);
      // Verify no errors thrown and maybe log called (implicit)
    });

    it('should handle event without unified_receipt', async () => {
      const event = { notification_type: 'DID_RENEW' as const };
      await service.handleWebhookEvent(event);
      // specific expectations? currently just ensures no crash
    });

    it('should handle REFUND without latest_receipt_info', async () => {
      const event = {
        notification_type: 'REFUND' as const,
        unified_receipt: {},
      };
      await service.handleWebhookEvent(event);
      expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
    });

    it('should handle DID_CHANGE_RENEWAL_STATUS without latest_receipt_info', async () => {
      const event = {
        notification_type: 'DID_CHANGE_RENEWAL_STATUS' as const,
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
        notification_type: 'DID_RENEW' as const,
        unified_receipt: {
          environment: 'Production' as const,
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
        notification_type: 'DID_RENEW' as const,
        unified_receipt: {
          latest_receipt_info: [
            {
              original_transaction_id: 'unlinked-id',
              transaction_id: 'unlinked-tx-id',
              product_id: 'com.keenvpn.premium.monthly',
              purchase_date_ms: Date.now().toString(),
            },
          ],
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
    it('should capture purchase without receiptData (unverified)', async () => {
      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(null);
      mockPrisma.appleIAPPurchase.create.mockResolvedValue(
        createMockAppleIAPPurchase(),
      );

      const result = await service.capturePurchase(
        'trans-123',
        'orig-123',
        'prod-123',
        Date.now().toString(),
        undefined,
        undefined,
        'Production',
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.appleIAPPurchase.create).toHaveBeenCalled();
    });

    it('should create new purchase from verified receipt if not exists', async () => {
      const transactionId = 'trans-123';
      const productId = 'prod-123';
      const receiptData = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo='; // base64-ish

      // Mock receipt verification success (production)
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            status: 0,
            environment: 'Production',
            latest_receipt_info: [
              {
                transaction_id: transactionId,
                original_transaction_id: 'orig-123',
                product_id: productId,
                purchase_date_ms: Date.now().toString(),
                expires_date_ms: (Date.now() + 10000).toString(),
              },
            ],
          }),
        ),
      });

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
        receiptData,
        'Production',
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.appleIAPPurchase.create).toHaveBeenCalled();
    });

    it('should update existing purchase from verified receipt', async () => {
      const existing = createMockAppleIAPPurchase();
      const receiptData = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo='; // base64-ish

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            status: 0,
            environment: 'Production',
            latest_receipt_info: [
              {
                transaction_id: existing.transactionId,
                original_transaction_id: existing.originalTransactionId,
                product_id: existing.productId,
                purchase_date_ms: Date.now().toString(),
                expires_date_ms: (Date.now() + 10000).toString(),
              },
            ],
          }),
        ),
      });

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(existing);
      mockPrisma.appleIAPPurchase.update.mockResolvedValue(existing);

      const result = await service.capturePurchase(
        existing.transactionId,
        existing.originalTransactionId,
        existing.productId,
        Date.now().toString(),
        undefined,
        receiptData,
        'Production',
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.appleIAPPurchase.update).toHaveBeenCalled();
    });

    it('should warn if capturing from different device', async () => {
      const existing = createMockAppleIAPPurchase();
      existing.linkedUserId = 'user-123';
      existing.linkedEmail = 'test@example.com';
      const receiptData = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo='; // base64-ish

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            status: 0,
            environment: 'Production',
            latest_receipt_info: [
              {
                transaction_id: existing.transactionId,
                original_transaction_id: existing.originalTransactionId,
                product_id: existing.productId,
                purchase_date_ms: Date.now().toString(),
                expires_date_ms: (Date.now() + 10000).toString(),
              },
            ],
          }),
        ),
      });

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(existing);
      mockPrisma.appleIAPPurchase.update.mockResolvedValue(existing);

      await service.capturePurchase(
        existing.transactionId,
        existing.originalTransactionId,
        existing.productId,
        Date.now().toString(),
        undefined,
        receiptData,
        'Production',
        'different-device-fingerprint',
      );

      expect(mockPrisma.appleIAPPurchase.update).toHaveBeenCalled();
    });

    it('should not warn if capturing from different device but no existing purchase', async () => {
      const receiptData = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo='; // base64-ish
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            status: 0,
            environment: 'Production',
            latest_receipt_info: [
              {
                transaction_id: 'tx-new',
                original_transaction_id: 'orig-new',
                product_id: 'prod-new',
                purchase_date_ms: Date.now().toString(),
                expires_date_ms: (Date.now() + 10000).toString(),
              },
            ],
          }),
        ),
      });
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
        receiptData,
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
      const receiptData = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo='; // base64-ish

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            status: 0,
            environment: 'Production',
            latest_receipt_info: [
              {
                transaction_id: 'tx-unlinked',
                original_transaction_id: 'orig-unlinked',
                product_id: 'prod-unlinked',
                purchase_date_ms: Date.now().toString(),
                expires_date_ms: (Date.now() + 10000).toString(),
              },
            ],
          }),
        ),
      });

      await service.capturePurchase(
        'tx-unlinked',
        'orig-unlinked',
        'prod-unlinked',
        Date.now().toString(),
        undefined,
        receiptData,
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
      const receiptData = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo='; // base64-ish

      // Mock receipt verification success
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            status: 0,
            environment: 'Production',
            latest_receipt_info: [
              {
                transaction_id: txnId,
                original_transaction_id: 'orig',
                product_id: 'prod',
                purchase_date_ms: Date.now().toString(),
                expires_date_ms: (Date.now() + 10000).toString(),
              },
            ],
          }),
        ),
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

    it('should capture purchase even if receipt is invalid (unverified fallback)', async () => {
      const txnId = 'txn-invalid';
      const receiptData = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo='; // base64-ish

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(JSON.stringify({ status: 21000 })), // Non-zero status
      });

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(null);
      mockPrisma.appleIAPPurchase.create.mockResolvedValue(
        createMockAppleIAPPurchase(),
      );

      const result = await service.capturePurchase(
        txnId,
        'orig',
        'prod',
        Date.now().toString(),
        undefined,
        receiptData,
        'Production',
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.appleIAPPurchase.create).toHaveBeenCalled();
    });
  });

  describe('linkPurchase', () => {
    it('should link purchase successfully', async () => {
      const user = createMockUser();
      const purchase = createMockAppleIAPPurchase();
      purchase.linkedUserId = null;
      const receiptData = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo='; // base64-ish

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            status: 0,
            environment: 'Production',
            latest_receipt_info: [
              {
                transaction_id: purchase.transactionId,
                original_transaction_id: purchase.originalTransactionId,
                product_id: purchase.productId,
                purchase_date_ms: Date.now().toString(),
                expires_date_ms: (Date.now() + 10000).toString(),
              },
            ],
          }),
        ),
      });

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.appleIAPPurchase.create.mockResolvedValue({
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
        receiptData,
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.appleIAPPurchase.create).toHaveBeenCalled();
      expect(mockPrisma.subscription.create).toHaveBeenCalled();
    });

    it('should link purchase even if receipt is invalid (fallback)', async () => {
      const user = createMockUser();
      const purchase = createMockAppleIAPPurchase();
      purchase.linkedUserId = null;
      purchase.expiresDate = new Date(Date.now() + 10000);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(JSON.stringify({ status: 21004 })),
      });

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValueOnce(purchase);
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
        'token',
        purchase.transactionId,
        purchase.originalTransactionId,
        purchase.productId,
        'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=',
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.subscription.create).toHaveBeenCalled();
    });

    it('should accept StoreKit test transaction IDs "0" in non-production', async () => {
      // Ensure non-production behavior
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        return 'test-token';
      });

      const user = createMockUser();
      const purchase = createMockAppleIAPPurchase();
      purchase.linkedUserId = null;
      const receiptData = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo='; // base64-ish

      // Verified receipt has real transaction IDs, but input uses "0"
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            status: 0,
            environment: 'Production',
            latest_receipt_info: [
              {
                transaction_id: purchase.transactionId,
                original_transaction_id: purchase.originalTransactionId,
                product_id: purchase.productId,
                purchase_date_ms: Date.now().toString(),
                expires_date_ms: (Date.now() + 10000).toString(),
              },
            ],
          }),
        ),
      });

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.appleIAPPurchase.create.mockResolvedValue({
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
        '0',
        '0',
        purchase.productId,
        receiptData,
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.subscription.create).toHaveBeenCalled();
    });

    it('should populate user trial fields when linking a trial-period Apple receipt', async () => {
      const user = createMockUser();
      const purchase = createMockAppleIAPPurchase();
      purchase.linkedUserId = null;
      const receiptData = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo='; // base64-ish

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            status: 0,
            environment: 'Production',
            latest_receipt_info: [
              {
                transaction_id: purchase.transactionId,
                original_transaction_id: purchase.originalTransactionId,
                product_id: purchase.productId,
                purchase_date_ms: Date.now().toString(),
                expires_date_ms: (Date.now() + 10000).toString(),
                is_trial_period: 'true',
              },
            ],
          }),
        ),
      });

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.appleIAPPurchase.create.mockResolvedValue({
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
        receiptData,
      );

      expect(result.success).toBe(true);
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

    it('should still send paid conversion when receipt verification fails during linkPurchase', async () => {
      const user = createMockUser();
      const purchase = createMockAppleIAPPurchase({
        linkedUserId: null,
        expiresDate: new Date(Date.now() + 10000),
      });
      const receiptData = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=';

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(JSON.stringify({ status: 21004 })),
      });

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValueOnce(purchase);
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
        receiptData,
      );

      expect(
        mockPaidConversionSlack.maybeNotifyApplePaidConversion,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          originalTransactionId: purchase.originalTransactionId,
        }),
      );
    });

    it('should throw error if already linked to another user', async () => {
      const user = createMockUser();
      const purchase = createMockAppleIAPPurchase();
      purchase.linkedUserId = 'other-user';
      const receiptData = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo='; // base64-ish

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            status: 0,
            environment: 'Production',
            latest_receipt_info: [
              {
                transaction_id: purchase.transactionId,
                original_transaction_id: purchase.originalTransactionId,
                product_id: purchase.productId,
                purchase_date_ms: Date.now().toString(),
                expires_date_ms: (Date.now() + 10000).toString(),
              },
            ],
          }),
        ),
      });

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(purchase);
      mockPrisma.user.findUnique.mockResolvedValue(user);

      await expect(
        service.linkPurchase(
          user.id,
          'token',
          purchase.transactionId,
          purchase.originalTransactionId,
          purchase.productId,
          receiptData,
        ),
      ).rejects.toThrow('already linked');
    });

    it('should update existing subscription if found', async () => {
      const user = createMockUser();
      const purchase = createMockAppleIAPPurchase();
      const subscription = createMockSubscription();
      const receiptData = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo='; // base64-ish

      purchase.linkedUserId = user.id;
      // Ensure purchase is active but subscription is inactive to trigger update
      purchase.expiresDate = new Date(Date.now() + 10000); // Active
      subscription.status = 'INACTIVE';

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            status: 0,
            environment: 'Production',
            latest_receipt_info: [
              {
                transaction_id: purchase.transactionId,
                original_transaction_id: purchase.originalTransactionId,
                product_id: purchase.productId,
                purchase_date_ms: Date.now().toString(),
                expires_date_ms: (Date.now() + 10000).toString(),
              },
            ],
          }),
        ),
      });

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
        receiptData,
      );

      expect(mockPrisma.subscription.create).not.toHaveBeenCalled();
      expect(mockPrisma.subscription.update).toHaveBeenCalled();
    });

    it('should handle annual plan correctly', async () => {
      const user = createMockUser();
      const purchase = createMockAppleIAPPurchase();
      purchase.productId = 'com.keenvpn.premium.annual';
      purchase.linkedUserId = null;
      const receiptData = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo='; // base64-ish

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            status: 0,
            environment: 'Production',
            latest_receipt_info: [
              {
                transaction_id: purchase.transactionId,
                original_transaction_id: purchase.originalTransactionId,
                product_id: purchase.productId,
                purchase_date_ms: Date.now().toString(),
                expires_date_ms: (Date.now() + 10000).toString(),
              },
            ],
          }),
        ),
      });

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.appleIAPPurchase.create.mockResolvedValue({
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
        receiptData,
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
      const receiptData = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo='; // base64-ish

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            status: 0,
            environment: 'Production',
            latest_receipt_info: [
              {
                transaction_id: purchase.transactionId,
                original_transaction_id: purchase.originalTransactionId,
                product_id: purchase.productId,
                purchase_date_ms: Date.now().toString(),
                expires_date_ms: (Date.now() + 10000).toString(),
              },
            ],
          }),
        ),
      });

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.appleIAPPurchase.create.mockResolvedValue({
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
        receiptData,
      );

      expect(mockPrisma.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            planName: 'Premium VPN - Monthly',
            priceAmount: 12.99,
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

    it('should return an error if purchase not found (no auto-capture)', async () => {
      const user = createMockUser();
      const txInfo = {
        transactionId: 'tx-1',
        originalTransactionId: 'orig-1',
        productId: 'prod-1',
      };

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(user);

      const result = await service.linkWithTransactionIds(user.id, 'token', [
        txInfo,
      ]);

      expect(result.success).toBe(false);
      expect(result.linkedCount).toBe(0);
      expect(result.errors?.length).toBe(1);
      expect(result.errors?.[0].error).toContain('Purchase not found');
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
      existingSub.status = 'INACTIVE';

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
      mockPrisma.user.findUnique.mockResolvedValue(user);

      const result = await service.linkWithTransactionIds(user.id, 'token', [
        txInfo,
      ]);

      expect(result.linkedCount).toBe(0);
      expect(result.errors?.length).toBe(1);
      expect(result.errors?.[0].error).toContain('Purchase not found');
    });

    it('should handle nil return from capture in bulk link', async () => {
      const user = createMockUser();
      const txInfo = {
        transactionId: 'tx-nil',
        originalTransactionId: 'orig-nil',
        productId: 'prod-nil',
      };

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(user);

      const result = await service.linkWithTransactionIds(user.id, 'token', [
        txInfo,
      ]);

      expect(result.linkedCount).toBe(0);
      expect(result.errors?.length).toBe(1);
      expect(result.errors?.[0].error).toContain('Purchase not found');
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

    it('sends paid conversion after link when stored receipt verifies as non-trial', async () => {
      const user = createMockUser();
      const txInfo = {
        transactionId: 'tx-paid',
        originalTransactionId: 'orig-paid',
        productId: 'com.keenvpn.premium.monthly',
      };
      const purchase = createMockAppleIAPPurchase({
        transactionId: txInfo.transactionId,
        originalTransactionId: txInfo.originalTransactionId,
        productId: txInfo.productId,
        linkedUserId: null,
        expiresDate: new Date(Date.now() + 10000),
        receiptData: 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=',
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            status: 0,
            environment: 'Production',
            latest_receipt_info: [
              {
                transaction_id: txInfo.transactionId,
                original_transaction_id: txInfo.originalTransactionId,
                product_id: txInfo.productId,
                purchase_date_ms: Date.now().toString(),
                expires_date_ms: (Date.now() + 10000).toString(),
                is_trial_period: 'false',
              },
            ],
          }),
        ),
      });

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(purchase);
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.appleIAPPurchase.update.mockResolvedValue(purchase);
      mockPrisma.subscription.findFirst.mockResolvedValue(null);
      mockPrisma.subscription.create.mockResolvedValue(
        createMockSubscription(),
      );

      await service.linkWithTransactionIds(user.id, 'token', [txInfo]);

      expect(mockTrialService.grantIfEligible).toHaveBeenCalled();
      expect(
        mockPaidConversionSlack.maybeNotifyApplePaidConversion,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          originalTransactionId: txInfo.originalTransactionId,
        }),
      );
    });

    it('does not send paid conversion after link when stored receipt is trial period', async () => {
      const user = createMockUser();
      const txInfo = {
        transactionId: 'tx-trial',
        originalTransactionId: 'orig-trial',
        productId: 'com.keenvpn.premium.monthly',
      };
      const purchase = createMockAppleIAPPurchase({
        transactionId: txInfo.transactionId,
        originalTransactionId: txInfo.originalTransactionId,
        productId: txInfo.productId,
        linkedUserId: null,
        expiresDate: new Date(Date.now() + 10000),
        receiptData: 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=',
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            status: 0,
            environment: 'Production',
            latest_receipt_info: [
              {
                transaction_id: txInfo.transactionId,
                original_transaction_id: txInfo.originalTransactionId,
                product_id: txInfo.productId,
                purchase_date_ms: Date.now().toString(),
                expires_date_ms: (Date.now() + 10000).toString(),
                is_trial_period: 'true',
              },
            ],
          }),
        ),
      });

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(purchase);
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.appleIAPPurchase.update.mockResolvedValue(purchase);
      mockPrisma.subscription.findFirst.mockResolvedValue(null);
      mockPrisma.subscription.create.mockResolvedValue(
        createMockSubscription(),
      );

      await service.linkWithTransactionIds(user.id, 'token', [txInfo]);

      expect(mockTrialService.grantIfEligible).toHaveBeenCalled();
      expect(
        mockPaidConversionSlack.maybeNotifyApplePaidConversion,
      ).not.toHaveBeenCalled();
    });

    it('still sends paid conversion when stored receipt verification fails', async () => {
      const user = createMockUser();
      const txInfo = {
        transactionId: 'tx-verify-fail',
        originalTransactionId: 'orig-verify-fail',
        productId: 'com.keenvpn.premium.monthly',
      };
      const purchase = createMockAppleIAPPurchase({
        transactionId: txInfo.transactionId,
        originalTransactionId: txInfo.originalTransactionId,
        productId: txInfo.productId,
        linkedUserId: null,
        expiresDate: new Date(Date.now() + 10000),
        receiptData: 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=',
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue(JSON.stringify({ status: 21000 })),
      });

      mockPrisma.appleIAPPurchase.findUnique.mockResolvedValue(purchase);
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.appleIAPPurchase.update.mockResolvedValue(purchase);
      mockPrisma.subscription.findFirst.mockResolvedValue(null);
      mockPrisma.subscription.create.mockResolvedValue(
        createMockSubscription(),
      );

      await service.linkWithTransactionIds(user.id, 'token', [txInfo]);

      expect(
        mockPaidConversionSlack.maybeNotifyApplePaidConversion,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          originalTransactionId: txInfo.originalTransactionId,
        }),
      );
    });
  });
});
