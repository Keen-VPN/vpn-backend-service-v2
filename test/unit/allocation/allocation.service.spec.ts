import { Test, TestingModule } from '@nestjs/testing';
import { AllocationService } from '../../../src/allocation/allocation.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { RedisService } from '../../../src/redis/redis.service';

describe('AllocationService', () => {
  let service: AllocationService;

  const mockPrismaService = {
    node: {
      findUnique: jest.fn(),
    },
  };

  const mockRedisService = {
    zrange: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AllocationService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<AllocationService>(AllocationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('selectOptimalNode', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should select node with lowest score for specific region', async () => {
      const mockNode = {
        id: 'node-123',
        ipAddress: '203.0.113.42',
        publicKey: 'test-key',
        region: 'us-east',
        city: 'New York',
        country: 'US',
        status: 'active',
        capacity: 100,
        currentConnections: 10,
        cpuUsage: 25.5,
        bandwidthUsage: 50.0,
        lastHeartbeat: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRedisService.zrange.mockResolvedValue(['node-123']);
      mockPrismaService.node.findUnique.mockResolvedValue(mockNode);

      const result = await service.selectOptimalNode('us-east');

      expect(result).toBeDefined();
      expect(result?.id).toBe('node-123');
      expect(result?.region).toBe('us-east');
      expect(mockRedisService.zrange).toHaveBeenCalledWith(
        'nodes:us-east',
        0,
        0,
      );
    });

    it('should select node globally when no region specified', async () => {
      const mockNode = {
        id: 'node-456',
        ipAddress: '203.0.113.50',
        publicKey: 'test-key-2',
        region: 'eu-west',
        city: 'London',
        country: 'GB',
        status: 'active',
        capacity: 100,
        currentConnections: 5,
        cpuUsage: 15.0,
        bandwidthUsage: 30.0,
        lastHeartbeat: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRedisService.zrange.mockResolvedValue(['node-456']);
      mockPrismaService.node.findUnique.mockResolvedValue(mockNode);

      const result = await service.selectOptimalNode();

      expect(result).toBeDefined();
      expect(result?.id).toBe('node-456');
      expect(mockRedisService.zrange).toHaveBeenCalledWith(
        'nodes:global',
        0,
        0,
      );
    });

    it('should return null when no nodes available in region', async () => {
      mockRedisService.zrange.mockResolvedValue([]);

      const result = await service.selectOptimalNode('us-west');

      expect(result).toBeNull();
      expect(mockRedisService.zrange).toHaveBeenCalledWith(
        'nodes:us-west',
        0,
        0,
      );
    });

    it('should return null when Redis returns node but Prisma does not find it', async () => {
      mockRedisService.zrange.mockResolvedValue(['node-999']);
      mockPrismaService.node.findUnique.mockResolvedValue(null);

      const result = await service.selectOptimalNode('us-east');

      expect(result).toBeNull();
    });

    it('should only return active nodes', async () => {
      const inactiveNode = {
        id: 'node-inactive',
        ipAddress: '203.0.113.99',
        publicKey: 'inactive-key',
        region: 'us-east',
        city: 'New York',
        country: 'US',
        status: 'inactive',
        capacity: 100,
        currentConnections: 0,
        cpuUsage: 0,
        bandwidthUsage: 0,
        lastHeartbeat: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRedisService.zrange.mockResolvedValue(['node-inactive']);
      mockPrismaService.node.findUnique.mockResolvedValue(inactiveNode);

      const result = await service.selectOptimalNode('us-east');

      expect(result).toBeNull();
    });

    it('should verify node has recent heartbeat (within 5 minutes)', async () => {
      const staleNode = {
        id: 'node-stale',
        ipAddress: '203.0.113.88',
        publicKey: 'stale-key',
        region: 'us-east',
        city: 'New York',
        country: 'US',
        status: 'active',
        capacity: 100,
        currentConnections: 10,
        cpuUsage: 25.5,
        bandwidthUsage: 50.0,
        lastHeartbeat: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRedisService.zrange.mockResolvedValue(['node-stale']);
      mockPrismaService.node.findUnique.mockResolvedValue(staleNode);

      const result = await service.selectOptimalNode('us-east');

      expect(result).toBeNull();
    });
  });
});
