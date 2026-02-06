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

describe('ConnectionController', () => {
  let controller: ConnectionController;
  let connectionService: jest.Mocked<ConnectionService>;

  beforeEach(async () => {
    const mockConnectionService = {
      recordSession: jest.fn(),
      getSessions: jest.fn(),
      getStats: jest.fn(),
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
      const user = { uid: 'user_123', email: 'test@example.com' };

      connectionService.recordSession.mockResolvedValue({
        success: true,
      });

      const result = await controller.recordSession(sessionDto, user as any);

      expect(result.success).toBe(true);
      expect(connectionService.recordSession).toHaveBeenCalledWith(
        user.uid,
        sessionDto,
      );
    });
  });

  describe('GET /connection/sessions/:email', () => {
    it('should return sessions for user', async () => {
      const email = 'test@example.com';
      const user = { uid: 'user_123', email: 'test@example.com' };

      connectionService.getSessions.mockResolvedValue({
        success: true,
        data: [
          {
            id: 'session_1',
            session_start: '2024-01-01T00:00:00Z',
            session_end: '2024-01-01T01:00:00Z',
            duration_seconds: 3600,
            platform: 'macOS',
            app_version: '1.0.0',
          },
        ],
      });

      const result = await controller.getSessions(
        email,
        user as any,
        '50',
        '0',
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(connectionService.getSessions).toHaveBeenCalledWith(email, 50, 0);
    });

    it('should throw UnauthorizedException if email does not match', async () => {
      const email = 'other@example.com';
      const user = { uid: 'user_123', email: 'test@example.com' };

      await expect(
        controller.getSessions(email, user as any, '50', '0'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('GET /connection/stats/:email', () => {
    it('should return stats for user', async () => {
      const email = 'test@example.com';
      const user = { uid: 'user_123', email: 'test@example.com' };

      connectionService.getStats.mockResolvedValue({
        success: true,
        data: {
          total_sessions: 10,
          total_duration_seconds: 36000,
          average_duration_seconds: 3600,
          platform_breakdown: {
            macOS: {
              sessions: 10,
              total_duration: 36000,
            },
          },
        },
      });

      const result = await controller.getStats(email, user as any);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.total_sessions).toBe(10);
      expect(connectionService.getStats).toHaveBeenCalledWith(email);
    });

    it('should throw UnauthorizedException if email does not match', async () => {
      const email = 'other@example.com';
      const user = { uid: 'user_123', email: 'test@example.com' };

      await expect(controller.getStats(email, user as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
