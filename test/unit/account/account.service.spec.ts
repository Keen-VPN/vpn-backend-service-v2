import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { AccountService } from '../../../src/account/account.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { createMockPrismaClient, MockPrismaClient } from '../../setup/mocks';
import {
  createMockUser,
  createMockSubscription,
} from '../../setup/test-helpers';

describe('AccountService', () => {
  let service: AccountService;
  let mockPrisma: MockPrismaClient;

  beforeEach(async () => {
    mockPrisma = createMockPrismaClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<AccountService>(AccountService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getProfileByFirebaseUid', () => {
    it('should return user profile with active subscription', async () => {
      const user = createMockUser();
      const subscription = createMockSubscription({ userId: user.id });

      mockPrisma.user.findUnique.mockResolvedValue({
        ...user,
        subscriptions: [subscription],
      } as any);

      const result = await service.getProfileByFirebaseUid(user.firebaseUid!);

      expect(result.id).toBe(user.id);
      expect(result.email).toBe(user.email);
    });

    it('should return user profile without subscription', async () => {
      const user = createMockUser();

      mockPrisma.user.findUnique.mockResolvedValue({
        ...user,
        subscriptions: [],
      } as any);

      const result = await service.getProfileByFirebaseUid(user.firebaseUid!);

      expect(result.id).toBe(user.id);
      expect(result.subscriptions).toEqual([]);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.getProfileByFirebaseUid('non-existent-uid'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteAccount', () => {
    it('should successfully delete account with cascade', async () => {
      const user = createMockUser();
      const subscriptions = [
        createMockSubscription({ userId: user.id }),
        createMockSubscription({ userId: user.id }),
      ];

      mockPrisma.user.findUnique.mockResolvedValue({
        ...user,
        subscriptions,
      } as any);
      mockPrisma.user.delete.mockResolvedValue(user);

      const result = await service.deleteAccount(user.id);

      expect(result.success).toBe(true);
      expect(result.deletedUserId).toBe(user.id);
      expect(mockPrisma.user.delete).toHaveBeenCalledWith({
        where: { id: user.id },
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.deleteAccount('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getPayments', () => {
    it('should return payment history', async () => {
      const user = createMockUser();
      const subscriptions = [
        createMockSubscription({ userId: user.id }),
        createMockSubscription({ userId: user.id }),
      ];

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.subscription.findMany.mockResolvedValue(subscriptions);

      const result = await service.getPayments(user.id);

      expect(result.payments).toHaveLength(2);
      expect(result.payments[0].id).toBe(subscriptions[0].id);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getPayments('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getInvoicePdf', () => {
    it('should generate PDF invoice', async () => {
      const user = createMockUser();
      const subscription = createMockSubscription({ userId: user.id });

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.subscription.findUnique.mockResolvedValue(subscription);

      const pdfBuffer = await service.getInvoicePdf(user.id, subscription.id);

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });

    it('should throw NotFoundException if invoice not found', async () => {
      const user = createMockUser();

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.subscription.findUnique.mockResolvedValue(null);

      await expect(
        service.getInvoicePdf(user.id, 'non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if invoice belongs to different user', async () => {
      const user = createMockUser();
      const otherUser = createMockUser();
      const subscription = createMockSubscription({ userId: otherUser.id });

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.subscription.findUnique.mockResolvedValue(subscription);

      await expect(
        service.getInvoicePdf(user.id, subscription.id),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
