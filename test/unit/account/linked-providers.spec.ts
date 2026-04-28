import { Test, TestingModule } from '@nestjs/testing';
import { AccountService } from '../../../src/account/account.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { EmailService } from '../../../src/email/email.service';
import { createMockPrismaClient } from '../../setup/mocks';
import { createMockUser } from '../../setup/test-helpers';
import { SubscriptionUserRole } from '@prisma/client';

describe('AccountService.getLinkedProviders', () => {
  let service: AccountService;
  let prisma: ReturnType<typeof createMockPrismaClient>;

  beforeEach(async () => {
    prisma = createMockPrismaClient();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: EmailService,
          useValue: {
            sendAccountDeletedEmail: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();
    service = module.get<AccountService>(AccountService);
  });

  it('reports Google linked when user has googleUserId', async () => {
    const user = createMockUser({ googleUserId: 'g-1', appleUserId: null });
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.linkedAccount.findMany.mockResolvedValue([]);
    const result = await service.getLinkedProviders(user.id);
    expect(result.providers.google.linked).toBe(true);
    expect(result.providers.apple.linked).toBe(false);
  });

  it('reports Apple linked when user has appleUserId', async () => {
    const user = createMockUser({
      firebaseUid: null,
      googleUserId: null,
      appleUserId: 'apple-1',
    });
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.linkedAccount.findMany.mockResolvedValue([]);
    const result = await service.getLinkedProviders(user.id);
    expect(result.providers.apple.linked).toBe(true);
  });

  it('reports both linked when bridged via linked_accounts', async () => {
    const googleUser = createMockUser({
      googleUserId: 'g-1',
      appleUserId: null,
    });
    const appleUser = createMockUser({
      firebaseUid: null,
      googleUserId: null,
      appleUserId: 'apple-2',
      email: 'apple@test.com',
    });
    prisma.user.findUnique.mockResolvedValue(googleUser);
    prisma.linkedAccount.findMany.mockResolvedValue([
      {
        id: 'la-1',
        primaryUserId: googleUser.id,
        linkedUserId: appleUser.id,
        createdAt: new Date(),
      },
    ]);
    prisma.user.findMany.mockResolvedValue([appleUser]);
    const result = await service.getLinkedProviders(googleUser.id);
    expect(result.providers.google.linked).toBe(true);
    expect(result.providers.apple.linked).toBe(true);
  });

  it('reports Apple linked via provider field when appleUserId is null', async () => {
    // Scenario: secondary Apple user was created by googleSignIn (provider='apple'
    // after our fix, but appleUserId may still be null in edge cases)
    const googleUser = createMockUser({
      googleUserId: null,
      appleUserId: null,
      provider: 'google',
    });
    const appleUser = createMockUser({
      firebaseUid: 'fb-apple',
      googleUserId: null,
      appleUserId: null, // appleUserId not set
      provider: 'apple', // but provider is correct
      email: 'apple@test.com',
    });
    prisma.user.findUnique.mockResolvedValue(googleUser);
    prisma.linkedAccount.findMany.mockResolvedValue([
      {
        id: 'la-1',
        primaryUserId: googleUser.id,
        linkedUserId: appleUser.id,
        createdAt: new Date(),
      },
    ]);
    prisma.user.findMany.mockResolvedValue([appleUser]);
    const result = await service.getLinkedProviders(googleUser.id);
    expect(result.providers.apple.linked).toBe(true);
    expect(result.providers.apple.email).toBe('apple@test.com');
  });

  it('does not report Apple user with firebaseUid as Google-linked', async () => {
    // Scenario: Apple user who signed in via website has firebaseUid set.
    // Should NOT be falsely detected as Google-linked.
    const appleUser = createMockUser({
      firebaseUid: 'fb-apple',
      googleUserId: null,
      appleUserId: 'apple-1',
      provider: 'apple',
    });
    prisma.user.findUnique.mockResolvedValue(appleUser);
    prisma.linkedAccount.findMany.mockResolvedValue([]);
    const result = await service.getLinkedProviders(appleUser.id);
    expect(result.providers.google.linked).toBe(false);
    expect(result.providers.apple.linked).toBe(true);
  });
});
