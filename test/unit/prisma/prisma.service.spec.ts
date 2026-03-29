import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { createMockConfigService } from '../../setup/mocks';

// Mock PrismaClient to avoid actual DB connection
jest.mock('@prisma/client', () => {
  return {
    PrismaClient: class MockPrismaClient {
      constructor(opts?: any) {
        (this as any)._opts = opts;
      }
      $disconnect = jest.fn();
    },
  };
});

describe('PrismaService', () => {
  it('should construct with DATABASE_URL from ConfigService', () => {
    const mockConfig = createMockConfigService();
    const service = new PrismaService(mockConfig as any);
    expect(service).toBeDefined();
  });

  it('should fallback to process.env.DATABASE_URL when ConfigService returns undefined', () => {
    const mockConfig = { get: jest.fn().mockReturnValue(undefined) } as any;
    process.env.DATABASE_URL = 'postgresql://fallback:5432/test';

    const service = new PrismaService(mockConfig);
    expect(service).toBeDefined();
  });

  it('should throw when DATABASE_URL is not defined anywhere', () => {
    const originalUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    const mockConfig = { get: jest.fn().mockReturnValue(undefined) } as any;
    expect(() => new PrismaService(mockConfig)).toThrow(
      'DATABASE_URL is not defined',
    );

    process.env.DATABASE_URL = originalUrl;
  });

  it('onModuleInit should resolve without error', async () => {
    const mockConfig = createMockConfigService();
    const service = new PrismaService(mockConfig as any);
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });

  it('onModuleDestroy should call $disconnect', async () => {
    const mockConfig = createMockConfigService();
    const service = new PrismaService(mockConfig as any);
    await service.onModuleDestroy();
    expect(service.$disconnect).toHaveBeenCalled();
  });
});
