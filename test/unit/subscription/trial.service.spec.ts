/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TrialService } from '../../../src/subscription/trial.service';
import {
  createMockPrismaClient,
  createMockConfigService,
  MockPrismaClient,
} from '../../setup/mocks';
import {
  createMockUser,
  createMockSubscription,
} from '../../setup/test-helpers';
import { SafeLogger } from '../../../src/common/utils/logger.util';

describe('TrialService', () => {
  let service: TrialService;
  let mockPrisma: MockPrismaClient;
  let mockConfigService: ReturnType<typeof createMockConfigService>;

  beforeEach(async () => {
    mockPrisma = createMockPrismaClient();
    mockConfigService = createMockConfigService();
    mockConfigService.get.mockReturnValue('true'); // Default enable trials

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrialService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<TrialService>(TrialService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('grantIfEligible', () => {
    it('should return false if feature flag is disabled', async () => {
      mockConfigService.get.mockReturnValue('false');
      const user = createMockUser();

      const result = await service.grantIfEligible(user, null);

      expect(result.granted).toBe(false);
      expect(result.reason).toBe('feature_disabled');
    });

    it('should return false if user already has a trial grant', async () => {
      const user = createMockUser();

      // Mock transaction to return existing grant
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        // Mock existing grant
        mockPrisma.trialGrant.findUnique.mockResolvedValue({
          id: 'grant-1',
          userId: user.id,
        } as any);
        return callback(mockPrisma);
      });

      const result = await service.grantIfEligible(user, null);

      expect(result.granted).toBe(false);
      expect(result.reason).toBe('existing_grant');
    });

    it('should return false if user has no active subscription', async () => {
      const user = createMockUser();

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        mockPrisma.trialGrant.findUnique.mockResolvedValue(null);
        mockPrisma.subscription.findFirst.mockResolvedValue(null);
        return callback(mockPrisma);
      });

      const result = await service.grantIfEligible(user, null);

      expect(result.granted).toBe(false);
      expect(result.reason).toBe('no_subscription');
    });

    it('should return false if device hash exists for another user', async () => {
      const user = createMockUser();
      const deviceHash = 'hash-1';

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        mockPrisma.trialGrant.findUnique.mockResolvedValue(null);
        mockPrisma.subscription.findFirst.mockResolvedValue(
          createMockSubscription(),
        );
        mockPrisma.deviceTrialFingerprint.findUnique.mockResolvedValue({
          userId: 'other-user',
          hash: deviceHash,
        } as any);
        return callback(mockPrisma);
      });

      const result = await service.grantIfEligible(user, deviceHash);

      expect(result.granted).toBe(false);
      expect(result.reason).toBe('device_hash_exists');
    });

    it('should grant trial if eligible and no device hash provided', async () => {
      const user = createMockUser();

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        mockPrisma.trialGrant.findUnique.mockResolvedValue(null);
        mockPrisma.subscription.findFirst.mockResolvedValue(
          createMockSubscription(),
        );
        mockPrisma.trialGrant.create.mockResolvedValue({
          id: 'new-grant',
        } as any);
        mockPrisma.user.update.mockResolvedValue(user);
        return callback(mockPrisma);
      });

      const result = await service.grantIfEligible(user, null);

      expect(result.granted).toBe(true);
      expect(mockPrisma.trialGrant.create).toHaveBeenCalled();
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: user.id },
          data: expect.objectContaining({ trialActive: true }),
        }),
      );
    });

    it('should grant trial and upsert device hash if eligible', async () => {
      const user = createMockUser();
      const deviceHash = 'new-hash';

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        mockPrisma.trialGrant.findUnique.mockResolvedValue(null);
        mockPrisma.subscription.findFirst.mockResolvedValue(
          createMockSubscription(),
        );
        mockPrisma.deviceTrialFingerprint.findUnique.mockResolvedValue(null);
        mockPrisma.deviceTrialFingerprint.upsert.mockResolvedValue({} as any);
        mockPrisma.trialGrant.create.mockResolvedValue({
          id: 'new-grant',
        } as any);
        mockPrisma.user.update.mockResolvedValue(user);
        return callback(mockPrisma);
      });

      const result = await service.grantIfEligible(user, deviceHash);

      expect(result.granted).toBe(true);
      expect(mockPrisma.deviceTrialFingerprint.upsert).toHaveBeenCalled();
    });

    it('should handle user provider being null', async () => {
      const user = createMockUser();
      (user as any).provider = null;
      const deviceHash = 'hash-provider-null';

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        mockPrisma.trialGrant.findUnique.mockResolvedValue(null);
        mockPrisma.subscription.findFirst.mockResolvedValue(
          createMockSubscription(),
        );
        mockPrisma.deviceTrialFingerprint.findUnique.mockResolvedValue(null);
        mockPrisma.deviceTrialFingerprint.upsert.mockResolvedValue({} as any);
        mockPrisma.trialGrant.create.mockResolvedValue({
          id: 'new-grant',
        } as any);
        mockPrisma.user.update.mockResolvedValue(user);
        return callback(mockPrisma);
      });

      await service.grantIfEligible(user, deviceHash);

      expect(mockPrisma.deviceTrialFingerprint.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ platform: undefined }),
        }),
      );
    });
  });

  describe('touchDeviceFingerprint', () => {
    it('should return early if no device hash', async () => {
      await service.touchDeviceFingerprint('user-1', null);
      expect(mockPrisma.deviceTrialFingerprint.upsert).not.toHaveBeenCalled();
    });

    it('should upsert fingerprint if provided with platform', async () => {
      await service.touchDeviceFingerprint('user-1', 'hash-1', 'ios');
      expect(mockPrisma.deviceTrialFingerprint.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { hash: 'hash-1' },
          create: expect.objectContaining({ platform: 'ios' }),
        }),
      );
    });

    it('should upsert fingerprint if provided without platform', async () => {
      await service.touchDeviceFingerprint('user-1', 'hash-1');
      expect(mockPrisma.deviceTrialFingerprint.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ platform: undefined }),
        }),
      );
    });
  });

  describe('expireIfNeeded', () => {
    it('should do nothing if trial not active', async () => {
      mockPrisma.$transaction.mockImplementation(async (cb) => {
        mockPrisma.user.findUnique.mockResolvedValue({
          trialActive: false,
        } as any);
        return cb(mockPrisma);
      });
      await service.expireIfNeeded('user-1');
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should expire trial if end date passed', async () => {
      const pastDate = new Date(Date.now() - 10000); // 10s ago
      mockPrisma.$transaction.mockImplementation(async (cb) => {
        mockPrisma.user.findUnique.mockResolvedValue({
          trialActive: true,
          trialEndsAt: pastDate,
        } as any);
        mockPrisma.user.update.mockResolvedValue({} as any);
        return cb(mockPrisma);
      });

      await service.expireIfNeeded('user-1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ trialActive: false }),
        }),
      );
    });

    it('should NOT expire trial if end date is in future', async () => {
      const futureDate = new Date(Date.now() + 86400000); // 1 day
      mockPrisma.$transaction.mockImplementation(async (cb) => {
        mockPrisma.user.findUnique.mockResolvedValue({
          trialActive: true,
          trialEndsAt: futureDate,
        } as any);
        return cb(mockPrisma);
      });

      await service.expireIfNeeded('user-1');

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should return early from expireIfNeeded if user fields missing', async () => {
      mockPrisma.$transaction.mockImplementation(async (cb) => {
        mockPrisma.user.findUnique.mockResolvedValue({
          trialActive: undefined, // Missing
        } as any);
        return cb(mockPrisma);
      });

      await service.expireIfNeeded('user-1');
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('status', () => {
    it('should throw if user not found', async () => {
      mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma)); // expireIfNeeded checks user
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.status('user-1')).rejects.toThrow('User not found');
    });

    it('should return status correctly', async () => {
      const futureDate = new Date(Date.now() + 86400000 * 5); // 5 days
      const user = {
        id: 'user-1',
        trialActive: true,
        trialEndsAt: futureDate,
        trialTier: 'free_trial',
      };

      mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));

      // expireIfNeeded mock
      mockPrisma.user.findUnique.mockResolvedValueOnce(user as any); // for expireIfNeeded

      // status findUnique
      mockPrisma.user.findUnique.mockResolvedValueOnce(user as any);

      mockPrisma.subscription.findFirst.mockResolvedValue(
        createMockSubscription(),
      );

      const result = await service.status('user-1');

      expect(result.trialActive).toBe(true);
      expect(result.tier).toBe('free_trial');
      expect(result.daysRemaining).toBeGreaterThan(0);
    });

    it('should return status correctly for inactive/null trial', async () => {
      const user = {
        id: 'user-1',
        trialActive: false,
        trialEndsAt: null,
        trialTier: null,
      };

      mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));
      mockPrisma.user.findUnique.mockResolvedValue(user as any);
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      const result = await service.status('user-1');

      expect(result.trialActive).toBe(false);
      expect(result.tier).toBeNull();
      expect(result.daysRemaining).toBe(0);
      expect(result.isPaid).toBe(false);
    });
  });
});
