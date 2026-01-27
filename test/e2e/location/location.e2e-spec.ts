import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'http';
import { LocationController } from '../../../src/location/location.controller';
import { LocationService } from '../../../src/location/location.service';

describe('LocationController (E2E)', () => {
  let app: INestApplication;

  const mockLocationService = {
    getAvailableLocations: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [LocationController],
      providers: [
        {
          provide: LocationService,
          useValue: mockLocationService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /vpn/locations', () => {
    it('should return list of available locations', async () => {
      const mockLocations = [
        {
          region: 'us-east',
          country: 'US',
          city: 'New York',
          availableNodes: 15,
          averageLoad: 45.3,
        },
        {
          region: 'eu-west',
          country: 'GB',
          city: 'London',
          availableNodes: 12,
          averageLoad: 38.7,
        },
      ];

      mockLocationService.getAvailableLocations.mockResolvedValue(
        mockLocations,
      );

      const response = await request(app.getHttpServer() as Server)
        .get('/vpn/locations')
        .expect(200);

      expect(response.body).toEqual(mockLocations);
      expect(mockLocationService.getAvailableLocations).toHaveBeenCalled();
    });

    it('should return empty array when no locations available', async () => {
      mockLocationService.getAvailableLocations.mockResolvedValue([]);

      const response = await request(app.getHttpServer() as Server)
        .get('/vpn/locations')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should return 200 status code', async () => {
      mockLocationService.getAvailableLocations.mockResolvedValue([
        {
          region: 'us-east',
          country: 'US',
          city: 'New York',
          availableNodes: 10,
          averageLoad: 50.0,
        },
      ]);

      await request(app.getHttpServer() as Server)
        .get('/vpn/locations')
        .expect(200);
    });
  });
});
