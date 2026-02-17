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
});
