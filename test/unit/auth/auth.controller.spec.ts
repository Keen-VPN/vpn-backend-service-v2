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
          plan: subscription.planName || '',
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          subscriptionType: subscription.subscriptionType,
        },
        sessionToken: 'valid-session-token',
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

  describe('POST /auth/google/signin', () => {
    it('should successfully sign in with Google', async () => {
      const googleSignInDto = {
        idToken: 'google-token',
        deviceFingerprint: 'fingerprint',
        devicePlatform: 'ios',
      };

      const mockResponse = {
        user: createMockUser(),
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        sessionToken: 'session-token',
        subscription: null,
      };

      authService.googleSignIn.mockResolvedValue(mockResponse as any);

      const result = await controller.googleSignIn(googleSignInDto);

      expect(result).toEqual(mockResponse);
      expect(authService.googleSignIn).toHaveBeenCalledWith(
        googleSignInDto.idToken,
      );
    });
  });

  describe('POST /auth/apple/signin', () => {
    it('should successfully sign in with Apple', async () => {
      const appleSignInDto = {
        identityToken: 'apple-token',
        userIdentifier: 'apple-user-id',
        email: 'test@example.com',
        fullName: 'Test User',
        transactionIds: [
          {
            transactionId: 'trans-1',
            originalTransactionId: 'orig-1',
            productId: 'prod-1',
          },
        ],
        deviceFingerprint: 'fingerprint',
        devicePlatform: 'ios',
      };

      const mockResponse = {
        user: createMockUser(),
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        sessionToken: 'session-token',
        subscription: null,
      };

      authService.appleSignIn.mockResolvedValue(mockResponse as any);

      const result = await controller.appleSignIn(appleSignInDto);

      expect(result).toEqual(mockResponse);
      expect(authService.appleSignIn).toHaveBeenCalledWith(
        appleSignInDto.identityToken,
        appleSignInDto.userIdentifier,
        appleSignInDto.email,
        appleSignInDto.fullName,
        expect.any(Array),
        appleSignInDto.deviceFingerprint,
        appleSignInDto.devicePlatform,
        undefined, // firebaseToken is not provided in this test case
      );
    });

    it('should handle optional email and fullName being undefined', async () => {
      const appleSignInDto = {
        identityToken: 'apple-token',
        userIdentifier: 'apple-user-id',
        transactionIds: [],
      };

      const mockResponse = {
        user: createMockUser(),
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        sessionToken: 'session-token',
        subscription: null,
      };

      authService.appleSignIn.mockResolvedValue(mockResponse as any);

      const result = await controller.appleSignIn(appleSignInDto as any);

      expect(result).toEqual(mockResponse);
      expect(authService.appleSignIn).toHaveBeenCalledWith(
        appleSignInDto.identityToken,
        appleSignInDto.userIdentifier,
        '', // Default empty string
        '', // Default empty string
        appleSignInDto.transactionIds,
        undefined,
        undefined,
        undefined, // firebaseToken
      );
    });
  });

  describe('POST /auth/verify', () => {
    it('should successfully verify session', async () => {
      const verifySessionDto = {
        sessionToken: 'session-token',
        deviceFingerprint: 'fingerprint',
        devicePlatform: 'ios',
      };

      const mockResponse = {
        valid: true,
        user: createMockUser(),
        subscription: null,
      };

      authService.verifySession.mockResolvedValue(mockResponse as any);

      const result = await controller.verifySession(verifySessionDto);

      expect(result).toEqual(mockResponse);
      expect(authService.verifySession).toHaveBeenCalledWith(
        verifySessionDto.sessionToken,
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

  describe('DELETE /auth/delete-account', () => {
    it('should successfully delete account', async () => {
      const user = { uid: 'firebase-uid-123' };
      const mockResult = {
        id: 'uuid-1234',
        email: 'deleted@example.com',
      };

      accountService.deleteAccount.mockResolvedValue(mockResult as any);

      const result = await controller.deleteAccount(user as any);

      expect(result).toEqual({
        message: 'Account deleted successfully',
        ...mockResult,
      });
      expect(accountService.deleteAccount).toHaveBeenCalledWith(user.uid);
    });
  });
});
