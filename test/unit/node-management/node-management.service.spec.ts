import { Test, TestingModule } from '@nestjs/testing';
import { NodeManagementService } from '../../../src/node-management/node-management.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { RedisService } from '../../../src/redis/redis.service';
import { NotificationService } from '../../../src/notification/notification.service';
import { RegisterNodeDto } from '../../../src/node-management/dto/register-node.dto';
import { PulseDto } from '../../../src/node-management/dto/pulse.dto';

describe('NodeManagementService', () => {
  let service: NodeManagementService;

  const mockPrismaService = {
    node: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockRedisService = {
    zadd: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    exists: jest.fn(),
  };

  const mockNotificationService = {
    notifyNodeRegistered: jest.fn(),
    notifyHighLoad: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NodeManagementService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
      ],
    }).compile();

    service = module.get<NodeManagementService>(NodeManagementService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerNode', () => {
    const registerDto: RegisterNodeDto = {
      ipAddress: '203.0.113.42',
      publicKey: 'xTIBA5rboUvnH4htodjb6e697QjLERt1NAB4mZqp8Dg=',
      region: 'us-east',
      city: 'New York',
      country: 'US',
      capacity: 100,
    };

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should successfully register a new node', async () => {
      const mockNode = {
        id: 'node-123',
        ...registerDto,
        status: 'active',
        currentConnections: 0,
        cpuUsage: 0,
        bandwidthUsage: 0,
        lastHeartbeat: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.node.create.mockResolvedValue(mockNode);
      mockRedisService.zadd.mockResolvedValue(1);
      mockNotificationService.notifyNodeRegistered.mockResolvedValue(undefined);

      const result = await service.registerNode(registerDto);

      expect(result).toBeDefined();
      expect(result.id).toBe('node-123');
      expect(result.ipAddress).toBe(registerDto.ipAddress);
      expect(result.status).toBe('active');
      expect(mockPrismaService.node.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ipAddress: registerDto.ipAddress,
          publicKey: registerDto.publicKey,
          region: registerDto.region,
          country: registerDto.country,
          capacity: registerDto.capacity,
          status: 'active',
        }) as Record<string, unknown>,
      });
    });

    it('should initialize node in Redis with score 0', async () => {
      const mockNode = {
        id: 'node-123',
        ...registerDto,
        status: 'active',
        currentConnections: 0,
        cpuUsage: 0,
        bandwidthUsage: 0,
        lastHeartbeat: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.node.create.mockResolvedValue(mockNode);
      mockRedisService.zadd.mockResolvedValue(1);

      await service.registerNode(registerDto);

      expect(mockRedisService.zadd).toHaveBeenCalledWith(
        `nodes:${registerDto.region}`,
        0,
        'node-123',
      );
    });

    it('should send notification after successful registration', async () => {
      const mockNode = {
        id: 'node-123',
        ...registerDto,
        status: 'active',
        currentConnections: 0,
        cpuUsage: 0,
        bandwidthUsage: 0,
        lastHeartbeat: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.node.create.mockResolvedValue(mockNode);
      mockRedisService.zadd.mockResolvedValue(1);

      await service.registerNode(registerDto);

      expect(mockNotificationService.notifyNodeRegistered).toHaveBeenCalledWith(
        'node-123',
        registerDto.region,
      );
    });

    it('should throw error if node with same public key exists', async () => {
      mockPrismaService.node.create.mockRejectedValue({
        code: 'P2002',
        meta: { target: ['public_key'] },
      });

      await expect(service.registerNode(registerDto)).rejects.toThrow();
    });
  });

  describe('processPulse', () => {
    const pulseDto: PulseDto = {
      nodeId: 'node-123',
      cpuUsage: 45.5,
      bandwidthUsage: 125.3,
      connectionCount: 42,
      availableCapacity: 58,
    };

    it('should successfully process node pulse', async () => {
      const mockNode = {
        id: 'node-123',
        region: 'us-east',
        status: 'active',
      };

      mockPrismaService.node.findUnique.mockResolvedValue(mockNode);
      mockPrismaService.node.update.mockResolvedValue({
        ...mockNode,
        cpuUsage: pulseDto.cpuUsage,
        bandwidthUsage: pulseDto.bandwidthUsage,
        currentConnections: pulseDto.connectionCount,
        lastHeartbeat: new Date(),
      });
      mockRedisService.zadd.mockResolvedValue(1);

      const result = await service.processPulse(pulseDto);

      expect(result.success).toBe(true);
      expect(mockPrismaService.node.update).toHaveBeenCalledWith({
        where: { id: pulseDto.nodeId },
        data: {
          cpuUsage: pulseDto.cpuUsage,
          bandwidthUsage: pulseDto.bandwidthUsage,
          currentConnections: pulseDto.connectionCount,
          lastHeartbeat: expect.any(Date) as Date,
        },
      });
    });

    it('should update node score in Redis based on metrics', async () => {
      const mockNode = {
        id: 'node-123',
        region: 'us-east',
        status: 'active',
      };

      mockPrismaService.node.findUnique.mockResolvedValue(mockNode);
      mockPrismaService.node.update.mockResolvedValue(mockNode);
      mockRedisService.zadd.mockResolvedValue(1);

      await service.processPulse(pulseDto);

      const expectedScore =
        pulseDto.cpuUsage * 0.4 +
        pulseDto.bandwidthUsage * 0.3 +
        pulseDto.connectionCount * 0.3;

      expect(mockRedisService.zadd).toHaveBeenCalledWith(
        `nodes:${mockNode.region}`,
        expectedScore,
        pulseDto.nodeId,
      );
    });

    it('should trigger high load notification when CPU > 90%', async () => {
      const highCpuPulse = { ...pulseDto, cpuUsage: 95.0 };
      const mockNode = {
        id: 'node-123',
        region: 'us-east',
        status: 'active',
      };

      mockPrismaService.node.findUnique.mockResolvedValue(mockNode);
      mockPrismaService.node.update.mockResolvedValue(mockNode);
      mockRedisService.zadd.mockResolvedValue(1);
      mockNotificationService.notifyHighLoad.mockResolvedValue(undefined);

      await service.processPulse(highCpuPulse);

      expect(mockNotificationService.notifyHighLoad).toHaveBeenCalledWith(
        'node-123',
        95.0,
        90,
      );
    });

    it('should throw error if node does not exist', async () => {
      mockPrismaService.node.findUnique.mockResolvedValue(null);

      await expect(service.processPulse(pulseDto)).rejects.toThrow(
        'Node not found',
      );
    });

    it('should not process pulse for inactive nodes', async () => {
      const mockNode = {
        id: 'node-123',
        region: 'us-east',
        status: 'inactive',
      };

      mockPrismaService.node.findUnique.mockResolvedValue(mockNode);

      await expect(service.processPulse(pulseDto)).rejects.toThrow(
        'Node is not active',
      );
    });
  });
});
