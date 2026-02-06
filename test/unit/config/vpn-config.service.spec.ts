import { Test, TestingModule } from '@nestjs/testing';
import { VPNConfigService } from '../../../src/config/vpn-config.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../src/prisma/prisma.service';
import {
  createMockConfigService,
  createMockPrismaClient,
  createMockCryptoService,
  MockPrismaClient,
} from '../../setup/mocks';
import { CryptoService } from '../../../src/auth/crypto/crypto.service';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs');
jest.mock('path');

// Added mock function for CryptoService
const createMockCryptoService = () => ({
  verifyBlindSignedToken: jest.fn(),
});

describe('VPNConfigService', () => {
  let service: VPNConfigService;
  let mockPrisma: MockPrismaClient;
  let mockConfigService: ReturnType<typeof createMockConfigService>;

  beforeEach(async () => {
    mockPrisma = createMockPrismaClient();
    mockConfigService = createMockConfigService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VPNConfigService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          // Added CryptoService provider
          provide: CryptoService,
          useValue: createMockCryptoService(),
        },
      ],
    }).compile();

    service = module.get<VPNConfigService>(VPNConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getVPNConfig', () => {
    it('should return VPN config from database', async () => {
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

      mockPrisma.vpnConfig.findFirst.mockResolvedValue({
        id: 'config_1',
        version: '1.0.0',
        payload: mockConfig,
        etag: 'W/"abc123"',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await service.getVPNConfig();

      expect(result.status).toBe('ok');
      expect(result.config).toBeDefined();
      expect(result.etag).toBeDefined();
    });

    it('should return not-modified when etag matches', async () => {
      const etag = 'W/"abc123"';
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

      mockPrisma.vpnConfig.findFirst.mockResolvedValue({
        id: 'config_1',
        version: '1.0.0',
        payload: mockConfig,
        etag: 'W/"abc123"',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      // First call to cache the config
      const firstResult = await service.getVPNConfig();
      expect(firstResult.status).toBe('ok');
      expect(firstResult.etag).toBe(etag);

      // Second call with matching etag - should return not-modified
      const result = await service.getVPNConfig(etag);
      expect(result.status).toBe('not-modified');
      expect(result.etag).toBe(etag);
    });

    it('should fallback to default config file when database has no config', async () => {
      const mockConfig = {
        version: 'fallback-1.0.0',
        updatedAt: null,
        servers: [],
        credentials: [],
      };

      mockPrisma.vpnConfig.findFirst.mockResolvedValue(null);

      // Mock fs.existsSync and fs.readFileSync
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify(mockConfig),
      );
      (path.join as jest.Mock).mockReturnValue('/path/to/config.json');

      const result = await service.getVPNConfig();

      expect(result.status).toBe('ok');
      expect(result.config).toBeDefined();
    });
  });
});
