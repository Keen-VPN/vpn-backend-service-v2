import { Test, TestingModule } from '@nestjs/testing';
import { AccountService } from '../../../src/account/account.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { createMockPrismaClient } from '../../setup/mocks';
import { createMockUser } from '../../setup/test-helpers';
import { SubscriptionUserRole } from '@prisma/client';

describe('AccountService.getLinkedProviders', () => {
  let service: AccountService;
  let prisma: ReturnType<typeof createMockPrismaClient>;

  beforeEach(async () => {
    prisma = createMockPrismaClient();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AccountService, { provide: PrismaService, useValue: prisma }],
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
});
