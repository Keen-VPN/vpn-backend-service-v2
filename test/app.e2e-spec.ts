import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
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

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue(createMockConfigService())
      .overrideProvider(PrismaService)
      .useValue(createMockPrismaClient())
      .overrideProvider(FirebaseConfig)
      .useValue(createMockFirebaseConfig())
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('/ (GET)', async () => {
    const response = await request(app.getHttpServer()).get('/').expect(200);

    // Verify enhanced health check structure
    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('service');
    expect(response.body).toHaveProperty('database');
    expect(response.body.status).toMatch(/^(healthy|degraded|unhealthy)$/);
    expect(response.body.service).toHaveProperty('uptime');
    expect(response.body.service).toHaveProperty('version');
    expect(response.body.database).toHaveProperty('status');
  });
});
