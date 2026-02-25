import { Test, TestingModule } from '@nestjs/testing';
import { VPNConfigController } from '../../../src/config/vpn-config.controller';
import { VPNConfigService } from '../../../src/config/vpn-config.service';

describe('VPNConfigController', () => {
  let controller: VPNConfigController;
  let vpnConfigService: any;

  beforeEach(async () => {
    vpnConfigService = {
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
      ],
    }).compile();

    controller = module.get<VPNConfigController>(VPNConfigController);
  });

  describe('GET /config/vpn', () => {
    it('should return VPN nodes', async () => {
      const mockNodes = [{ node_id: 'node-1', region: 'us-east' }];
      vpnConfigService.getActiveNodesSimplified.mockResolvedValue(mockNodes);

      const result = await controller.getActiveNodes();

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
      await expect(controller.getActiveNodes()).rejects.toThrow('DB Error');
    });
  });

  describe('POST /config/vpn/credentials', () => {
    it('should return credentials', async () => {
      const mockCredentials = { publicKey: 'pk', ip: '1.2.3.4' };
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
