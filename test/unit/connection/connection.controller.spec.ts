import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConnectionController } from '../../../src/connection/connection.controller';
import { ConnectionService } from '../../../src/connection/connection.service';
import { SessionAuthGuard } from '../../../src/auth/guards/session-auth.guard';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../src/prisma/prisma.service';
import {
  createMockConfigService,
  createMockPrismaClient,
} from '../../setup/mocks';

import { ConnectionSessionDto } from '../../../src/common/dto/connection-session.dto';

describe('ConnectionController', () => {
  let controller: ConnectionController;
  let connectionService: jest.Mocked<ConnectionService>;

  beforeEach(async () => {
    const mockConnectionService = {
      recordSession: jest.fn(),
      getConnectionStats: jest.fn(),
      getConnectionSessions: jest.fn(),
    };
    const mockConfigService = createMockConfigService();
    const mockPrismaService = createMockPrismaClient();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConnectionController],
      providers: [
        {
          provide: ConnectionService,
          useValue: mockConnectionService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        SessionAuthGuard,
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .compile();

    controller = module.get<ConnectionController>(ConnectionController);
    connectionService = module.get(ConnectionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /connection/session', () => {
    it('should record session successfully', async () => {
      const sessionDto: ConnectionSessionDto = {
        client_session_id: 'sess-123',
        event_type: 'START',
        session_start: new Date().toISOString(),
        session_end: new Date().toISOString(),
        duration_seconds: 3600,
        platform: 'macOS',
        app_version: '1.0.0',
        server_location: 'US',
        subscription_tier: 'premium',
        bytes_transferred: 1000000,
        protocol: 'wireguard',
        network_type: 'wifi',
      };

      connectionService.recordSession.mockResolvedValue({
        success: true,
      });

      const mockUser = { uid: 'user-123' };
      const result = await controller.recordSession(mockUser, sessionDto);

      expect(result.success).toBe(true);
      expect(connectionService.recordSession).toHaveBeenCalledWith(
        sessionDto,
        mockUser.uid,
      );
    });
  });

  describe('GET /connection/stats', () => {
    it('should return connection stats', async () => {
      const mockStats = {
        success: true,
        data: {
          total_sessions: 12,
          total_duration_seconds: 3600,
          average_duration_seconds: 300,
          total_bytes_transferred: 1024,
          max_duration_seconds: 600,
          platform_breakdown: {
            ios: { sessions: 7, total_duration_seconds: 2100 },
            macos: { sessions: 5, total_duration_seconds: 1500 },
          },
          daily_connection_frequency: [],
        },
      };
      connectionService.getConnectionStats.mockResolvedValue(mockStats);

      const mockUser = { uid: 'user-123' };
      const result = await controller.getConnectionStats(mockUser);

      expect(result).toEqual(mockStats);
      expect(connectionService.getConnectionStats).toHaveBeenCalledWith(
        mockUser.uid,
      );
    });
  });

  describe('GET /connection/sessions', () => {
    it('should return connection sessions', async () => {
      const mockSessions = {
        success: true,
        data: [
          {
            id: 'session-1',
            session_start: new Date().toISOString(),
            session_end: null,
            duration_seconds: 120,
            platform: 'ios',
            app_version: '1.0.0',
          },
        ],
      };
      connectionService.getConnectionSessions.mockResolvedValue(mockSessions);

      const mockUser = { uid: 'user-123' };
      const result = await controller.getConnectionSessions(mockUser, 50, 0);

      expect(result).toEqual(mockSessions);
      expect(connectionService.getConnectionSessions).toHaveBeenCalledWith(
        mockUser.uid,
        50,
        0,
      );
    });
  });
});
