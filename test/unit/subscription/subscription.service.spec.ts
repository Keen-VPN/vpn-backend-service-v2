import { Test, TestingModule } from '@nestjs/testing';
import {
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { SubscriptionService } from '../../../src/subscription/subscription.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { SubscriptionStatus } from '@prisma/client';
import { TrialService } from '../../../src/subscription/trial.service';
import { PlansConfigService } from '../../../src/subscription/config/plans.config';
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

jest.mock('jsonwebtoken');

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
            expireIfNeeded: jest.fn(),
            status: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
          },
        },
        {
          provide: PlansConfigService,
          useValue: {
            getSubscriptionPlans: jest.fn().mockReturnValue([]),
            getPlanById: jest.fn().mockReturnValue(null),
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
        status: SubscriptionStatus.ACTIVE,
      });
      const sessionToken = 'valid_token';

      (jwt.verify as jest.Mock).mockReturnValue({
        userId: user.id,
        email: user.email,
        type: 'session',
      });

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.subscription.findFirst.mockResolvedValue(subscription);

      const result = await service.getStatusWithSession(sessionToken);

      expect(result.success).toBe(true);
      expect(result.hasActiveSubscription).toBe(true);
      expect(result.subscription).toBeDefined();
      expect(result.subscription?.status).toBe(SubscriptionStatus.ACTIVE);
    });

    it('should return subscription status without active subscription', async () => {
      const user = createMockUser();
      const sessionToken = 'valid_token';

      (jwt.verify as jest.Mock).mockReturnValue({
        userId: user.id,
        email: user.email,
        type: 'session',
      });

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      const result = await service.getStatusWithSession(sessionToken);

      expect(result.success).toBe(true);
      expect(result.hasActiveSubscription).toBe(false);
      expect(result.subscription).toEqual(
        expect.objectContaining({
          status: SubscriptionStatus.INACTIVE,
        }),
      );
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      const invalidToken = 'invalid_token';

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.getStatusWithSession(invalidToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if user not found', async () => {
      const sessionToken = 'valid_token';

      (jwt.verify as jest.Mock).mockReturnValue({
        userId: 'non_existent',
        email: 'test@example.com',
        type: 'session',
      });

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getStatusWithSession(sessionToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('getPlans', () => {
    it('should return subscription plans', () => {
      const mockPlans = [{ id: 'plan-1', name: 'Premium' }];
      const plansService = service['plansConfigService'] as any;
      plansService.getSubscriptionPlans.mockReturnValue(mockPlans);

      const result = service.getPlans();

      expect(result.success).toBe(true);
      expect(result.data?.plans).toEqual(mockPlans);
    });

    it('should return error when plans retrieval fails', () => {
      const plansService = service['plansConfigService'] as any;
      plansService.getSubscriptionPlans.mockImplementation(() => {
        throw new Error('Plans unavailable');
      });

      const result = service.getPlans();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getPlanById', () => {
    it('should return a plan by id', () => {
      const mockPlan = { id: 'plan-1', name: 'Premium' };
      const plansService = service['plansConfigService'] as any;
      plansService.getPlanById.mockReturnValue(mockPlan);

      const result = service.getPlanById('plan-1');

      expect(result.success).toBe(true);
      expect(result.data?.plan).toEqual(mockPlan);
    });

    it('should return error for empty plan id', () => {
      const result = service.getPlanById('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Plan ID is required');
    });

    it('should return error when plan not found', () => {
      const plansService = service['plansConfigService'] as any;
      plansService.getPlanById.mockReturnValue(null);

      const result = service.getPlanById('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Plan not found');
    });
  });

  describe('getHistory', () => {
    it('should return paginated subscription history', async () => {
      const user = createMockUser();
      const sub = createMockSubscription({ userId: user.id });

      mockPrisma.subscription.count.mockResolvedValue(1);
      mockPrisma.subscription.findMany.mockResolvedValue([sub]);

      const result = await service.getHistory(user.id, {});

      expect(result.success).toBe(true);
      expect(result.data.events).toHaveLength(1);
      expect(result.data.events[0].id).toBe(sub.id);
      expect(result.data.pagination.page).toBe(1);
      expect(result.data.pagination.total).toBe(1);
    });

    it('should filter by provider', async () => {
      const user = createMockUser();

      mockPrisma.subscription.count.mockResolvedValue(0);
      mockPrisma.subscription.findMany.mockResolvedValue([]);

      await service.getHistory(user.id, { provider: 'apple_iap' });

      expect(mockPrisma.subscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ subscriptionType: 'apple_iap' }),
        }),
      );
    });

    it('should filter by date range', async () => {
      const user = createMockUser();

      mockPrisma.subscription.count.mockResolvedValue(0);
      mockPrisma.subscription.findMany.mockResolvedValue([]);

      await service.getHistory(user.id, {
        dateFrom: '2025-01-01',
        dateTo: '2025-12-31',
      });

      expect(mockPrisma.subscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should throw BadRequestException for invalid dateFrom', async () => {
      const user = createMockUser();

      await expect(
        service.getHistory(user.id, { dateFrom: 'not-a-date' }),
      ).rejects.toThrow('Invalid dateFrom');
    });

    it('should throw BadRequestException for invalid dateTo', async () => {
      const user = createMockUser();

      await expect(
        service.getHistory(user.id, { dateTo: 'not-a-date' }),
      ).rejects.toThrow('Invalid dateTo');
    });
  });

  describe('getHistoryWithSession', () => {
    it('should return history for valid session token', async () => {
      const user = createMockUser();
      const sub = createMockSubscription({ userId: user.id });

      (jwt.verify as jest.Mock).mockReturnValue({
        userId: user.id,
        type: 'session',
      });

      mockPrisma.subscription.count.mockResolvedValue(1);
      mockPrisma.subscription.findMany.mockResolvedValue([sub]);

      const result = await service.getHistoryWithSession('valid_token', {});

      expect(result.success).toBe(true);
      expect(result.data.events).toHaveLength(1);
    });

    it('should throw UnauthorizedException for invalid session token', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(
        service.getHistoryWithSession('invalid_token', {}),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for non-session token type', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({
        userId: 'user-1',
        type: 'refresh',
      });

      await expect(
        service.getHistoryWithSession('wrong_type_token', {}),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getHistoryEventDetails', () => {
    it('should return event details', async () => {
      const user = createMockUser();
      const sub = createMockSubscription({ userId: user.id });

      mockPrisma.subscription.findFirst.mockResolvedValue(sub);

      const result = await service.getHistoryEventDetails(user.id, sub.id);

      expect(result.success).toBe(true);
      expect(result.data.event.id).toBe(sub.id);
    });

    it('should throw NotFoundException for missing event', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      await expect(
        service.getHistoryEventDetails('user-1', 'event-1'),
      ).rejects.toThrow('Subscription history event not found');
    });
  });

  describe('cancel', () => {
    it('should cancel subscription successfully', async () => {
      const user = createMockUser();
      const subscription = createMockSubscription({
        userId: user.id,
        status: SubscriptionStatus.ACTIVE,
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
