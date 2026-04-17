import { Test, TestingModule } from '@nestjs/testing';
import { ConnectionService } from '../../../src/connection/connection.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { NodesService } from '../../../src/nodes/nodes.service';
import { createMockPrismaClient, MockPrismaClient } from '../../setup/mocks';

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
        {
          provide: NodesService,
          useValue: {
            getActiveNodesInRegion: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ConnectionService>(ConnectionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recordSession', () => {
    it('should record session successfully by client_session_id', async () => {
      const sessionDto = {
        client_session_id: 'sess_123',
        event_type: 'START' as const,
        session_start: '2024-01-01T00:00:00Z',
        session_end: '2024-01-01T01:00:00Z',
        duration_seconds: 3600,
        platform: 'macOS',
        app_version: '1.0.0',
        server_location: 'US',
        server_address: '1.2.3.4',
        subscription_tier: 'premium',
        bytes_transferred: 1000000,
      };

      mockPrisma.connectionSession.upsert.mockResolvedValue({
        id: 'session_1',
        clientSessionId: sessionDto.client_session_id,
        sessionStart: new Date(sessionDto.session_start),
        sessionEnd: new Date(sessionDto.session_end),
        durationSeconds: sessionDto.duration_seconds,
        platform: sessionDto.platform,
        appVersion: sessionDto.app_version,
        serverLocation: sessionDto.server_location,
        subscriptionTier: sessionDto.subscription_tier,
        bytesTransferred: BigInt(sessionDto.bytes_transferred),
        terminationReason: 'USER_TERMINATION',
        eventType: 'SESSION_START',
        heartbeatTimestamp: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await service.recordSession(sessionDto);

      expect(result.success).toBe(true);
      expect(mockPrisma.connectionSession.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientSessionId: sessionDto.client_session_id },
          create: expect.objectContaining({
            clientSessionId: sessionDto.client_session_id,
          }),
        }),
      );
    });

    it('should handle errors when recording session', async () => {
      const sessionDto = {
        client_session_id: 'sess_123',
        event_type: 'START' as const,
        session_start: '2024-01-01T00:00:00Z',
        duration_seconds: 3600,
        platform: 'macOS',
        app_version: '1.0.0',
        server_location: 'US',
        server_address: '1.2.3.4',
        subscription_tier: 'premium',
      };

      mockPrisma.connectionSession.upsert.mockRejectedValue(
        new Error('Database error'),
      );

      const result = await service.recordSession(sessionDto);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getConnectionStats', () => {
    it('should return aggregated stats with platform breakdown', async () => {
      const now = new Date();
      const day1 = new Date(now);
      day1.setDate(now.getDate() - 1);
      const day2 = new Date(now);
      day2.setDate(now.getDate() - 2);

      mockPrisma.connectionSession.aggregate.mockResolvedValue({
        _count: { _all: 3 },
        _sum: {
          durationSeconds: 900,
          bytesTransferred: BigInt(2048),
        },
        _avg: {
          durationSeconds: 300,
        },
      } as any);

      mockPrisma.connectionSession.groupBy.mockResolvedValue([
        {
          platform: 'ios',
          _count: { _all: 2 },
          _sum: { durationSeconds: 600 },
        },
        {
          platform: 'macos',
          _count: { _all: 1 },
          _sum: { durationSeconds: 300 },
        },
      ] as any);
      mockPrisma.$queryRaw.mockResolvedValue([
        { day: day2, count: 1 },
        { day: day1, count: 2 },
      ] as any);

      const result = await service.getConnectionStats('user-123');

      expect(result.success).toBe(true);
      expect(result.data?.daily_connection_frequency).toHaveLength(14);
      expect(result.data).toEqual({
        total_sessions: 3,
        total_duration_seconds: 900,
        average_duration_seconds: 300,
        total_bytes_transferred: 2048,
        platform_breakdown: {
          ios: { sessions: 2, total_duration_seconds: 600 },
          macos: { sessions: 1, total_duration_seconds: 300 },
        },
        daily_connection_frequency: expect.any(Array),
      });
    });

    it('should handle aggregation errors', async () => {
      mockPrisma.connectionSession.aggregate.mockRejectedValue(
        new Error('aggregate failed'),
      );

      const result = await service.getConnectionStats('user-123');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getConnectionSessions', () => {
    it('should return paginated sessions in API shape', async () => {
      const start = new Date('2026-04-15T09:00:00.000Z');
      const end = new Date('2026-04-15T09:05:00.000Z');
      mockPrisma.connectionSession.findMany.mockResolvedValue([
        {
          id: 'session-1',
          sessionStart: start,
          sessionEnd: end,
          durationSeconds: 300,
          platform: 'ios',
          appVersion: '1.2.3',
        },
      ] as any);

      const result = await service.getConnectionSessions('user-123', 50, 0);

      expect(result).toEqual({
        success: true,
        data: [
          {
            id: 'session-1',
            session_start: start.toISOString(),
            session_end: end.toISOString(),
            duration_seconds: 300,
            platform: 'ios',
            app_version: '1.2.3',
          },
        ],
      });
      expect(mockPrisma.connectionSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
          skip: 0,
        }),
      );
    });

    it('should handle errors fetching sessions', async () => {
      mockPrisma.connectionSession.findMany.mockRejectedValue(
        new Error('find failed'),
      );

      const result = await service.getConnectionSessions('user-123', 50, 0);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
