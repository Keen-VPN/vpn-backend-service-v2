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
  createMockLinkedAccount,
} from '../../setup/test-helpers';
import { BadRequestException, ConflictException } from '@nestjs/common';
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

  it('creates secondary user and LinkedAccount when no secondary exists', async () => {
    const primaryUser = createMockUser({
      provider: 'apple',
      appleUserId: 'apple-123',
      firebaseUid: null,
      googleUserId: null,
    });
    const secondaryUser = createMockUser({
      provider: 'google',
      firebaseUid: 'fb-new',
    });
    const decodedToken = createMockDecodedFirebaseToken();

    mockFirebaseConfig.getAuth().verifyIdToken.mockResolvedValue(decodedToken);
    prisma.user.findUnique.mockResolvedValueOnce(primaryUser); // lookup primary
    prisma.user.findUnique.mockResolvedValueOnce(null); // lookup by firebaseUid
    prisma.user.create.mockResolvedValueOnce(secondaryUser); // create secondary user
    prisma.linkedAccount.findFirst.mockResolvedValueOnce(null); // no existing link
    mockGetActiveSub.mockResolvedValue(null); // no subscriptions

    const result = await service.linkProvider(
      primaryUser.id,
      'google',
      'mock-firebase-token',
    );

    expect(result.success).toBe(true);
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: 'google',
        firebaseUid: decodedToken.uid,
      }),
    });
    expect(prisma.linkedAccount.create).toHaveBeenCalled();
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

  it('rejects linking Apple when the Apple account is already linked to another user via field update', async () => {
    // Scenario: User A (Google) has appleUserId set. User B (Google) tries to link the same Apple.
    const userA = createMockUser({
      provider: 'google',
      firebaseUid: 'fb-user-a',
      appleUserId: 'apple-shared',
    });
    const userB = createMockUser({
      provider: 'google',
      firebaseUid: 'fb-user-b',
      appleUserId: null,
    });

    // Token from Firebase linkWithPopup — has User B's own firebaseUid
    // and includes apple.com identities
    const decodedToken = {
      ...createMockDecodedFirebaseToken(),
      uid: 'fb-user-b',
      firebase: {
        sign_in_provider: 'apple.com',
        identities: { 'apple.com': ['apple-shared'] },
      },
    };

    mockFirebaseConfig.getAuth().verifyIdToken.mockResolvedValue(decodedToken);

    // 1st findUnique: lookup primary user by id
    prisma.user.findUnique.mockResolvedValueOnce(userB);
    // 2nd findUnique: lookup by firebaseUid from token → finds User B (primary)
    prisma.user.findUnique.mockResolvedValueOnce(userB);
    // 3rd findUnique: lookup by appleUserId → finds User A (the actual owner)
    prisma.user.findUnique.mockResolvedValueOnce(userA);

    await expect(
      service.linkProvider(userB.id, 'apple', 'mock-token'),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects linking Apple when appleUserIdFromToken is absent', async () => {
    // Scenario: Firebase token lacks apple.com identities — should not silently succeed
    const userB = createMockUser({
      provider: 'google',
      firebaseUid: 'fb-user-b',
      appleUserId: null,
    });

    const decodedToken = {
      ...createMockDecodedFirebaseToken(),
      uid: 'fb-user-b',
      // No apple.com identities in the token
      firebase: { sign_in_provider: 'apple.com' },
    };

    mockFirebaseConfig.getAuth().verifyIdToken.mockResolvedValue(decodedToken);

    // 1st findUnique: lookup primary user by id
    prisma.user.findUnique.mockResolvedValueOnce(userB);
    // 2nd findUnique: lookup by firebaseUid from token → finds User B (primary)
    prisma.user.findUnique.mockResolvedValueOnce(userB);

    await expect(
      service.linkProvider(userB.id, 'apple', 'mock-token'),
    ).rejects.toThrow('Could not extract Apple identity');
  });

  it('rejects when Apple account is already linked via LinkedAccount table', async () => {
    // Scenario: Apple user exists as separate record, already linked to User A.
    // User B tries to link the same Apple account via credential-already-in-use flow.
    const appleUser = createMockUser({
      provider: 'apple',
      appleUserId: 'apple-shared',
      firebaseUid: 'fb-apple-user',
    });
    const userB = createMockUser({
      provider: 'google',
      firebaseUid: 'fb-user-b',
      appleUserId: null,
    });
    const existingLink = createMockLinkedAccount({
      primaryUserId: 'user-a-id',
      linkedUserId: appleUser.id,
    });

    // Token from temp Firebase app sign-in — has the Apple user's firebaseUid
    const decodedToken = {
      ...createMockDecodedFirebaseToken(),
      uid: 'fb-apple-user',
      firebase: {
        sign_in_provider: 'apple.com',
        identities: { 'apple.com': ['apple-shared'] },
      },
    };

    mockFirebaseConfig.getAuth().verifyIdToken.mockResolvedValue(decodedToken);

    // 1st findUnique: lookup primary user by id
    prisma.user.findUnique.mockResolvedValueOnce(userB);
    // 2nd findUnique: lookup by firebaseUid from token → finds Apple user (secondary)
    prisma.user.findUnique.mockResolvedValueOnce(appleUser);

    // linkedAccount.findFirst: Apple user already linked to User A
    prisma.linkedAccount.findFirst.mockResolvedValueOnce(existingLink);

    await expect(
      service.linkProvider(userB.id, 'apple', 'mock-token'),
    ).rejects.toThrow(ConflictException);
  });
});
