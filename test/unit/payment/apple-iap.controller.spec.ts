import { Test, TestingModule } from '@nestjs/testing';
import { AppleIAPController } from '../../../src/payment/apple/apple-iap.controller';
import { AppleService } from '../../../src/payment/apple/apple.service';
import { SessionAuthGuard } from '../../../src/auth/guards/session-auth.guard';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../src/prisma/prisma.service';
import {
  createMockConfigService,
  createMockPrismaClient,
} from '../../setup/mocks';

describe('AppleIAPController', () => {
  let controller: AppleIAPController;
  let appleService: jest.Mocked<AppleService>;

  beforeEach(async () => {
    const mockAppleService = {
      capturePurchase: jest.fn(),
      linkPurchase: jest.fn(),
      linkWithTransactionIds: jest.fn(),
    };
    const mockConfigService = createMockConfigService();
    const mockPrismaService = createMockPrismaClient();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppleIAPController],
      providers: [
        {
          provide: AppleService,
          useValue: mockAppleService,
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

    controller = module.get<AppleIAPController>(AppleIAPController);
    appleService = module.get(AppleService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /apple-iap/capture-purchase', () => {
    it('should capture purchase successfully', async () => {
      const captureDto = {
        transactionId: 'txn_123',
        originalTransactionId: 'orig_txn_123',
        productId: 'com.keenvpn.premium',
        purchaseDateMs: '1609459200000',
        expiresDateMs: '1640995200000',
        receiptData: 'receipt_data',
        environment: 'Production',
        deviceFingerprint: 'fingerprint',
        devicePlatform: 'macOS',
      };

      appleService.capturePurchase.mockResolvedValue({
        success: true,
        message: 'Purchase captured successfully',
      });

      const result = await controller.capturePurchase(captureDto);

      expect(result.success).toBe(true);
      expect(appleService.capturePurchase).toHaveBeenCalledWith(
        captureDto.transactionId,
        captureDto.originalTransactionId,
        captureDto.productId,
        captureDto.purchaseDateMs,
        captureDto.expiresDateMs,
        captureDto.receiptData,
        captureDto.environment,
        captureDto.deviceFingerprint,
        captureDto.devicePlatform,
      );
    });

    it('should throw on capture errors', async () => {
      const captureDto = {
        transactionId: 'txn_123',
        originalTransactionId: 'orig_txn_123',
        productId: 'com.keenvpn.premium',
        purchaseDateMs: '1609459200000',
        expiresDateMs: '1640995200000',
        receiptData: 'receipt_data',
        environment: 'Production',
      };

      appleService.capturePurchase.mockRejectedValue(
        new Error('Purchase already exists'),
      );

      await expect(
        controller.capturePurchase(captureDto),
      ).rejects.toBeDefined();
    });
  });

  describe('POST /apple-iap/link-purchase', () => {
    it('should link purchase successfully', async () => {
      const linkDto = {
        sessionToken: 'session_token',
        transactionId: 'txn_123',
        originalTransactionId: 'orig_txn_123',
        productId: 'com.keenvpn.premium',
        receiptData: 'receipt_data',
        deviceFingerprint: 'fingerprint',
        devicePlatform: 'macOS',
      };
      const user = { uid: 'user_123', email: 'test@example.com' };

      appleService.linkPurchase.mockResolvedValue({
        success: true,
        message: 'Purchase linked successfully',
        subscription: {
          status: 'active',
          planName: 'Premium VPN - Annual',
          currentPeriodEnd: new Date('2024-12-31'),
        },
      });

      const result = await controller.linkPurchase(linkDto, user as any);

      expect(result.success).toBe(true);
      expect(appleService.linkPurchase).toHaveBeenCalledWith(
        user.uid,
        linkDto.sessionToken,
        linkDto.transactionId,
        linkDto.originalTransactionId,
        linkDto.productId,
        linkDto.receiptData,
        linkDto.deviceFingerprint,
        linkDto.devicePlatform,
      );
    });
  });

  describe('POST /apple-iap/link-with-transaction-ids', () => {
    it('should link multiple purchases successfully', async () => {
      const linkDto = {
        sessionToken: 'session_token',
        transactionIds: [
          {
            transactionId: 'txn_1',
            originalTransactionId: 'orig_txn_1',
            productId: 'com.keenvpn.premium',
          },
          {
            transactionId: 'txn_2',
            originalTransactionId: 'orig_txn_2',
            productId: 'com.keenvpn.premium',
          },
        ],
        deviceFingerprint: 'fingerprint',
        devicePlatform: 'macOS',
      };
      const user = { uid: 'user_123', email: 'test@example.com' };

      appleService.linkWithTransactionIds.mockResolvedValue({
        success: true,
        message: 'All purchases linked successfully',
        linkedCount: 2,
        totalCount: 2,
        linkedPurchases: [
          {
            transactionId: 'txn_1',
            originalTransactionId: 'orig_txn_1',
            productId: 'com.keenvpn.premium',
            status: 'active',
            subscriptionId: 'sub_1',
          },
          {
            transactionId: 'txn_2',
            originalTransactionId: 'orig_txn_2',
            productId: 'com.keenvpn.premium',
            status: 'active',
            subscriptionId: 'sub_2',
          },
        ],
        errors: undefined,
      });

      const result = await controller.linkWithTransactionIds(
        linkDto,
        user as any,
      );

      expect(result.success).toBe(true);
      expect((result as any).linkedCount).toBe(2);
      expect(appleService.linkWithTransactionIds).toHaveBeenCalledWith(
        user.uid,
        linkDto.sessionToken,
        linkDto.transactionIds,
        linkDto.deviceFingerprint,
        linkDto.devicePlatform,
      );
    });

    it('should handle partial linking failures', async () => {
      const linkDto = {
        sessionToken: 'session_token',
        transactionIds: [
          {
            transactionId: 'txn_1',
            originalTransactionId: 'orig_txn_1',
            productId: 'com.keenvpn.premium',
          },
          {
            transactionId: 'txn_2',
            originalTransactionId: 'orig_txn_2',
            productId: 'com.keenvpn.premium',
          },
        ],
      };
      const user = { uid: 'user_123', email: 'test@example.com' };

      appleService.linkWithTransactionIds.mockResolvedValue({
        success: false,
        message: '1 of 2 purchases linked',
        linkedCount: 1,
        totalCount: 2,
        linkedPurchases: [
          {
            transactionId: 'txn_1',
            originalTransactionId: 'orig_txn_1',
            productId: 'com.keenvpn.premium',
            status: 'active',
            subscriptionId: 'sub_1',
          },
        ],
        errors: [
          {
            transaction: {
              transactionId: 'txn_2',
              originalTransactionId: 'orig_txn_2',
              productId: 'com.keenvpn.premium',
            },
            error: 'Purchase not found',
          },
        ],
      });

      const result = await controller.linkWithTransactionIds(
        linkDto,
        user as any,
      );

      expect(result.success).toBe(false);
      expect((result as any).linkedCount).toBe(1);
      expect((result as any).errors).toBeDefined();
      expect((result as any).errors?.length).toBe(1);
    });
  });
});
