import { Test, TestingModule } from '@nestjs/testing';
import { VPNConfigService } from '../../../src/config/vpn-config.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { CryptoService } from '../../../src/crypto/crypto.service';
import { NodeStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

jest.mock('fs');
jest.mock('path');
jest.mock('axios');

describe('VPNConfigService', () => {
  let service: VPNConfigService;
  let mockPrisma: any;
  let mockConfigService: any;
  let mockCryptoService: any;

  beforeEach(async () => {
    mockPrisma = {
      node: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      nodeClient: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        count: jest.fn(),
      },
    };
    mockConfigService = {
      get: jest.fn().mockReturnValue('test-token'),
    };
    mockCryptoService = {
      verifyBlindSignedToken: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VPNConfigService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: CryptoService, useValue: mockCryptoService },
      ],
    }).compile();

    service = module.get<VPNConfigService>(VPNConfigService);
    (path.join as jest.Mock).mockReturnValue('mock-path');
  });

  describe('getActiveNodesSimplified', () => {
    it('should return online nodes', async () => {
      const mockNodes = [
        {
          id: 'n1',
          publicKey: 'pk1',
          ip: '1.1.1.1',
          status: NodeStatus.ONLINE,
        },
      ];
      mockPrisma.node.findMany.mockResolvedValue(mockNodes);

      const result = await service.getActiveNodesSimplified();

      expect(mockPrisma.node.findMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('n1');
    });
  });

  describe('processVpnConnection', () => {
    it('should process connection successfully for new client', async () => {
      const mockNode = {
        id: 's1',
        ip: '1.2.3.4',
        publicKey: 'node-pk',
        status: NodeStatus.ONLINE,
      };
      mockPrisma.node.findUnique.mockResolvedValue(mockNode);
      mockPrisma.nodeClient.findUnique.mockResolvedValue(null);
      mockPrisma.nodeClient.count.mockResolvedValue(0);
      mockPrisma.nodeClient.upsert.mockResolvedValue({ id: 'c1' });
      (axios.post as jest.Mock).mockResolvedValue({ status: 201 });

      const result = await service.processVpnConnection(
        'token',
        'sig',
        's1',
        'client-pk',
      );

      expect(mockCryptoService.verifyBlindSignedToken).toHaveBeenCalled();
      expect(result).toEqual({
        publicKey: 'node-pk',
        ip: '1.2.3.4',
        internalIp: '10.66.0.2/32',
      });
      expect(mockPrisma.nodeClient.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientPublicKey: 'client-pk' },
          create: expect.objectContaining({ nodeId: 's1' }),
        }),
      );
    });

    it('should reuse internal IP if client is on the same server', async () => {
      const mockNode = {
        id: 's1',
        ip: '1.2.3.4',
        publicKey: 'node-pk',
        status: NodeStatus.ONLINE,
      };
      const mockExisting = {
        id: 'c1',
        nodeId: 's1',
        allowedIps: '10.66.0.5/32',
      };
      mockPrisma.node.findUnique.mockResolvedValue(mockNode);
      mockPrisma.nodeClient.findUnique.mockResolvedValue(mockExisting);
      mockPrisma.nodeClient.upsert.mockResolvedValue(mockExisting);
      (axios.post as jest.Mock).mockResolvedValue({ status: 200 });

      const result = await service.processVpnConnection(
        'token',
        'sig',
        's1',
        'client-pk',
      );

      expect(result.internalIp).toBe('10.66.0.5/32');
      expect(mockPrisma.nodeClient.count).not.toHaveBeenCalled();
    });

    it('should migrate client and assign new IP if switching servers', async () => {
      const mockNodeB = {
        id: 's2',
        ip: '2.2.2.2',
        publicKey: 'node-pk-b',
        status: NodeStatus.ONLINE,
      };
      const mockExistingA = {
        id: 'c1',
        nodeId: 's1',
        allowedIps: '10.66.0.5/32',
      };

      mockPrisma.node.findUnique.mockResolvedValue(mockNodeB);
      mockPrisma.nodeClient.findUnique.mockResolvedValue(mockExistingA);
      mockPrisma.nodeClient.count.mockResolvedValue(10); // 10 existing on Node B
      mockPrisma.nodeClient.upsert.mockResolvedValue({
        ...mockExistingA,
        nodeId: 's2',
      });
      (axios.post as jest.Mock).mockResolvedValue({ status: 200 });

      const result = await service.processVpnConnection(
        'token',
        'sig',
        's2',
        'client-pk',
      );

      expect(result.internalIp).toBe('10.66.0.12/32'); // 10 + 2 = 12
      expect(mockPrisma.nodeClient.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            nodeId: 's2',
            allowedIps: '10.66.0.12/32',
          }),
        }),
      );
    });
  });
});
