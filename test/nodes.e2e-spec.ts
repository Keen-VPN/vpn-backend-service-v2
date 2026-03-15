import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { FirebaseConfig } from '../src/config/firebase.config';
import {
  createMockConfigService,
  createMockPrismaClient,
  createMockFirebaseConfig,
} from './setup/mocks';

describe('Nodes (e2e)', () => {
  let app: INestApplication<App>;
  const NODE_TOKEN = 'test-node-token';

  beforeEach(async () => {
    const mockConfig = createMockConfigService();
    // Safely override NODE_TOKEN without recursion by using a fresh implementation
    const defaults: Record<string, any> = {
      NODE_TOKEN: NODE_TOKEN,
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'test-secret',
    };

    mockConfig.get.mockImplementation((key: string, defaultValue?: any) => {
      return defaults[key] || defaultValue;
    });

    const mockPrisma = createMockPrismaClient();
    // Return a dummy node object to prevent "Cannot read properties of undefined (reading 'id')"
    mockPrisma.node.upsert.mockResolvedValue({
      id: 'test-id',
      publicKey: 'key',
      region: 'us-east-1',
      status: 'ONLINE',
      ip: '1.1.1.1',
      lastHeartbeat: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue(mockConfig)
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(FirebaseConfig)
      .useValue(createMockFirebaseConfig())
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('/nodes/register (POST)', () => {
    it('should fail with invalid IP', async () => {
      return request(app.getHttpServer())
        .post('/nodes/register')
        .set('Authorization', `Bearer ${NODE_TOKEN}`)
        .send({
          publicKey: 'key',
          region: 'us-east-1',
          publicIp: 'not-an-ip',
          status: 'ONLINE',
        })
        .expect(400);
    });

    it('should succeed with valid IP', async () => {
      return request(app.getHttpServer())
        .post('/nodes/register')
        .set('Authorization', `Bearer ${NODE_TOKEN}`)
        .send({
          publicKey: 'key',
          region: 'us-east-1',
          publicIp: '1.1.1.1',
          status: 'ONLINE',
        })
        .expect(201);
    });
  });
});
