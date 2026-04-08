import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AuthService } from '../../../src/auth/auth.service';
import { FirebaseConfig } from '../../../src/config/firebase.config';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { AppleTokenVerifierService } from '../../../src/auth/apple-token-verifier.service';
import {
  createMockFirebaseAuth,
  createMockPrismaClient,
  createMockConfigService,
  MockPrismaClient,
} from '../../setup/mocks';
import {
  createMockUser,
  createMockSubscription,
  createMockDecodedFirebaseToken,
} from '../../setup/test-helpers';
import * as jwt from 'jsonwebtoken';

jest.mock('jsonwebtoken');

describe('AuthService', () => {
  let service: AuthService;
  let mockPrisma: MockPrismaClient;
  let mockFirebaseAuth: ReturnType<typeof createMockFirebaseAuth>;
  let mockFirebaseConfig: any;
  let mockConfigService: ReturnType<typeof createMockConfigService>;
  let mockAppleTokenVerifierService: any;

  beforeEach(async () => {
    mockPrisma = createMockPrismaClient();
    mockFirebaseAuth = createMockFirebaseAuth();
    mockConfigService = createMockConfigService();
    mockFirebaseConfig = {
      getAuth: jest.fn().mockReturnValue(mockFirebaseAuth),
    };
    mockAppleTokenVerifierService = {
      verifyIdentityToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
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
          provide: AppleTokenVerifierService,
          useValue: mockAppleTokenVerifierService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should successfully login with valid Firebase token and sync user', async () => {
      const idToken = 'valid-firebase-token';
      const decodedToken = createMockDecodedFirebaseToken();
      const user = createMockUser({ firebaseUid: decodedToken.uid });
      const subscription = createMockSubscription({ userId: user.id });

      mockFirebaseAuth.verifyIdToken.mockResolvedValue(decodedToken as any);
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue(user);
      mockPrisma.subscription.findFirst.mockResolvedValue(subscription);

      const result = await service.login(idToken);

      expect(result.user.id).toBe(user.id);
      expect(result.user.email).toBe(user.email);
      expect(result.subscription).toBeDefined();
      expect(mockFirebaseAuth.verifyIdToken).toHaveBeenCalledWith(idToken);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { firebaseUid: decodedToken.uid },
      });
    });

    it('should create new user if not found', async () => {
      const idToken = 'valid-firebase-token';
      const decodedToken = createMockDecodedFirebaseToken();
      const newUser = createMockUser({ firebaseUid: decodedToken.uid });

      mockFirebaseAuth.verifyIdToken.mockResolvedValue(decodedToken as any);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(newUser);
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      const result = await service.login(idToken);

      expect(result.user.id).toBe(newUser.id);
      expect(mockPrisma.user.create).toHaveBeenCalled();
      expect(mockPrisma.user.findUnique).toHaveBeenCalled();
    });

    it('should update existing user info', async () => {
      const idToken = 'valid-firebase-token';
      const decodedToken = createMockDecodedFirebaseToken();
      const existingUser = createMockUser({ firebaseUid: decodedToken.uid });
      const updatedUser = { ...existingUser, email: decodedToken.email };

      mockFirebaseAuth.verifyIdToken.mockResolvedValue(decodedToken as any);
      mockPrisma.user.findUnique.mockResolvedValue(existingUser);
      mockPrisma.user.update.mockResolvedValue(updatedUser);
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      const result = await service.login(idToken);

      expect(mockPrisma.user.update).toHaveBeenCalled();
      expect(result.user.email).toBe(decodedToken.email);
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      const idToken = 'invalid-token';

      mockFirebaseAuth.verifyIdToken.mockRejectedValue(
        new Error('Invalid token'),
      );

      await expect(service.login(idToken)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockFirebaseAuth.verifyIdToken).toHaveBeenCalledWith(idToken);
    });

    it('should throw UnauthorizedException if email is missing', async () => {
      const idToken = 'valid-firebase-token';
      const decodedToken = createMockDecodedFirebaseToken();
      delete (decodedToken as any).email;

      mockFirebaseAuth.verifyIdToken.mockResolvedValue(decodedToken as any);

      await expect(service.login(idToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('googleSignIn', () => {
    it('should successfully sign in with valid Google token and sync user', async () => {
      const idToken = 'valid-google-token';
      const decodedToken = createMockDecodedFirebaseToken();
      const user = createMockUser({ firebaseUid: decodedToken.uid });
      const subscription = createMockSubscription({ userId: user.id });

      mockFirebaseAuth.verifyIdToken.mockResolvedValue(decodedToken as any);
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue(user);
      mockPrisma.subscription.findFirst.mockResolvedValue(subscription);

      const result = await service.googleSignIn(idToken);

      expect(result.user.id).toBe(user.id);
      expect(result.user.email).toBe(user.email);
      expect(result.user.provider).toBe(user.provider);
      expect(result.subscription).toBeDefined();
      expect(mockFirebaseAuth.verifyIdToken).toHaveBeenCalledWith(idToken);
      expect(mockPrisma.user.update).toHaveBeenCalled();
    });

    it('should create new user if not found during Google sign-in', async () => {
      const idToken = 'valid-google-token';
      const decodedToken = createMockDecodedFirebaseToken();
      const newUser = createMockUser({ firebaseUid: decodedToken.uid });

      mockFirebaseAuth.verifyIdToken.mockResolvedValue(decodedToken as any);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(newUser);
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      const result = await service.googleSignIn(idToken);

      expect(result.user.id).toBe(newUser.id);
      expect(result.subscription).toBeNull();
      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for invalid Google token', async () => {
      const idToken = 'invalid-token';
      mockFirebaseAuth.verifyIdToken.mockRejectedValue(
        new Error('Invalid token'),
      );

      await expect(service.googleSignIn(idToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject Google sign-in when account is registered with Apple provider', async () => {
      const idToken = 'valid-google-token';
      const decodedToken = createMockDecodedFirebaseToken({
        email: 'apple-user@example.com',
      } as any);
      const user = createMockUser({
        firebaseUid: decodedToken.uid,
        email: 'apple-user@example.com',
        provider: 'apple',
      });

      mockFirebaseAuth.verifyIdToken.mockResolvedValue(decodedToken as any);
      mockPrisma.user.findUnique.mockResolvedValue(user);

      await expect(service.googleSignIn(idToken)).rejects.toThrow(
        'This email is registered with Apple Sign-In. Please sign in with Apple instead.',
      );
    });
  });

  describe('appleSignIn', () => {
    const identityToken = 'valid.apple.token';
    const userIdentifier = 'apple-user-123';
    const email = 'apple@example.com';
    const fullName = 'Apple User';

    it('should successfully sign in with valid Apple token verification', async () => {
      const decodedToken = {
        sub: userIdentifier,
        email,
        email_verified: true,
      };
      const user = createMockUser({ appleUserId: userIdentifier, email });

      mockAppleTokenVerifierService.verifyIdentityToken.mockResolvedValue(
        decodedToken,
      );
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue(user);

      const result = await service.appleSignIn(
        identityToken,
        userIdentifier,
        email,
        fullName,
      );

      expect(result.success).toBe(true);
      expect(result.user.email).toBe(email);
      expect(
        mockAppleTokenVerifierService.verifyIdentityToken,
      ).toHaveBeenCalledWith(identityToken);
    });

    it('should handle fallback to decoding without verification in non-production (mock flow)', async () => {
      // Mock non-production environment
      process.env.NODE_ENV = 'development';

      mockAppleTokenVerifierService.verifyIdentityToken.mockRejectedValue(
        new Error('Verify failed'),
      );

      // Setup a valid-looking JWT structure for manual decoding
      const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString(
        'base64',
      );
      const payload = Buffer.from(
        JSON.stringify({
          sub: userIdentifier,
          email,
          email_verified: true,
        }),
      ).toString('base64');
      const signature = 'signature';
      const mockJwt = `${header}.${payload}.${signature}`;

      const user = createMockUser({ appleUserId: userIdentifier, email });
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue(user);

      const result = await service.appleSignIn(
        mockJwt,
        userIdentifier,
        email,
        fullName,
      );

      expect(result.success).toBe(true);
      expect(result.user.id).toBe(user.id);
    });

    it('should create new user with Apple Sign-In if not found', async () => {
      const decodedToken = {
        sub: userIdentifier,
        email,
        email_verified: true,
      };
      const newUser = createMockUser({ appleUserId: userIdentifier, email });

      mockAppleTokenVerifierService.verifyIdentityToken.mockResolvedValue(
        decodedToken,
      );
      mockPrisma.user.findUnique.mockResolvedValue(null); // Not found by ID or email
      mockPrisma.user.create.mockResolvedValue(newUser);

      const result = await service.appleSignIn(
        identityToken,
        userIdentifier,
        email,
        fullName,
      );

      expect(result.user.id).toBe(newUser.id);
      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it('should return conflict if firebaseUid is already linked to another user', async () => {
      const decodedToken = {
        sub: userIdentifier,
        email,
        email_verified: true,
      };
      const user = createMockUser({
        appleUserId: userIdentifier,
        email,
        firebaseUid: null,
      });
      const existingFbUser = createMockUser({ firebaseUid: 'other-fb-uid' });
      const firebaseToken = 'valid-fb-token';

      mockAppleTokenVerifierService.verifyIdentityToken.mockResolvedValue(
        decodedToken,
      );
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(user) // For finding user by appleUserId
        .mockResolvedValueOnce(existingFbUser); // For checking if firebaseUid exists
      mockPrisma.user.update.mockResolvedValue(user);
      mockFirebaseAuth.verifyIdToken.mockResolvedValue({
        uid: 'other-fb-uid',
      } as any);

      const result = await service.appleSignIn(
        identityToken,
        userIdentifier,
        email,
        fullName,
        undefined,
        undefined,
        undefined,
        firebaseToken,
      );

      expect(result.success).toBe(true);
      expect(result.firebaseLinked).toBe(false);
      expect(result.firebaseLinkError).toBe('conflict');
    });

    it('should return verification_failed if firebaseToken verification fails', async () => {
      const decodedToken = {
        sub: userIdentifier,
        email,
        email_verified: true,
      };
      const user = createMockUser({
        appleUserId: userIdentifier,
        email,
        firebaseUid: null,
      });
      const firebaseToken = 'invalid-fb-token';

      mockAppleTokenVerifierService.verifyIdentityToken.mockResolvedValue(
        decodedToken,
      );
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue(user);
      mockFirebaseAuth.verifyIdToken.mockRejectedValue(
        new Error('Firebase error'),
      );

      const result = await service.appleSignIn(
        identityToken,
        userIdentifier,
        email,
        fullName,
        undefined,
        undefined,
        undefined,
        firebaseToken,
      );

      expect(result.success).toBe(true);
      expect(result.firebaseLinked).toBe(false);
      expect(result.firebaseLinkError).toBe('verification_failed');
    });

    it('should return conflict if Prisma throws P2002 (unique constraint violation) during update', async () => {
      const decodedToken = {
        sub: userIdentifier,
        email,
        email_verified: true,
      };
      const user = createMockUser({
        appleUserId: userIdentifier,
        email,
        firebaseUid: null,
      });
      const firebaseToken = 'valid-fb-token';

      mockAppleTokenVerifierService.verifyIdentityToken.mockResolvedValue(
        decodedToken,
      );

      // 1. First findUnique: finds the user by appleUserId
      mockPrisma.user.findUnique.mockResolvedValueOnce(user);

      // 2. Initial info update (email, displayName, etc.)
      mockPrisma.user.update.mockResolvedValueOnce(user);

      // 3. Second findUnique (inside Firebase link block): checks if firebaseUid already exists
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '6.1.0',
          meta: { target: ['firebaseUid'] },
        },
      );
      // 4. Second update (linking firebaseUid) throws the race condition error
      mockPrisma.user.update.mockRejectedValueOnce(prismaError);
      mockFirebaseAuth.verifyIdToken.mockResolvedValue({
        uid: 'already-linked-uid',
      } as any);

      const result = await service.appleSignIn(
        identityToken,
        userIdentifier,
        email,
        fullName,
        undefined,
        undefined,
        undefined,
        firebaseToken,
      );

      expect(result.success).toBe(true);
      expect(result.firebaseLinked).toBe(false);
      expect(result.firebaseLinkError).toBe('conflict');
    });
  });

  describe('verifySession', () => {
    it('should successfully verify a valid session token', async () => {
      const sessionToken = 'valid-session-token';
      const userId = 'user-123';
      const user = createMockUser({ id: userId });
      const subscription = createMockSubscription({ userId });

      (jwt.verify as jest.Mock).mockReturnValue({ userId, type: 'session' });
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.subscription.findFirst.mockResolvedValue(subscription);

      const result = await service.verifySession(sessionToken);

      expect(result.success).toBe(true);
      expect(result.user.id).toBe(userId);
      expect(result.subscription).toBeDefined();
      expect(jwt.verify).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if token type is invalid', async () => {
      const sessionToken = 'invalid-type-token';
      (jwt.verify as jest.Mock).mockReturnValue({
        userId: 'user-123',
        type: 'refresh',
      }); // Wrong type

      await expect(service.verifySession(sessionToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if user not found', async () => {
      const sessionToken = 'valid-session-token';
      const userId = 'user-123';

      (jwt.verify as jest.Mock).mockReturnValue({ userId, type: 'session' });
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.verifySession(sessionToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should handle trial expiration', async () => {
      const sessionToken = 'trial-session-token';
      const userId = 'user-trial';
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 1); // Yesterday

      const userWithExpiredTrial = createMockUser({
        id: userId,
        trialActive: true,
        trialEndsAt: expiredDate,
        trialStartsAt: new Date(
          expiredDate.getTime() - 7 * 24 * 60 * 60 * 1000,
        ),
      });

      (jwt.verify as jest.Mock).mockReturnValue({ userId, type: 'session' });
      mockPrisma.user.findUnique.mockResolvedValue(userWithExpiredTrial);
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      const result = await service.verifySession(sessionToken);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { trialActive: false },
      });
      // We expect trial to be null in response because we just expired it?
      // Actually the code updates the DB but what does it return?
      // It returns existing user state before update if we don't reload, BUT logic checks expired condition to build response object.
      // Looking at code: "if (isTrialValid) { ... } else { await update ... }" -> trial remains null in response
      expect(result.trial).toBeNull();
    });
  });

  describe('logout', () => {
    it('should perform server-side cleanup', async () => {
      const userId = 'user-123';

      const result = await service.logout(userId);

      expect(result.success).toBe(true);
    });
  });
});
