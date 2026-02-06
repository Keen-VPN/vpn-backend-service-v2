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

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let mockPrisma: MockPrismaClient;
  let mockFirebaseAuth: any;

  beforeEach(async () => {
    mockPrisma = createMockPrismaClient();
    mockFirebaseAuth = {
      verifyIdToken: jest.fn(),
    };
    const mockFirebaseConfig = createMockFirebaseConfig();
    mockFirebaseConfig.getAuth.mockReturnValue(mockFirebaseAuth);

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

  describe('POST /auth/login', () => {
    it('should successfully login and return user profile', async () => {
      const idToken = 'valid-firebase-token';
      const decodedToken = createMockDecodedFirebaseToken();
      const user = createMockUser({ firebaseUid: decodedToken.uid });
      const subscription = createMockSubscription({ userId: user.id });

      mockFirebaseAuth.verifyIdToken.mockResolvedValue(decodedToken);
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue(user);
      mockPrisma.subscription.findFirst.mockResolvedValue(subscription);

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ idToken })
        .expect(200);

      expect(response.body.user).toBeDefined();
      expect(response.body.user.id).toBe(user.id);
      expect(response.body.subscription).toBeDefined();
    });

    it('should return 401 for invalid token format', async () => {
      // Use a token that's long enough to pass length validation but invalid format
      // Firebase verification will fail, returning 401
      const invalidToken = 'a'.repeat(100);
      mockFirebaseAuth.verifyIdToken.mockRejectedValue(
        new Error('Invalid token format'),
      );

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ idToken: invalidToken })
        .expect(401);
    });

    it('should return 401 for invalid token', async () => {
      mockFirebaseAuth.verifyIdToken.mockRejectedValue(
        new Error('Invalid token'),
      );

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ idToken: 'invalid-token' })
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('should require authentication', async () => {
      await request(app.getHttpServer()).post('/auth/logout').expect(401);
    });
  });
});
