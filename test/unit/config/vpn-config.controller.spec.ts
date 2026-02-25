import { Test, TestingModule } from '@nestjs/testing';
import { VPNConfigController } from '../../../src/config/vpn-config.controller';
import { VPNConfigService } from '../../../src/config/vpn-config.service';
import { SubscriptionService } from '../../../src/subscription/subscription.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../src/prisma/prisma.service';

describe('VPNConfigController', () => {
  let controller: VPNConfigController;
  let vpnConfigService: any;

  beforeEach(async () => {
    vpnConfigService = {
      getVPNConfig: jest.fn(),
      stripCredentials: jest.fn((config) => config),
      generateTokenBasedCredentials: jest.fn(),
      getActiveNodesSimplified: jest.fn(),
      processVpnConnection: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VPNConfigController],
      providers: [
        {
          provide: VPNConfigService,
          useValue: vpnConfigService,
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
  });

  describe('GET /config/vpn', () => {
    it('should return VPN nodes', async () => {
      const mockNodes = [{ id: 'node-1', region: 'us-east' }];
      vpnConfigService.getActiveNodesSimplified.mockResolvedValue(mockNodes);

      const result = await controller.getVPNConfig();

      expect(vpnConfigService.getActiveNodesSimplified).toHaveBeenCalled();
      expect(result).toEqual({
        status: 'ok',
        nodes: mockNodes,
      });
    });

    it('should propagate errors', async () => {
      vpnConfigService.getActiveNodesSimplified.mockRejectedValue(
        new Error('DB Error'),
      );
      await expect(controller.getVPNConfig()).rejects.toThrow('DB Error');
    });
  });

  describe('POST /config/vpn/credentials', () => {
    it('should return credentials', async () => {
      const mockCredentials = { username: 'user', password: 'pass' };
      vpnConfigService.processVpnConnection.mockResolvedValue(mockCredentials);

      const dto = {
        token: 'token',
        signature: 'sig',
        serverId: 's1',
        clientPublicKey: 'pk',
      };

      const result = await controller.getVPNCredentials(dto);

      expect(vpnConfigService.processVpnConnection).toHaveBeenCalledWith(
        dto.token,
        dto.signature,
        dto.serverId,
        dto.clientPublicKey,
      );
      expect(result).toEqual(mockCredentials);
    });
  });
});
