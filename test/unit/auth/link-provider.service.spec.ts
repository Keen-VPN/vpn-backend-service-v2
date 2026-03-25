import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus } from '@prisma/client';
import { LinkProviderService } from '../../../src/auth/link-provider.service';
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
} from '../../setup/test-helpers';

jest.mock('jsonwebtoken');

describe('LinkProviderService', () => {
  let service: LinkProviderService;
  let mockPrisma: MockPrismaClient;
  let mockFirebaseAuth: ReturnType<typeof createMockFirebaseAuth>;
  let mockFirebaseConfig: any;
  let mockConfigService: ReturnType<typeof createMockConfigService>;
  let mockAppleTokenVerifier: any;

  beforeEach(async () => {
    mockPrisma = createMockPrismaClient();
    mockFirebaseAuth = createMockFirebaseAuth();
    mockConfigService = createMockConfigService();
    mockFirebaseConfig = {
      getAuth: jest.fn().mockReturnValue(mockFirebaseAuth),
    };
    mockAppleTokenVerifier = {
      verifyIdentityToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinkProviderService,
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
          useValue: mockAppleTokenVerifier,
        },
      ],
    }).compile();

    service = module.get<LinkProviderService>(LinkProviderService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkLinkProvider', () => {
    it('should return already_linked when provider identity is already on current user', async () => {
      const appleUserId = 'apple-sub-123';
      const currentUser = createMockUser({
        id: 'user-1',
        appleUserId,
        provider: 'apple',
      });

      mockAppleTokenVerifier.verifyIdentityToken.mockResolvedValue({
        sub: appleUserId,
        email: currentUser.email,
      });
      mockPrisma.user.findUnique.mockResolvedValueOnce(currentUser);

      const result = await service.checkLinkProvider(
        'user-1',
        'apple',
        'valid-apple-token',
      );

      expect(result.action).toBe('already_linked');
      expect(mockAppleTokenVerifier.verifyIdentityToken).toHaveBeenCalledWith(
        'valid-apple-token',
      );
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
    });

    it('should return fresh_link when no other user owns the identity', async () => {
      const currentUser = createMockUser({
        id: 'user-1',
        appleUserId: null,
        provider: 'google',
        firebaseUid: 'fb-uid-1',
      });

      mockAppleTokenVerifier.verifyIdentityToken.mockResolvedValue({
        sub: 'apple-sub-new',
        email: 'other@example.com',
      });
      // First call: findUnique by id (currentUser lookup)
      mockPrisma.user.findUnique.mockResolvedValueOnce(currentUser);
      // Second call: findUnique by appleUserId (other user lookup)
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const result = await service.checkLinkProvider(
        'user-1',
        'apple',
        'valid-apple-token',
      );

      expect(result.action).toBe('fresh_link');
    });

    it('should return merge_required when other user exists without dual active subs', async () => {
      const currentUser = createMockUser({
        id: 'user-1',
        appleUserId: null,
        provider: 'google',
        firebaseUid: 'fb-uid-1',
      });
      const otherUser = createMockUser({
        id: 'user-2',
        appleUserId: 'apple-sub-other',
        provider: 'apple',
        firebaseUid: null,
      });

      mockAppleTokenVerifier.verifyIdentityToken.mockResolvedValue({
        sub: 'apple-sub-other',
        email: otherUser.email,
      });
      // First: current user lookup by id
      mockPrisma.user.findUnique.mockResolvedValueOnce(currentUser);
      // Second: other user lookup by appleUserId
      mockPrisma.user.findUnique.mockResolvedValueOnce(otherUser);

      // Active subscription check: current user has one, other does not
      mockPrisma.subscription.findFirst
        .mockResolvedValueOnce(
          createMockSubscription({
            userId: currentUser.id,
            status: SubscriptionStatus.ACTIVE,
          }),
        )
        .mockResolvedValueOnce(null);

      const result = await service.checkLinkProvider(
        'user-1',
        'apple',
        'valid-apple-token',
      );

      expect(result.action).toBe('merge_required');
      expect(result.secondaryUser).toBeDefined();
      expect(result.secondaryUser!.id).toBe('user-2');
      expect(result.secondaryUser!.email).toBe(otherUser.email);
      expect(result.secondaryUser!.provider).toBe('apple');
      expect(result.secondaryUser!.hasActiveSubscription).toBe(false);
    });

    it('should return blocked when both users have active subscriptions', async () => {
      const currentUser = createMockUser({
        id: 'user-1',
        appleUserId: null,
        provider: 'google',
        firebaseUid: 'fb-uid-1',
      });
      const otherUser = createMockUser({
        id: 'user-2',
        appleUserId: 'apple-sub-other',
        provider: 'apple',
        firebaseUid: null,
      });

      mockAppleTokenVerifier.verifyIdentityToken.mockResolvedValue({
        sub: 'apple-sub-other',
        email: otherUser.email,
      });
      mockPrisma.user.findUnique.mockResolvedValueOnce(currentUser);
      mockPrisma.user.findUnique.mockResolvedValueOnce(otherUser);

      // Both users have active subscriptions
      mockPrisma.subscription.findFirst
        .mockResolvedValueOnce(
          createMockSubscription({
            userId: currentUser.id,
            status: SubscriptionStatus.ACTIVE,
          }),
        )
        .mockResolvedValueOnce(
          createMockSubscription({
            userId: otherUser.id,
            status: SubscriptionStatus.ACTIVE,
          }),
        );

      const result = await service.checkLinkProvider(
        'user-1',
        'apple',
        'valid-apple-token',
      );

      expect(result.action).toBe('blocked');
      expect(result.reason).toBe('dual_active_subscriptions');
    });

    it('should throw UnauthorizedException if current user is not found', async () => {
      mockAppleTokenVerifier.verifyIdentityToken.mockResolvedValue({
        sub: 'apple-sub-123',
        email: 'test@example.com',
      });
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.checkLinkProvider('nonexistent-user', 'apple', 'valid-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      mockAppleTokenVerifier.verifyIdentityToken.mockRejectedValue(
        new Error('Invalid token'),
      );

      await expect(
        service.checkLinkProvider('user-1', 'apple', 'bad-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should use Firebase verifyIdToken for Google provider', async () => {
      const currentUser = createMockUser({
        id: 'user-1',
        firebaseUid: 'existing-fb-uid',
        provider: 'google',
      });

      mockFirebaseAuth.verifyIdToken.mockResolvedValue({
        uid: 'existing-fb-uid',
        email: currentUser.email,
      } as any);
      mockPrisma.user.findUnique.mockResolvedValueOnce(currentUser);

      const result = await service.checkLinkProvider(
        'user-1',
        'google',
        'valid-google-token',
      );

      expect(result.action).toBe('already_linked');
      expect(mockFirebaseAuth.verifyIdToken).toHaveBeenCalledWith(
        'valid-google-token',
      );
    });
  });

  describe('confirmLinkProvider', () => {
    it('should perform a fresh link when no other user owns the identity', async () => {
      const currentUser = createMockUser({
        id: 'user-1',
        appleUserId: null,
        firebaseUid: 'fb-uid-1',
        provider: 'google',
      });
      const updatedUser = {
        ...currentUser,
        appleUserId: 'apple-sub-new',
        provider: 'google+apple',
      };

      mockAppleTokenVerifier.verifyIdentityToken.mockResolvedValue({
        sub: 'apple-sub-new',
        email: 'new@example.com',
      });
      // First: current user lookup
      mockPrisma.user.findUnique.mockResolvedValueOnce(currentUser);
      // Second: other user lookup by appleUserId — none found
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      // update call
      mockPrisma.user.update.mockResolvedValueOnce(updatedUser);

      const result = await service.confirmLinkProvider(
        'user-1',
        'apple',
        'valid-apple-token',
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('linked');
      expect(result.linkedProviders).toContain('google');
      expect(result.linkedProviders).toContain('apple');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          appleUserId: 'apple-sub-new',
          provider: 'google+apple',
        },
      });
    });

    it('should throw BadRequestException when provider is already linked', async () => {
      const currentUser = createMockUser({
        id: 'user-1',
        appleUserId: 'apple-sub-123',
        provider: 'apple',
      });

      mockAppleTokenVerifier.verifyIdentityToken.mockResolvedValue({
        sub: 'apple-sub-123',
        email: currentUser.email,
      });
      mockPrisma.user.findUnique.mockResolvedValueOnce(currentUser);

      await expect(
        service.confirmLinkProvider('user-1', 'apple', 'valid-apple-token'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should perform a merge when other user exists and call $transaction', async () => {
      const currentUser = createMockUser({
        id: 'user-1',
        appleUserId: null,
        firebaseUid: 'fb-uid-1',
        provider: 'google',
        stripeCustomerId: 'cus_current',
        trialActive: false,
        trialStartsAt: null,
        trialEndsAt: null,
        trialTier: null,
      });
      const otherUser = createMockUser({
        id: 'user-2',
        appleUserId: 'apple-sub-other',
        firebaseUid: null,
        provider: 'apple',
        stripeCustomerId: null,
        trialActive: true,
        trialStartsAt: new Date('2026-01-01'),
        trialEndsAt: new Date('2026-02-01'),
        trialTier: 'premium',
      });

      mockAppleTokenVerifier.verifyIdentityToken.mockResolvedValue({
        sub: 'apple-sub-other',
        email: otherUser.email,
      });

      // First: current user lookup
      mockPrisma.user.findUnique.mockResolvedValueOnce(currentUser);
      // Second: other user lookup by appleUserId
      mockPrisma.user.findUnique.mockResolvedValueOnce(otherUser);

      // Active subscription: current has one, other doesn't -> primary = current
      mockPrisma.subscription.findFirst
        .mockResolvedValueOnce(
          createMockSubscription({
            userId: currentUser.id,
            status: SubscriptionStatus.ACTIVE,
          }),
        )
        .mockResolvedValueOnce(null);

      // $transaction mock: execute the callback with a mock tx
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          user: {
            update: jest.fn().mockResolvedValue(currentUser),
          },
          subscription: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findMany: jest.fn().mockResolvedValue([{ id: 'sub-1' }]),
          },
          appleIAPPurchase: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
          pushToken: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
          deviceTrialFingerprint: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
          trialGrant: {
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
          subscriptionUser: {
            upsert: jest.fn().mockResolvedValue({ id: 'su-1' }),
          },
        };
        return fn(tx);
      });

      // After transaction: re-fetch primary user
      const mergedUser = {
        ...currentUser,
        appleUserId: 'apple-sub-other',
        provider: 'google+apple',
      };
      mockPrisma.user.findUnique.mockResolvedValueOnce(mergedUser);

      const result = await service.confirmLinkProvider(
        'user-1',
        'apple',
        'valid-apple-token',
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('merged');
      expect(result.linkedProviders).toContain('google');
      expect(result.linkedProviders).toContain('apple');
      expect(result.newSessionToken).toBeUndefined();

      // Verify $transaction was called
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('should generate new session token when primary is not the current user', async () => {
      // Current user has no active sub, other user does -> primary = other
      const currentUser = createMockUser({
        id: 'user-1',
        appleUserId: null,
        firebaseUid: 'fb-uid-1',
        provider: 'google',
        trialActive: false,
      });
      const otherUser = createMockUser({
        id: 'user-2',
        appleUserId: 'apple-sub-other',
        firebaseUid: null,
        provider: 'apple',
        trialActive: false,
      });

      mockAppleTokenVerifier.verifyIdentityToken.mockResolvedValue({
        sub: 'apple-sub-other',
        email: otherUser.email,
      });

      mockPrisma.user.findUnique.mockResolvedValueOnce(currentUser);
      mockPrisma.user.findUnique.mockResolvedValueOnce(otherUser);

      // current has no sub, other has active sub -> primary = other
      mockPrisma.subscription.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
          createMockSubscription({
            userId: otherUser.id,
            status: SubscriptionStatus.ACTIVE,
          }),
        );

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          user: {
            update: jest.fn().mockResolvedValue(otherUser),
          },
          subscription: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            findMany: jest.fn().mockResolvedValue([]),
          },
          appleIAPPurchase: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
          pushToken: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
          deviceTrialFingerprint: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
          trialGrant: {
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
          subscriptionUser: {
            upsert: jest.fn().mockResolvedValue({ id: 'su-1' }),
          },
        };
        return fn(tx);
      });

      // Since jsonwebtoken is mocked, mock jwt.sign
      const jwtModule = require('jsonwebtoken');
      (jwtModule.sign as jest.Mock).mockReturnValue('new-session-token-xyz');

      const mergedUser = {
        ...otherUser,
        firebaseUid: 'fb-uid-1',
        provider: 'google+apple',
      };
      mockPrisma.user.findUnique.mockResolvedValueOnce(mergedUser);

      const result = await service.confirmLinkProvider(
        'user-1',
        'apple',
        'valid-apple-token',
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('merged');
      expect(result.newSessionToken).toBe('new-session-token-xyz');
      expect(jwtModule.sign).toHaveBeenCalledWith(
        { userId: 'user-2', type: 'session' },
        expect.any(String),
        { expiresIn: '90d' },
      );
    });

    it('should throw ConflictException when both users have active subscriptions', async () => {
      const currentUser = createMockUser({
        id: 'user-1',
        appleUserId: null,
        firebaseUid: 'fb-uid-1',
        provider: 'google',
      });
      const otherUser = createMockUser({
        id: 'user-2',
        appleUserId: 'apple-sub-other',
        provider: 'apple',
      });

      mockAppleTokenVerifier.verifyIdentityToken.mockResolvedValue({
        sub: 'apple-sub-other',
        email: otherUser.email,
      });

      mockPrisma.user.findUnique.mockResolvedValueOnce(currentUser);
      mockPrisma.user.findUnique.mockResolvedValueOnce(otherUser);

      mockPrisma.subscription.findFirst
        .mockResolvedValueOnce(
          createMockSubscription({
            userId: currentUser.id,
            status: SubscriptionStatus.ACTIVE,
          }),
        )
        .mockResolvedValueOnce(
          createMockSubscription({
            userId: otherUser.id,
            status: SubscriptionStatus.ACTIVE,
          }),
        );

      await expect(
        service.confirmLinkProvider('user-1', 'apple', 'valid-apple-token'),
      ).rejects.toThrow(ConflictException);
    });
  });
});
