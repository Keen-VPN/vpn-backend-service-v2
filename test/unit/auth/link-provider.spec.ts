import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../../../src/auth/auth.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  createMockPrismaClient,
  createMockConfigService,
  createMockFirebaseConfig,
} from '../../setup/mocks';
import {
  createMockUser,
  createMockSubscription,
  createMockDecodedFirebaseToken,
} from '../../setup/test-helpers';
import { ConflictException } from '@nestjs/common';
import { SubscriptionUserRole, Prisma } from '@prisma/client';
import { AppleTokenVerifierService } from '../../../src/auth/apple-token-verifier.service';
import { FirebaseConfig } from '../../../src/config/firebase.config';

jest.mock('../../../src/subscription/subscription-lookup.util', () => ({
  getActiveSubscriptionForUser: jest.fn(),
}));
import { getActiveSubscriptionForUser } from '../../../src/subscription/subscription-lookup.util';
const mockGetActiveSub = getActiveSubscriptionForUser as jest.MockedFunction<
  typeof getActiveSubscriptionForUser
>;

describe('AuthService.linkProvider', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let mockFirebaseConfig: ReturnType<typeof createMockFirebaseConfig>;

  beforeEach(async () => {
    prisma = createMockPrismaClient();
    mockFirebaseConfig = createMockFirebaseConfig();
    mockGetActiveSub.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: createMockConfigService() },
        { provide: FirebaseConfig, useValue: mockFirebaseConfig },
        {
          provide: AppleTokenVerifierService,
          useValue: { verifyIdentityToken: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('links Google to an Apple-only user when no secondary user exists', async () => {
    const primaryUser = createMockUser({
      provider: 'apple',
      appleUserId: 'apple-123',
      firebaseUid: null,
      googleUserId: null,
    });
    const decodedToken = createMockDecodedFirebaseToken();

    mockFirebaseConfig.getAuth().verifyIdToken.mockResolvedValue(decodedToken);
    prisma.user.findUnique.mockResolvedValueOnce(primaryUser);
    prisma.user.findUnique.mockResolvedValueOnce(null);
    prisma.user.update.mockResolvedValue({
      ...primaryUser,
      firebaseUid: decodedToken.uid,
    });

    const result = await service.linkProvider(
      primaryUser.id,
      'google',
      'mock-firebase-token',
    );

    expect(result.success).toBe(true);
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('returns 409 when provider is already linked', async () => {
    const primaryUser = createMockUser({
      googleUserId: 'g-123',
      appleUserId: 'a-123',
    });
    prisma.user.findUnique.mockResolvedValue(primaryUser);

    await expect(
      service.linkProvider(primaryUser.id, 'google', 'mock-token'),
    ).rejects.toThrow(ConflictException);
  });

  it('returns 409 when both users have active subscriptions', async () => {
    const primaryUser = createMockUser({
      firebaseUid: null,
      googleUserId: null,
      appleUserId: 'apple-1',
      provider: 'apple',
    });
    const secondaryUser = createMockUser({ firebaseUid: 'fb-2' });
    const decodedToken = createMockDecodedFirebaseToken();

    mockFirebaseConfig.getAuth().verifyIdToken.mockResolvedValue(decodedToken);
    prisma.user.findUnique.mockResolvedValueOnce(primaryUser);
    prisma.user.findUnique.mockResolvedValueOnce(secondaryUser);

    mockGetActiveSub
      .mockResolvedValueOnce(createMockSubscription({ userId: primaryUser.id }))
      .mockResolvedValueOnce(
        createMockSubscription({ userId: secondaryUser.id }),
      );

    await expect(
      service.linkProvider(primaryUser.id, 'google', 'mock-token'),
    ).rejects.toThrow(ConflictException);
  });

  it('creates subscription_users mapping when secondary user has no active sub', async () => {
    const primaryUser = createMockUser({
      appleUserId: 'apple-1',
      firebaseUid: null,
      googleUserId: null,
      provider: 'apple',
    });
    const secondaryUser = createMockUser({ firebaseUid: 'fb-2' });
    const primarySub = createMockSubscription({ userId: primaryUser.id });
    const decodedToken = createMockDecodedFirebaseToken();

    mockFirebaseConfig.getAuth().verifyIdToken.mockResolvedValue(decodedToken);
    prisma.user.findUnique.mockResolvedValueOnce(primaryUser);
    prisma.user.findUnique.mockResolvedValueOnce(secondaryUser);

    mockGetActiveSub
      .mockResolvedValueOnce(primarySub)
      .mockResolvedValueOnce(null);

    prisma.subscriptionUser.create.mockResolvedValue({} as any);

    const result = await service.linkProvider(
      primaryUser.id,
      'google',
      'mock-token',
    );

    expect(result.success).toBe(true);
    expect(prisma.subscriptionUser.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        subscriptionId: primarySub.id,
        userId: secondaryUser.id,
        role: SubscriptionUserRole.LINKED,
      }),
    });
  });

  it('handles concurrent linking gracefully (P2002)', async () => {
    const primaryUser = createMockUser({
      appleUserId: 'apple-1',
      firebaseUid: null,
      googleUserId: null,
      provider: 'apple',
    });
    const secondaryUser = createMockUser({ firebaseUid: 'fb-2' });
    const primarySub = createMockSubscription({ userId: primaryUser.id });
    const decodedToken = createMockDecodedFirebaseToken();

    mockFirebaseConfig.getAuth().verifyIdToken.mockResolvedValue(decodedToken);
    prisma.user.findUnique.mockResolvedValueOnce(primaryUser);
    prisma.user.findUnique.mockResolvedValueOnce(secondaryUser);
    mockGetActiveSub
      .mockResolvedValueOnce(primarySub)
      .mockResolvedValueOnce(null);

    const p2002Error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint',
      { code: 'P2002', clientVersion: '6.0.0' },
    );
    prisma.subscriptionUser.create.mockRejectedValue(p2002Error);

    await expect(
      service.linkProvider(primaryUser.id, 'google', 'mock-token'),
    ).rejects.toThrow(ConflictException);
  });

  it('throws when Firebase token verification fails', async () => {
    const primaryUser = createMockUser({
      firebaseUid: null,
      googleUserId: null,
      appleUserId: 'apple-1',
      provider: 'apple',
    });
    prisma.user.findUnique.mockResolvedValue(primaryUser);
    mockFirebaseConfig
      .getAuth()
      .verifyIdToken.mockRejectedValue(new Error('Invalid token'));

    await expect(
      service.linkProvider(primaryUser.id, 'google', 'invalid-token'),
    ).rejects.toThrow();
  });
});
