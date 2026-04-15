import { Test, TestingModule } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { PreferencesService } from '../../../src/preferences/preferences.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { NotificationService } from '../../../src/notification/notification.service';
import { createMockPrismaClient, MockPrismaClient } from '../../setup/mocks';

describe('PreferencesService', () => {
  let service: PreferencesService;
  let mockPrisma: MockPrismaClient;
  const mockNotificationService = {
    notifyServerLocationRequest: jest.fn().mockResolvedValue(undefined),
  };
  const mockModuleRef = {
    get: jest.fn((token: unknown) => {
      if (token === NotificationService) return mockNotificationService;
      return undefined;
    }),
  };

  beforeEach(async () => {
    mockPrisma = createMockPrismaClient();
    mockModuleRef.get.mockImplementation((token: unknown) => {
      if (token === NotificationService) return mockNotificationService;
      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreferencesService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: ModuleRef,
          useValue: mockModuleRef,
        },
      ],
    }).compile();

    service = module.get<PreferencesService>(PreferencesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('submitServerLocationPreference', () => {
    it('should create preference with region and reason only', async () => {
      const body = { region: 'DE', reason: 'Need EU server for compliance' };
      const created = {
        id: 'pref_1',
        region: body.region,
        reason: body.reason,
        createdAt: new Date('2024-01-15T10:00:00Z'),
        updatedAt: new Date('2024-01-15T10:00:00Z'),
      };

      mockPrisma.serverLocationPreference.create.mockResolvedValue(
        created as any,
      );

      const result = await service.submitServerLocationPreference(body);

      expect(mockPrisma.serverLocationPreference.create).toHaveBeenCalledWith({
        data: { region: body.region, reason: body.reason },
      });
      expect(result).toEqual({
        id: created.id,
        region: created.region,
        reason: created.reason,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      });
    });

    it('should not pass client_session_id or userId to create', async () => {
      const body = { region: 'US', reason: 'Closer to home' };
      mockPrisma.serverLocationPreference.create.mockResolvedValue({
        id: 'pref_2',
        region: body.region,
        reason: body.reason,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      await service.submitServerLocationPreference(body);

      const createCall =
        mockPrisma.serverLocationPreference.create.mock.calls[0][0];
      expect(createCall.data).toEqual({
        region: body.region,
        reason: body.reason,
      });
      expect(createCall.data).not.toHaveProperty('client_session_id');
      expect(createCall.data).not.toHaveProperty('clientSessionId');
      expect(createCall.data).not.toHaveProperty('user_id');
      expect(createCall.data).not.toHaveProperty('userId');
    });

    it('should return response without userId or client_session_id', async () => {
      const body = { region: 'JP', reason: 'Low latency to Asia' };
      mockPrisma.serverLocationPreference.create.mockResolvedValue({
        id: 'pref_3',
        region: body.region,
        reason: body.reason,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await service.submitServerLocationPreference(body);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('region', body.region);
      expect(result).toHaveProperty('reason', body.reason);
      expect(result).toHaveProperty('createdAt');
      expect(result).toHaveProperty('updatedAt');
      expect(result).not.toHaveProperty('userId');
      expect(result).not.toHaveProperty('client_session_id');
    });

    it('should propagate errors when create fails', async () => {
      const body = { region: 'FR', reason: 'Test' };
      mockPrisma.serverLocationPreference.create.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.submitServerLocationPreference(body),
      ).rejects.toThrow('Database error');
    });

    it('should send Slack notification after successful save', async () => {
      const body = { region: 'NL', reason: 'Privacy laws' };
      const created = {
        id: 'pref_slack',
        region: body.region,
        reason: body.reason,
        createdAt: new Date('2026-04-10T14:30:00Z'),
        updatedAt: new Date('2026-04-10T14:30:00Z'),
      };

      mockPrisma.serverLocationPreference.create.mockResolvedValue(
        created as any,
      );

      await service.submitServerLocationPreference(body);

      expect(
        mockNotificationService.notifyServerLocationRequest,
      ).toHaveBeenCalledWith({
        region: 'NL',
        reason: 'Privacy laws',
        createdAt: '2026-04-10T14:30:00.000Z',
      });
    });

    it('should still return success when NotificationService cannot be resolved', async () => {
      const body = { region: 'SE', reason: 'Testing DI resilience' };
      const created = {
        id: 'pref_noresolve',
        region: body.region,
        reason: body.reason,
        createdAt: new Date('2026-04-10T14:30:00Z'),
        updatedAt: new Date('2026-04-10T14:30:00Z'),
      };

      mockPrisma.serverLocationPreference.create.mockResolvedValue(
        created as any,
      );
      mockModuleRef.get.mockImplementationOnce(() => {
        throw new Error('Nest can not export a provider');
      });

      const result = await service.submitServerLocationPreference(body);

      expect(result.region).toBe('SE');
      expect(
        mockNotificationService.notifyServerLocationRequest,
      ).not.toHaveBeenCalled();
    });

    it('should still return success if Slack notification fails', async () => {
      const body = { region: 'BR', reason: 'Closer servers' };
      const created = {
        id: 'pref_fail',
        region: body.region,
        reason: body.reason,
        createdAt: new Date('2026-04-10T14:30:00Z'),
        updatedAt: new Date('2026-04-10T14:30:00Z'),
      };

      mockPrisma.serverLocationPreference.create.mockResolvedValue(
        created as any,
      );
      mockNotificationService.notifyServerLocationRequest.mockRejectedValueOnce(
        new Error('Slack down'),
      );

      const result = await service.submitServerLocationPreference(body);

      expect(result).toEqual({
        id: 'pref_fail',
        region: 'BR',
        reason: 'Closer servers',
        createdAt: '2026-04-10T14:30:00.000Z',
        updatedAt: '2026-04-10T14:30:00.000Z',
      });
    });
  });
});
