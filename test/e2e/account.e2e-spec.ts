import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import {
  createMockPrismaClient,
  createMockFirebaseConfig,
  createMockConfigService,
  MockPrismaClient,
} from '../setup/mocks';
import {
  createMockUser,
  createMockSubscription,
  createMockDecodedFirebaseToken,
} from '../setup/test-helpers';
import { PrismaService } from '../../src/prisma/prisma.service';
import { FirebaseConfig } from '../../src/config/firebase.config';
import { ConfigService } from '@nestjs/config';

describe('Account (e2e)', () => {
  let app: INestApplication;
  let mockPrisma: MockPrismaClient;
  let mockFirebaseAuth: any;
  let authToken: string;

  beforeEach(async () => {
    mockPrisma = createMockPrismaClient();
    mockFirebaseAuth = {
      verifyIdToken: jest.fn(),
    };
    const mockFirebaseConfig = createMockFirebaseConfig();
    mockFirebaseConfig.getAuth.mockReturnValue(mockFirebaseAuth);

    const decodedToken = createMockDecodedFirebaseToken();
    mockFirebaseAuth.verifyIdToken.mockResolvedValue(decodedToken);
    authToken = 'valid-firebase-token';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(FirebaseConfig)
      .useValue(mockFirebaseConfig)
      .overrideProvider(ConfigService)
      .useValue(createMockConfigService())
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('GET /user/profile', () => {
    it('should return user profile with subscription', async () => {
      const user = createMockUser();
      const subscription = createMockSubscription({ userId: user.id });

      mockPrisma.user.findUnique.mockResolvedValue({
        ...user,
        subscriptions: [subscription],
      } as any);

      const response = await request(app.getHttpServer())
        .get('/user/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.user).toBeDefined();
      expect(response.body.user.id).toBe(user.id);
      expect(response.body.subscription).toBeDefined();
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer()).get('/user/profile').expect(401);
    });
  });

  describe('DELETE /user/account', () => {
    it('should delete account successfully', async () => {
      const user = createMockUser();

      mockPrisma.user.findUnique.mockResolvedValue({
        ...user,
        subscriptions: [],
      } as any);
      mockPrisma.user.delete.mockResolvedValue(user);

      const response = await request(app.getHttpServer())
        .delete('/user/account')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.deletedUserId).toBe(user.id);
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer()).delete('/user/account').expect(401);
    });
  });

  describe('GET /account/payments', () => {
    it('should return payment history', async () => {
      const user = createMockUser();
      const subscriptions = [
        createMockSubscription({ userId: user.id }),
        createMockSubscription({ userId: user.id }),
      ];

      mockPrisma.user.findUnique.mockResolvedValue({
        ...user,
        subscriptions: [],
      } as any);
      mockPrisma.subscription.findMany.mockResolvedValue(subscriptions);

      const response = await request(app.getHttpServer())
        .get('/account/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.payments).toBeDefined();
      expect(Array.isArray(response.body.payments)).toBe(true);
    });
  });

  describe('GET /account/invoices/:id/pdf', () => {
    it('should return PDF invoice', async () => {
      const user = createMockUser();
      const subscription = createMockSubscription({ userId: user.id });

      mockPrisma.user.findUnique.mockResolvedValue({
        ...user,
        subscriptions: [],
      } as any);
      mockPrisma.subscription.findUnique.mockResolvedValue(subscription);

      const response = await request(app.getHttpServer())
        .get(`/account/invoices/${subscription.id}/pdf`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('application/pdf');
    });

    it('should return 403 for invalid UUID format', async () => {
      await request(app.getHttpServer())
        .get('/account/invoices/invalid-uuid/pdf')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);
    });
  });
});
