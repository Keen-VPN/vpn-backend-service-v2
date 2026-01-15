import { Test, TestingModule } from '@nestjs/testing';
import { VPNConfigController } from '../../../src/config/vpn-config.controller';
import { VPNConfigService } from '../../../src/config/vpn-config.service';

describe('VPNConfigController', () => {
  let controller: VPNConfigController;
  let vpnConfigService: jest.Mocked<VPNConfigService>;

  beforeEach(async () => {
    const mockVPNConfigService = {
      getVPNConfig: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VPNConfigController],
      providers: [
        {
          provide: VPNConfigService,
          useValue: mockVPNConfigService,
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

      await controller.getVPNConfig(undefined, undefined, mockResponse as any);

      expect(vpnConfigService.getVPNConfig).toHaveBeenCalledWith(
        undefined,
        undefined,
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith('ETag', '"W/"abc123""');
      expect(mockResponse.json).toHaveBeenCalledWith(mockConfig);
    });

    it('should return 304 Not Modified when etag matches', async () => {
      const etag = 'W/"abc123"';
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn().mockReturnThis(),
        end: jest.fn().mockReturnThis(),
      };

      vpnConfigService.getVPNConfig.mockResolvedValue({
        status: 'not-modified',
        etag: 'W/"abc123"',
      });

      await controller.getVPNConfig(`"${etag}"`, undefined, mockResponse as any);

      expect(vpnConfigService.getVPNConfig).toHaveBeenCalledWith(
        etag,
        undefined,
      );
      expect(mockResponse.status).toHaveBeenCalledWith(304);
      expect(mockResponse.end).toHaveBeenCalled();
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

      await controller.getVPNConfig(undefined, undefined, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'VPN config not available',
      });
    });
  });
});

