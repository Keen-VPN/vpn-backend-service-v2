import { Test, TestingModule } from '@nestjs/testing';
import { VPNConfigController } from '../../../src/config/vpn-config.controller';
import { VPNConfigService } from '../../../src/config/vpn-config.service';
import { SubscriptionService } from '../../../src/subscription/subscription.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { Request } from 'express';

describe('VPNConfigController', () => {
  let controller: VPNConfigController;
  let vpnConfigService: jest.Mocked<VPNConfigService>;

  beforeEach(async () => {
    const mockVPNConfigService = {
      getVPNConfig: jest.fn(),
      stripCredentials: jest.fn((config) => config),
      generateTokenBasedCredentials: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VPNConfigController],
      providers: [
        {
          provide: VPNConfigService,
          useValue: mockVPNConfigService,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: PrismaService,
          useValue: { user: { findUnique: jest.fn() } },
        },
        {
          provide: SubscriptionService,
          useValue: { getStatusWithSession: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<VPNConfigController>(VPNConfigController);
    vpnConfigService = module.get(VPNConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /config/vpn', () => {
    it('should return VPN config', async () => {
      const mockConfig = {
        version: '1.0.0',
        updatedAt: null,
        servers: [
          {
            id: 'us-east',
            name: 'United States',
            country: 'United States',
            city: 'Virginia',
            serverAddress: '1.2.3.4',
            credentialId: 'client',
          },
        ],
        credentials: [
          {
            id: 'client',
            username: 'client',
            password: 'password',
          },
        ],
      };

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn().mockReturnThis(),
        end: jest.fn().mockReturnThis(),
      };

      vpnConfigService.getVPNConfig.mockResolvedValue({
        status: 'ok',
        config: mockConfig,
        etag: 'W/"abc123"',
      });

      const mockRequest = {
        user: { uid: 'user-123' },
        headers: {},
      } as unknown as Request;

      await controller.getVPNConfig(
        mockRequest,
        undefined,
        mockResponse as any,
      );

      expect(vpnConfigService.getVPNConfig).toHaveBeenCalledWith(
        undefined,
        undefined,
      );
      // ETag header is no longer set by controller logic for 304 checks, but might be set as response header?
      // The controller implementation sets Cache-Control no-store and NO ETag header explicitly from the service result, just JSON body.
      // Wait, let me check the controller code again.
      // It sends JSON(configToSend).
      // It does NOT set ETag header explicitly in the code snippet I saw (lines 103-106).

      expect(mockResponse.end).toHaveBeenCalledWith(JSON.stringify(mockConfig));
    });

    it('should return 500 if config is not available', async () => {
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn().mockReturnThis(),
        end: jest.fn().mockReturnThis(),
      };

      vpnConfigService.getVPNConfig.mockResolvedValue({
        status: 'ok',
        etag: 'W/"abc123"',
      });

      const mockRequest = {
        user: { uid: 'user-123' },
        headers: {},
      } as unknown as Request;

      await controller.getVPNConfig(
        mockRequest,
        undefined,
        mockResponse as any,
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'VPN config not available',
      });
    });
  });
});
