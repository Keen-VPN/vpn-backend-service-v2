import { Test, TestingModule } from '@nestjs/testing';
import { ConnectionService } from '../../../src/connection/connection.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import {
  createMockPrismaClient,
  MockPrismaClient,
} from '../../setup/mocks';
import { createMockUser } from '../../setup/test-helpers';

describe('ConnectionService', () => {
  let service: ConnectionService;
  let mockPrisma: MockPrismaClient;

  beforeEach(async () => {
    mockPrisma = createMockPrismaClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectionService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<ConnectionService>(ConnectionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recordSession', () => {
    it('should record session successfully', async () => {
      const userId = 'user_123';
      const sessionDto = {
        email: 'test@example.com',
        session_start: '2024-01-01T00:00:00Z',
        session_end: '2024-01-01T01:00:00Z',
        duration_seconds: 3600,
        platform: 'macOS',
        app_version: '1.0.0',
        server_location: 'US',
        server_address: '1.2.3.4',
        subscription_tier: 'premium',
        bytes_transferred: '1000000',
      };

      mockPrisma.connectionSession.create.mockResolvedValue({
        id: 'session_1',
        userId,
        sessionStart: new Date(sessionDto.session_start),
        sessionEnd: new Date(sessionDto.session_end),
        durationSeconds: sessionDto.duration_seconds,
        platform: sessionDto.platform,
        appVersion: sessionDto.app_version,
        serverLocation: sessionDto.server_location,
        serverAddress: sessionDto.server_address,
        subscriptionTier: sessionDto.subscription_tier,
        bytesTransferred: BigInt(sessionDto.bytes_transferred),
        isAnonymized: false,
        terminationReason: 'USER_TERMINATION',
        eventType: 'SESSION_START',
        heartbeatTimestamp: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await service.recordSession(userId, sessionDto);

      expect(result.success).toBe(true);
      expect(mockPrisma.connectionSession.create).toHaveBeenCalled();
    });

    it('should handle errors when recording session', async () => {
      const userId = 'user_123';
      const sessionDto = {
        email: 'test@example.com',
        session_start: '2024-01-01T00:00:00Z',
        duration_seconds: 3600,
        platform: 'macOS',
      };

      mockPrisma.connectionSession.create.mockRejectedValue(
        new Error('Database error'),
      );

      const result = await service.recordSession(userId, sessionDto);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getSessions', () => {
    it('should return sessions for user', async () => {
      const email = 'test@example.com';
      const user = createMockUser({ email });
      const sessions = [
        {
          id: 'session_1',
          userId: user.id,
          sessionStart: new Date('2024-01-01T00:00:00Z'),
          sessionEnd: new Date('2024-01-01T01:00:00Z'),
          durationSeconds: 3600,
          platform: 'macOS',
          appVersion: '1.0.0',
        },
      ];

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.connectionSession.findMany.mockResolvedValue(sessions as any);

      const result = await service.getSessions(email, 50, 0);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.length).toBe(1);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email },
      });
    });

    it('should return error if user not found', async () => {
      const email = 'test@example.com';

      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getSessions(email, 50, 0);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });
  });

  describe('getStats', () => {
    it('should return stats for user', async () => {
      const email = 'test@example.com';
      const user = createMockUser({ email });
      const sessions = [
        {
          id: 'session_1',
          userId: user.id,
          durationSeconds: 3600,
          platform: 'macOS',
        },
        {
          id: 'session_2',
          userId: user.id,
          durationSeconds: 1800,
          platform: 'macOS',
        },
      ];

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.connectionSession.findMany.mockResolvedValue(sessions as any);

      const result = await service.getStats(email);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.total_sessions).toBe(2);
      expect(result.data?.total_duration_seconds).toBe(5400);
      expect(result.data?.average_duration_seconds).toBe(2700);
    });

    it('should return error if user not found', async () => {
      const email = 'test@example.com';

      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getStats(email);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });
  });
});

