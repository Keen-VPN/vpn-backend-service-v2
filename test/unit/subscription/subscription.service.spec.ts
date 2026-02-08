import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { SubscriptionService } from '../../../src/subscription/subscription.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TrialService } from '../../../src/subscription/trial.service';
import { ConfigService } from '@nestjs/config';
import {
  createMockPrismaClient,
  createMockConfigService,
  MockPrismaClient,
} from '../../setup/mocks';
import {
  createMockUser,
  createMockSubscription,
} from '../../setup/test-helpers';
import * as jwt from 'jsonwebtoken';

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let mockPrisma: MockPrismaClient;
  let mockConfigService: ReturnType<typeof createMockConfigService>;

  beforeEach(async () => {
    mockPrisma = createMockPrismaClient();
    mockConfigService = createMockConfigService();
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'JWT_SECRET') {
        return 'test-secret';
      }
      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: TrialService,
          useValue: {
            checkTrialStatus: jest.fn(),
            activateTrial: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getStatusWithSession', () => {
    it('should return subscription status with active subscription', async () => {
      const user = createMockUser();
      const subscription = createMockSubscription({
        userId: user.id,
        status: 'active',
      });
      const sessionToken = jwt.sign(
        { userId: user.id, email: user.email, type: 'session' },
        'test-secret',
      );

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.subscription.findFirst.mockResolvedValue(subscription);

      const result = await service.getStatusWithSession(sessionToken);

      expect(result.success).toBe(true);
      expect(result.hasActiveSubscription).toBe(true);
      expect(result.subscription).toBeDefined();
      expect(result.subscription?.status).toBe('active');
    });

    it('should return subscription status without active subscription', async () => {
      const user = createMockUser();
      const sessionToken = jwt.sign(
        { userId: user.id, email: user.email, type: 'session' },
        'test-secret',
      );

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      const result = await service.getStatusWithSession(sessionToken);

      expect(result.success).toBe(true);
      expect(result.hasActiveSubscription).toBe(false);
      expect(result.subscription).toBeNull();
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      const invalidToken = 'invalid_token';

      await expect(
        service.getStatusWithSession(invalidToken),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      const sessionToken = jwt.sign(
        { userId: 'non_existent', email: 'test@example.com', type: 'session' },
        'test-secret',
      );

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.getStatusWithSession(sessionToken),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('cancel', () => {
    it('should cancel subscription successfully', async () => {
      const user = createMockUser();
      const subscription = createMockSubscription({
        userId: user.id,
        status: 'active',
      });

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.subscription.findFirst.mockResolvedValue(subscription);
      mockPrisma.subscription.update.mockResolvedValue({
        ...subscription,
        cancelAtPeriodEnd: true,
      } as any);

      const result = await service.cancel(user.id);

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { id: subscription.id },
        data: { cancelAtPeriodEnd: true },
      });
    });

    it('should return error if no active subscription', async () => {
      const user = createMockUser();

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      const result = await service.cancel(user.id);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No active subscription to cancel');
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.cancel('non_existent')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});

