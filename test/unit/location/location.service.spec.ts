import { Test, TestingModule } from '@nestjs/testing';
import { LocationService } from '../../../src/location/location.service';
import { PrismaService } from '../../../src/prisma/prisma.service';

describe('LocationService', () => {
  let service: LocationService;

  const mockPrismaService = {
    node: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<LocationService>(LocationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAvailableLocations', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should return list of locations grouped by region', async () => {
      const mockNodes = [
        {
          id: 'node-1',
          region: 'us-east',
          country: 'US',
          city: 'New York',
          status: 'active',
          cpuUsage: 30.0,
          lastHeartbeat: new Date(),
        },
        {
          id: 'node-2',
          region: 'us-east',
          country: 'US',
          city: 'New York',
          status: 'active',
          cpuUsage: 40.0,
          lastHeartbeat: new Date(),
        },
        {
          id: 'node-3',
          region: 'eu-west',
          country: 'GB',
          city: 'London',
          status: 'active',
          cpuUsage: 20.0,
          lastHeartbeat: new Date(),
        },
      ];

      mockPrismaService.node.findMany.mockResolvedValue(mockNodes);

      const result = await service.getAvailableLocations();

      expect(result).toHaveLength(2);
      expect(result[0].region).toBe('us-east');
      expect(result[0].availableNodes).toBe(2);
      expect(result[0].averageLoad).toBe(35.0); // (30 + 40) / 2
      expect(result[1].region).toBe('eu-west');
      expect(result[1].availableNodes).toBe(1);
      expect(result[1].averageLoad).toBe(20.0);
    });

    it('should only include active nodes', async () => {
      const mockNodes = [
        {
          id: 'node-1',
          region: 'us-east',
          country: 'US',
          city: 'New York',
          status: 'active',
          cpuUsage: 30.0,
          lastHeartbeat: new Date(),
        },
        {
          id: 'node-2',
          region: 'us-east',
          country: 'US',
          city: 'New York',
          status: 'inactive',
          cpuUsage: 40.0,
          lastHeartbeat: new Date(),
        },
      ];

      mockPrismaService.node.findMany.mockResolvedValue(mockNodes);

      const result = await service.getAvailableLocations();

      expect(result).toHaveLength(1);
      expect(result[0].availableNodes).toBe(1);
      expect(result[0].averageLoad).toBe(30.0);
    });

    it('should only include nodes with recent heartbeat (within 5 minutes)', async () => {
      const now = new Date();
      const oldHeartbeat = new Date(now.getTime() - 10 * 60 * 1000); // 10 minutes ago

      const mockNodes = [
        {
          id: 'node-1',
          region: 'us-east',
          country: 'US',
          city: 'New York',
          status: 'active',
          cpuUsage: 30.0,
          lastHeartbeat: now,
        },
        {
          id: 'node-2',
          region: 'us-east',
          country: 'US',
          city: 'New York',
          status: 'active',
          cpuUsage: 40.0,
          lastHeartbeat: oldHeartbeat,
        },
      ];

      mockPrismaService.node.findMany.mockResolvedValue(mockNodes);

      const result = await service.getAvailableLocations();

      expect(result).toHaveLength(1);
      expect(result[0].availableNodes).toBe(1);
      expect(result[0].averageLoad).toBe(30.0);
    });

    it('should filter out regions with no healthy nodes', async () => {
      const oldHeartbeat = new Date(Date.now() - 10 * 60 * 1000);

      const mockNodes = [
        {
          id: 'node-1',
          region: 'us-east',
          country: 'US',
          city: 'New York',
          status: 'inactive',
          cpuUsage: 30.0,
          lastHeartbeat: oldHeartbeat,
        },
      ];

      mockPrismaService.node.findMany.mockResolvedValue(mockNodes);

      const result = await service.getAvailableLocations();

      expect(result).toHaveLength(0);
    });

    it('should return empty array when no nodes exist', async () => {
      mockPrismaService.node.findMany.mockResolvedValue([]);

      const result = await service.getAvailableLocations();

      expect(result).toEqual([]);
    });

    it('should include country and city information', async () => {
      const mockNodes = [
        {
          id: 'node-1',
          region: 'us-east',
          country: 'US',
          city: 'New York',
          status: 'active',
          cpuUsage: 30.0,
          lastHeartbeat: new Date(),
        },
      ];

      mockPrismaService.node.findMany.mockResolvedValue(mockNodes);

      const result = await service.getAvailableLocations();

      expect(result[0].country).toBe('US');
      expect(result[0].city).toBe('New York');
    });

    it('should calculate correct average for multiple nodes in same region', async () => {
      const mockNodes = [
        {
          id: 'node-1',
          region: 'us-east',
          country: 'US',
          city: 'New York',
          status: 'active',
          cpuUsage: 10.0,
          lastHeartbeat: new Date(),
        },
        {
          id: 'node-2',
          region: 'us-east',
          country: 'US',
          city: 'New York',
          status: 'active',
          cpuUsage: 20.0,
          lastHeartbeat: new Date(),
        },
        {
          id: 'node-3',
          region: 'us-east',
          country: 'US',
          city: 'New York',
          status: 'active',
          cpuUsage: 30.0,
          lastHeartbeat: new Date(),
        },
      ];

      mockPrismaService.node.findMany.mockResolvedValue(mockNodes);

      const result = await service.getAvailableLocations();

      expect(result[0].availableNodes).toBe(3);
      expect(result[0].averageLoad).toBe(20.0); // (10 + 20 + 30) / 3
    });
  });
});
