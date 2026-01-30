import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthController } from '../../../src/auth/auth.controller';
import { AuthService } from '../../../src/auth/auth.service';
import { AccountService } from '../../../src/account/account.service';
import { SessionAuthGuard } from '../../../src/auth/guards/session-auth.guard';
import { PrismaService } from '../../../src/prisma/prisma.service';
import {
  createMockUser,
  createMockSubscription,
  createMockDecodedFirebaseToken,
} from '../../setup/test-helpers';
import {
  createMockFirebaseConfig,
  createMockConfigService,
  createMockPrismaClient,
} from '../../setup/mocks';
import { FirebaseConfig } from '../../../src/config/firebase.config';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;
  let accountService: jest.Mocked<AccountService>;

  beforeEach(async () => {
    const mockAuthService = {
      login: jest.fn(),
      logout: jest.fn(),
      googleSignIn: jest.fn(),
      appleSignIn: jest.fn(),
      verifySession: jest.fn(),
    };
    const mockAccountService = {
      deleteAccount: jest.fn(),
    };
    const mockFirebaseConfig = createMockFirebaseConfig();
    const mockConfigService = createMockConfigService();
    const mockPrismaService = createMockPrismaClient();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: AccountService,
          useValue: mockAccountService,
        },
        {
          provide: FirebaseConfig,
          useValue: mockFirebaseConfig,
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
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
    accountService = module.get(AccountService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /auth/login', () => {
    it('should successfully login with valid token', async () => {
      const user = createMockUser();
      const subscription = createMockSubscription({ userId: user.id });
      const loginDto = { idToken: 'valid-token' };

      authService.login.mockResolvedValue({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          emailVerified: user.emailVerified,
          provider: user.provider,
        },
        subscription: {
          id: subscription.id,
          status: subscription.status,
          planName: subscription.planName,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          subscriptionType: subscription.subscriptionType,
        },
      });

      const result = await controller.login(loginDto);

      expect(result.user.id).toBe(user.id);
      expect(authService.login).toHaveBeenCalledWith(loginDto.idToken);
    });

    it('should throw error for invalid token format', async () => {
      const loginDto = { idToken: 'short' }; // Too short

      authService.login.mockRejectedValue(
        new UnauthorizedException('Invalid token'),
      );

      await expect(controller.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('POST /auth/logout', () => {
    it('should successfully logout', async () => {
      const user = { uid: 'firebase-uid-123' };

      authService.logout.mockResolvedValue({ success: true });

      const result = await controller.logout(user as any);

      expect(result.success).toBe(true);
      expect(authService.logout).toHaveBeenCalledWith(user.uid);
    });
  });
});

