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

      const result = await controller.recordSession(sessionDto);

      expect(result.success).toBe(true);
      expect(connectionService.recordSession).toHaveBeenCalledWith(sessionDto);
    });
  });
});
