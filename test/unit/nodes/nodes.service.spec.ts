import { Test, TestingModule } from '@nestjs/testing';
import { NodesService } from '../../../src/nodes/nodes.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { SafeLogger } from '../../../src/common/utils/logger.util';

describe('NodesService', () => {
  let service: NodesService;
  let prisma: PrismaService;
  let httpService: HttpService;

  const mockPrisma = {
    node: {
      upsert: jest.fn(),
    },
  };

  const mockHttpService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NodesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<NodesService>(NodesService);
    prisma = module.get<PrismaService>(PrismaService);
    httpService = module.get<HttpService>(HttpService);

    jest.spyOn(SafeLogger, 'info').mockImplementation(() => {});
    jest.spyOn(SafeLogger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    const registerDto = {
      publicKey: 'test-key',
      region: 'us-east-1',
      publicIp: '1.1.1.1',
      status: 'ONLINE',
    };

    it('should fetch geolocation and upsert node', async () => {
      const geoResponse = {
        data: {
          country_name: 'United States',
          city: 'New York',
          latitude: 40.7128,
          longitude: -74.006,
          country_code: 'US',
        },
      };

      mockHttpService.get.mockReturnValue(of(geoResponse));
      mockPrisma.node.upsert.mockResolvedValue({ id: '1', ...registerDto });

      await service.register(registerDto);

      expect(httpService.get).toHaveBeenCalledWith(
        'https://ipapi.co/1.1.1.1/json/',
        expect.any(Object),
      );
      expect(mockPrisma.node.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { publicKey: 'test-key' },
          create: expect.objectContaining({
            country: 'United States',
            city: 'New York',
          }),
        }),
      );
    });

    it('should use cache for subsequent geolocation requests', async () => {
      const geoResponse = {
        data: {
          country_name: 'United States',
          city: 'New York',
        },
      };

      mockHttpService.get.mockReturnValue(of(geoResponse));
      mockPrisma.node.upsert.mockResolvedValue({ id: '1', ...registerDto });

      // First call - should trigger HTTP request
      await service.register(registerDto);
      // Second call with same IP - should use cache
      await service.register({ ...registerDto, publicKey: 'test-key-2' });

      expect(httpService.get).toHaveBeenCalledTimes(1);
    });

    it('should handle geolocation failure gracefully', async () => {
      mockHttpService.get.mockReturnValue(of({ data: { error: true } }));
      mockPrisma.node.upsert.mockResolvedValue({ id: '1', ...registerDto });

      await service.register(registerDto);

      expect(mockPrisma.node.upsert).toHaveBeenCalled();
      // Should not have geolocation data
      const upsertArgs = mockPrisma.node.upsert.mock.calls[0][0];
      expect(upsertArgs.create.country).toBeUndefined();
    });

    it('should set missing geo fields to null when API returns partial data', async () => {
      const partialGeoResponse = {
        data: {
          country_name: 'United States',
          // city is missing
          country_code: 'US',
        },
      };

      mockHttpService.get.mockReturnValue(of(partialGeoResponse));
      mockPrisma.node.upsert.mockResolvedValue({ id: '1', ...registerDto });

      await service.register({ ...registerDto, publicIp: '2.2.2.2' });

      const upsertArgs = mockPrisma.node.upsert.mock.calls[0][0];
      expect(upsertArgs.update.country).toBe('United States');
      expect(upsertArgs.update.city).toBeNull();
      expect(upsertArgs.update.latitude).toBeNull();
    });
  });
});
