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
  createMockLinkedAccount,
  createMockSubscriptionUser,
} from '../../setup/test-helpers';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SubscriptionUserRole } from '@prisma/client';
import { AppleTokenVerifierService } from '../../../src/auth/apple-token-verifier.service';
import { FirebaseConfig } from '../../../src/config/firebase.config';

describe('AuthService.unlinkProvider', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof createMockPrismaClient>;

  beforeEach(async () => {
    prisma = createMockPrismaClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: createMockConfigService() },
        { provide: FirebaseConfig, useValue: createMockFirebaseConfig() },
        {
          provide: AppleTokenVerifierService,
          useValue: { verifyIdentityToken: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('unlinks Apple via LinkedAccount (deletes row + SubscriptionUser LINKED entry)', async () => {
    const primaryUser = createMockUser({
      provider: 'google',
      firebaseUid: 'fb-primary',
      appleUserId: null,
    });
    const linkedUser = createMockUser({
      provider: 'apple',
      appleUserId: 'apple-linked',
    });
    const linkedAccount = createMockLinkedAccount({
      primaryUserId: primaryUser.id,
      linkedUserId: linkedUser.id,
    });

    prisma.user.findUnique.mockResolvedValueOnce(primaryUser);
    prisma.linkedAccount.findMany.mockResolvedValueOnce([linkedAccount]);
    prisma.user.findMany.mockResolvedValueOnce([linkedUser]);
    prisma.linkedAccount.delete.mockResolvedValueOnce(linkedAccount);
    prisma.subscriptionUser.deleteMany.mockResolvedValueOnce({ count: 1 });

    await service.unlinkProvider(primaryUser.id, 'apple');

    expect(prisma.linkedAccount.delete).toHaveBeenCalledWith({
      where: { id: linkedAccount.id },
    });
    expect(prisma.subscriptionUser.deleteMany).toHaveBeenCalledWith({
      where: {
        role: SubscriptionUserRole.LINKED,
        OR: [{ userId: primaryUser.id }, { userId: linkedUser.id }],
      },
    });
  });

  it('unlinks Google via LinkedAccount (deletes row + SubscriptionUser LINKED entry)', async () => {
    const primaryUser = createMockUser({
      provider: 'apple',
      appleUserId: 'apple-primary',
    });
    const linkedUser = createMockUser({
      provider: 'google',
      firebaseUid: 'fb-linked',
    });
    const linkedAccount = createMockLinkedAccount({
      primaryUserId: primaryUser.id,
      linkedUserId: linkedUser.id,
    });

    prisma.user.findUnique.mockResolvedValueOnce(primaryUser);
    prisma.linkedAccount.findMany.mockResolvedValueOnce([linkedAccount]);
    prisma.user.findMany.mockResolvedValueOnce([linkedUser]);
    prisma.linkedAccount.delete.mockResolvedValueOnce(linkedAccount);
    prisma.subscriptionUser.deleteMany.mockResolvedValueOnce({ count: 1 });

    await service.unlinkProvider(primaryUser.id, 'google');

    expect(prisma.linkedAccount.delete).toHaveBeenCalledWith({
      where: { id: linkedAccount.id },
    });
    expect(prisma.subscriptionUser.deleteMany).toHaveBeenCalledWith({
      where: {
        role: SubscriptionUserRole.LINKED,
        OR: [{ userId: primaryUser.id }, { userId: linkedUser.id }],
      },
    });
  });

  it('rejects unlinking the original registration provider (400)', async () => {
    const googleUser = createMockUser({ provider: 'google' });
    prisma.user.findUnique.mockResolvedValueOnce(googleUser);

    await expect(
      service.unlinkProvider(googleUser.id, 'google'),
    ).rejects.toThrow(BadRequestException);

    const appleUser = createMockUser({ provider: 'apple', appleUserId: 'a-1' });
    prisma.user.findUnique.mockResolvedValueOnce(appleUser);

    await expect(service.unlinkProvider(appleUser.id, 'apple')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('returns 404 when provider is not linked', async () => {
    const user = createMockUser({
      provider: 'google',
      firebaseUid: 'fb-123',
      appleUserId: null,
    });

    prisma.user.findUnique.mockResolvedValueOnce(user);
    prisma.linkedAccount.findMany.mockResolvedValueOnce([]);

    await expect(service.unlinkProvider(user.id, 'apple')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('leaves the owner subscription intact after unlinking', async () => {
    const primaryUser = createMockUser({
      provider: 'google',
      firebaseUid: 'fb-primary',
      appleUserId: null,
    });
    const linkedUser = createMockUser({
      provider: 'apple',
      appleUserId: 'apple-linked',
    });
    const linkedAccount = createMockLinkedAccount({
      primaryUserId: primaryUser.id,
      linkedUserId: linkedUser.id,
    });

    prisma.user.findUnique.mockResolvedValueOnce(primaryUser);
    prisma.linkedAccount.findMany.mockResolvedValueOnce([linkedAccount]);
    prisma.user.findMany.mockResolvedValueOnce([linkedUser]);
    prisma.linkedAccount.delete.mockResolvedValueOnce(linkedAccount);
    prisma.subscriptionUser.deleteMany.mockResolvedValueOnce({ count: 1 });

    await service.unlinkProvider(primaryUser.id, 'apple');

    expect(prisma.subscription.delete).not.toHaveBeenCalled();
    expect(prisma.subscription.update).not.toHaveBeenCalled();
    expect(prisma.subscription.deleteMany).not.toHaveBeenCalled();
  });
});
