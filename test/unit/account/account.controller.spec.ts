import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import {
  AccountController,
  AccountPaymentsController,
} from '../../../src/account/account.controller';
import { AccountService } from '../../../src/account/account.service';
import { FirebaseAuthGuard } from '../../../src/auth/guards/firebase-auth.guard';
import { SessionAuthGuard } from '../../../src/auth/guards/session-auth.guard';
import {
  createMockUser,
  createMockSubscription,
} from '../../setup/test-helpers';

describe('AccountController', () => {
  let controller: AccountController;
  let accountService: jest.Mocked<AccountService>;

  beforeEach(async () => {
    const mockAccountService = {
      getProfileByFirebaseUid: jest.fn(),
      deleteAccount: jest.fn(),
      getPayments: jest.fn(),
      getInvoicePdf: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountController],
      providers: [
        {
          provide: AccountService,
          useValue: mockAccountService,
        },
      ],
    })
      .overrideGuard(FirebaseAuthGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .overrideGuard(SessionAuthGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .compile();

    controller = module.get<AccountController>(AccountController);
    accountService = module.get(AccountService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /user/profile', () => {
    it('should return user profile', async () => {
      const user = createMockUser();
      const subscription = createMockSubscription({ userId: user.id });
      const firebaseUser = { uid: user.firebaseUid };

      accountService.getProfileByFirebaseUid.mockResolvedValue({
        ...user,
        subscriptions: [subscription],
      } as any);

      const result = await controller.getProfile(firebaseUser as any);

      expect(result.user.id).toBe(user.id);
      expect(accountService.getProfileByFirebaseUid).toHaveBeenCalledWith(
        user.firebaseUid,
      );
    });
  });

  describe('DELETE /user/account', () => {
    it('should delete account successfully', async () => {
      const user = createMockUser();
      const firebaseUser = { uid: user.firebaseUid };

      accountService.getProfileByFirebaseUid.mockResolvedValue(user as any);
      accountService.deleteAccount.mockResolvedValue({
        success: true,
        deletedUserId: user.id,
        stripeCustomerIds: [],
      });

      const result = await controller.deleteAccount(firebaseUser as any);

      expect(result.success).toBe(true);
    });
  });
});

describe('AccountPaymentsController', () => {
  let controller: AccountPaymentsController;
  let accountService: jest.Mocked<AccountService>;

  beforeEach(async () => {
    const mockAccountService = {
      getProfileByFirebaseUid: jest.fn(),
      getPayments: jest.fn(),
      getInvoicePdf: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountPaymentsController],
      providers: [
        {
          provide: AccountService,
          useValue: mockAccountService,
        },
      ],
    })
      .overrideGuard(FirebaseAuthGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .compile();

    controller = module.get<AccountPaymentsController>(
      AccountPaymentsController,
    );
    accountService = module.get(AccountService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /account/payments', () => {
    it('should return payment history', async () => {
      const user = createMockUser();
      const firebaseUser = { uid: user.firebaseUid };
      const subscriptions = [createMockSubscription({ userId: user.id })];

      accountService.getProfileByFirebaseUid.mockResolvedValue(user as any);
      accountService.getPayments.mockResolvedValue({
        payments: subscriptions.map((s) => ({
          id: s.id,
          status: s.status,
          planName: s.planName,
          priceAmount: s.priceAmount,
          priceCurrency: s.priceCurrency,
          billingPeriod: s.billingPeriod,
          currentPeriodStart: s.currentPeriodStart,
          currentPeriodEnd: s.currentPeriodEnd,
          subscriptionType: s.subscriptionType,
          createdAt: s.createdAt,
        })),
      });

      const result = await controller.getPayments(firebaseUser as any);

      expect(result.payments).toHaveLength(1);
    });
  });

  describe('GET /account/invoices/:id/pdf', () => {
    it('should return PDF invoice', async () => {
      const user = createMockUser();
      const subscription = createMockSubscription({ userId: user.id });
      const firebaseUser = { uid: user.firebaseUid };
      const pdfBuffer = Buffer.from('mock-pdf-content');

      accountService.getProfileByFirebaseUid.mockResolvedValue(user as any);
      accountService.getInvoicePdf.mockResolvedValue(pdfBuffer);

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };

      await controller.getInvoicePdf(
        subscription.id,
        firebaseUser as any,
        mockRes as any,
      );

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/pdf',
      );
      expect(mockRes.send).toHaveBeenCalledWith(pdfBuffer);
    });

    it('should throw ForbiddenException for invalid UUID format', async () => {
      const firebaseUser = { uid: 'firebase-uid' };

      await expect(
        controller.getInvoicePdf(
          'invalid-uuid',
          firebaseUser as any,
          {} as any,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
