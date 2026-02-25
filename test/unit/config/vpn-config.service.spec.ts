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
        findFirst: jest.fn(),
        create: jest.fn(),
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
    it('should process connection successfully', async () => {
      const mockNode = { id: 's1', ip: '1.2.3.4', status: NodeStatus.ONLINE };
      mockPrisma.node.findUnique.mockResolvedValue(mockNode);
      mockPrisma.node.findMany.mockResolvedValue([mockNode]);
      mockPrisma.nodeClient.findFirst.mockResolvedValue(null);
      mockPrisma.nodeClient.create.mockResolvedValue({ id: 'c1' });
      (axios.post as jest.Mock).mockResolvedValue({ status: 201 });

      const result = await service.processVpnConnection(
        'token',
        'sig',
        's1',
        'client-pk',
      );

      expect(mockCryptoService.verifyBlindSignedToken).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.ip).toBe('1.2.3.4');
    });
  });

  describe('generateTokenBasedCredentials', () => {
    it('should return legacy credentials for compatibility', async () => {
      const mockNode = { id: 's1', ip: '1.2.3.4', status: NodeStatus.ONLINE };
      mockPrisma.node.findMany.mockResolvedValue([mockNode]);

      const result = await service.generateTokenBasedCredentials(
        'token',
        'sig',
        's1',
      );

      expect(result.serverAddress).toBe('1.2.3.4');
      expect(result.username).toBeDefined();
    });
  });

  describe('stripCredentials', () => {
    it('should remove credentials property', () => {
      const config: any = { servers: [], credentials: [1, 2, 3] };
      const result = service.stripCredentials(config);
      expect((result as any).credentials).toEqual([]);
    });
  });
});
