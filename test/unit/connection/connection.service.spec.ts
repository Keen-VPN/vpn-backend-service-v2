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
            serverLocation: 'US',
          }),
        }),
      );
    });

    it('should derive server_location from nodes when server_id is set', async () => {
      const sessionDto = {
        client_session_id: 'sess_node',
        event_type: 'END' as const,
        session_start: '2024-01-01T00:00:00Z',
        session_end: '2024-01-01T01:00:00Z',
        duration_seconds: 60,
        platform: 'ios',
        app_version: '1.0.0',
        server_id: 'node-abc',
        server_location: 'Legacy Label',
        subscription_tier: 'premium',
        bytes_transferred: 0,
      };

      mockPrisma.node.findUnique.mockResolvedValue({
        country: 'England',
        city: 'London',
      } as any);
      mockPrisma.connectionSession.upsert.mockResolvedValue({} as any);

      const result = await service.recordSession(sessionDto);

      expect(result.success).toBe(true);
      expect(mockPrisma.node.findUnique).toHaveBeenCalledWith({
        where: { id: 'node-abc' },
        select: { country: true, city: true },
      });
      expect(mockPrisma.connectionSession.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            serverLocation: 'United Kingdom · London',
          }),
          update: expect.objectContaining({
            serverLocation: 'United Kingdom · London',
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

  describe('recordIpAddressClick', () => {
    it('should record a privacy-safe IP address click event', async () => {
      mockPrisma.$executeRaw.mockResolvedValue(1 as any);

      const result = await service.recordIpAddressClick(
        {
          platform: 'ios',
          server_location: 'United States',
          connection_status: 'connected',
          ip_address_present: true,
          app_version: '1.0.0',
        },
        'user-123',
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });

    it('should store null properties when no app version is provided', async () => {
      mockPrisma.$executeRaw.mockResolvedValue(1 as any);

      const result = await service.recordIpAddressClick(
        {
          platform: 'ios',
          connection_status: 'connected',
          ip_address_present: true,
        },
        'user-123',
      );

      expect(result.success).toBe(true);
      const [, , , , , , , , propertiesJson] =
        mockPrisma.$executeRaw.mock.calls[0];
      expect(propertiesJson).toBeNull();
    });

    it('should handle errors when recording IP address click event', async () => {
      mockPrisma.$executeRaw.mockRejectedValue(new Error('Database error'));

      const result = await service.recordIpAddressClick(
        {
          platform: 'macos',
          connection_status: 'connected',
          ip_address_present: true,
        },
        'user-123',
      );

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

      // getConnectionStats issues four $queryRaw calls in parallel
      // (aggregate, per-platform, daily, top server locations). Mock in order.
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([
          {
            total_sessions: 3,
            total_duration_seconds: BigInt(900),
            average_duration_seconds: 300,
            total_bytes_transferred: BigInt(2048),
            max_duration_seconds: 400,
          },
        ] as any)
        .mockResolvedValueOnce([
          { platform: 'ios', sessions: 2, total_duration_seconds: BigInt(600) },
          {
            platform: 'macos',
            sessions: 1,
            total_duration_seconds: BigInt(300),
          },
        ] as any)
        .mockResolvedValueOnce([
          { day: day2, count: 1 },
          { day: day1, count: 2 },
        ] as any)
        .mockResolvedValueOnce([
          { server_location: 'Nigeria - Lagos', sessions: 2 },
          { server_location: 'US - Virginia', sessions: 1 },
        ] as any);

      const result = await service.getConnectionStats('user-123');

      expect(result.success).toBe(true);
      expect(result.data?.daily_connection_frequency).toHaveLength(14);
      expect(result.data).toEqual({
        total_sessions: 3,
        total_duration_seconds: 900,
        average_duration_seconds: 300,
        total_bytes_transferred: 2048,
        max_duration_seconds: 400,
        platform_breakdown: {
          ios: { sessions: 2, total_duration_seconds: 600 },
          macos: { sessions: 1, total_duration_seconds: 300 },
        },
        daily_connection_frequency: expect.any(Array),
        top_server_locations: [
          {
            display_name: 'Nigeria - Lagos',
            session_count: 2,
            percentage: 66.7,
          },
          {
            display_name: 'US - Virginia',
            session_count: 1,
            percentage: 33.3,
          },
        ],
      });
    });

    it('merges England and United Kingdom into one top location bucket', async () => {
      const now = new Date();
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([
          {
            total_sessions: 3,
            total_duration_seconds: BigInt(100),
            average_duration_seconds: 33,
            total_bytes_transferred: BigInt(0),
            max_duration_seconds: 50,
          },
        ] as any)
        .mockResolvedValueOnce([
          { platform: 'ios', sessions: 3, total_duration_seconds: BigInt(100) },
        ] as any)
        .mockResolvedValueOnce([{ day: now, count: 3 }] as any)
        .mockResolvedValueOnce([
          { server_location: 'England', sessions: 2 },
          { server_location: 'United Kingdom', sessions: 1 },
        ] as any);

      const result = await service.getConnectionStats('user-123');

      expect(result.success).toBe(true);
      expect(result.data?.top_server_locations).toEqual([
        {
          display_name: 'United Kingdom',
          session_count: 3,
          percentage: 100,
        },
      ]);
    });

    it('should handle aggregation errors', async () => {
      mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('aggregate failed'));

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
          heartbeatTimestamp: end,
          updatedAt: end,
          platform: 'ios',
          appVersion: '1.2.3',
          serverLocation: 'Nigeria · Lagos',
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
            server_location: 'Nigeria · Lagos',
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

    it('should derive effective duration for open sessions from heartbeat', async () => {
      const start = new Date('2026-04-15T09:00:00.000Z');
      const heartbeat = new Date('2026-04-15T09:03:30.000Z');
      mockPrisma.connectionSession.findMany.mockResolvedValue([
        {
          id: 'session-open-1',
          sessionStart: start,
          sessionEnd: null,
          durationSeconds: 0,
          heartbeatTimestamp: heartbeat,
          updatedAt: heartbeat,
          platform: 'ios_extension',
          appVersion: null,
          serverLocation: 'United Kingdom · London',
        },
      ] as any);

      const result = await service.getConnectionSessions('user-123', 50, 0);

      expect(result.success).toBe(true);
      expect(result.data?.[0]).toEqual(
        expect.objectContaining({
          id: 'session-open-1',
          duration_seconds: 210,
          platform: 'ios_extension',
          session_end: null,
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
