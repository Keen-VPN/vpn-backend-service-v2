import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'http';
import { NodeManagementController } from '../../../src/node-management/node-management.controller';
import { NodeManagementService } from '../../../src/node-management/node-management.service';
import { RegisterNodeDto } from '../../../src/node-management/dto/register-node.dto';
import { PulseDto } from '../../../src/node-management/dto/pulse.dto';

describe('NodeManagementController (E2E)', () => {
  let app: INestApplication;

  const mockNodeManagementService = {
    registerNode: jest.fn(),
    processPulse: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [NodeManagementController],
      providers: [
        {
          provide: NodeManagementService,
          useValue: mockNodeManagementService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /nodes/register', () => {
    const validRegisterDto: RegisterNodeDto = {
      ipAddress: '203.0.113.42',
      publicKey: 'xTIBA5rboUvnH4htodjb6e697QjLERt1NAB4mZqp8Dg=',
      region: 'us-east',
      city: 'New York',
      country: 'US',
      capacity: 100,
    };

    it('should successfully register a node and return 201', async () => {
      const mockResponse = {
        id: 'node-123',
        ipAddress: validRegisterDto.ipAddress,
        publicKey: validRegisterDto.publicKey,
        region: validRegisterDto.region,
        status: 'active',
        createdAt: new Date(),
      };

      mockNodeManagementService.registerNode.mockResolvedValue(mockResponse);

      const response = await request(app.getHttpServer() as Server)
        .post('/nodes/register')
        .send(validRegisterDto)
        .expect(201);

      expect(response.body).toEqual({
        id: 'node-123',
        ipAddress: validRegisterDto.ipAddress,
        publicKey: validRegisterDto.publicKey,
        region: validRegisterDto.region,
        status: 'active',
        createdAt: expect.any(String) as string,
      });
      expect(mockNodeManagementService.registerNode).toHaveBeenCalledWith(
        validRegisterDto,
      );
    });

    it('should return 400 for missing required fields', async () => {
      const invalidDto = {
        ipAddress: '203.0.113.42',
      };

      await request(app.getHttpServer() as Server)
        .post('/nodes/register')
        .send(invalidDto)
        .expect(400);

      expect(mockNodeManagementService.registerNode).not.toHaveBeenCalled();
    });

    it('should return 400 for duplicate public key', async () => {
      mockNodeManagementService.registerNode.mockRejectedValue(
        new Error('Node with this public key already exists'),
      );

      await request(app.getHttpServer() as Server)
        .post('/nodes/register')
        .send(validRegisterDto)
        .expect(500);
    });
  });

  describe('POST /nodes/pulse', () => {
    const validPulseDto: PulseDto = {
      nodeId: 'node-123',
      cpuUsage: 45.5,
      bandwidthUsage: 125.3,
      connectionCount: 42,
      availableCapacity: 58,
    };

    it('should successfully process pulse and return 200', async () => {
      mockNodeManagementService.processPulse.mockResolvedValue({
        success: true,
      });

      const response = await request(app.getHttpServer() as Server)
        .post('/nodes/pulse')
        .send(validPulseDto)
        .expect(200);

      expect(response.body).toEqual({ success: true });
      expect(mockNodeManagementService.processPulse).toHaveBeenCalledWith(
        validPulseDto,
      );
    });

    it('should return 400 for missing required fields', async () => {
      const invalidDto = {
        nodeId: 'node-123',
      };

      await request(app.getHttpServer() as Server)
        .post('/nodes/pulse')
        .send(invalidDto)
        .expect(400);

      expect(mockNodeManagementService.processPulse).not.toHaveBeenCalled();
    });
  });
});
