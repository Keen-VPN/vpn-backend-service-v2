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
  createMockBlindedToken,
  createMockDecodedFirebaseToken,
} from '../setup/test-helpers';
import { PrismaService } from '../../src/prisma/prisma.service';
import { FirebaseConfig } from '../../src/config/firebase.config';
import { ConfigService } from '@nestjs/config';
// No need to mock crypto - we use real RSA keys generated in jest.setup.ts

describe('Crypto (e2e)', () => {
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

  describe('POST /auth/vpn-token', () => {
    const jwt = require('jsonwebtoken');

    it('should sign blinded token successfully', async () => {
      const blindedToken = createMockBlindedToken();

      // Create a valid session token signed with the test secret
      // ConfigService mock uses 'test-secret' by default
      const user = { id: 'user-123', email: 'test@example.com' };
      const sessionToken = jwt.sign(
        { userId: user.id, email: user.email, type: 'session' },
        'test-secret',
      );

      // Mock Prisma responses for SubscriptionService
      mockPrisma.user.findUnique.mockResolvedValue(user as any);
      mockPrisma.subscription.findFirst.mockResolvedValue({
        status: 'active',
        trialActive: false,
      } as any);

      const response = await request(app.getHttpServer())
        .post('/auth/vpn-token')
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ blindedToken })
        .expect(200)
        .catch((err) => {
          if (err.response) {
            console.log(
              'Error response body:',
              JSON.stringify(err.response.body, null, 2),
            );
          }
          throw err;
        });

      expect(response.body.signature).toBeDefined();
    });

    it('should require authentication', async () => {
      const blindedToken = createMockBlindedToken();

      await request(app.getHttpServer())
        .post('/auth/vpn-token')
        .send({ blindedToken })
        .expect(401);
    });

    it('should return 400 for invalid token format', async () => {
      // Create valid token for auth, but send invalid body
      const user = { id: 'user-123', email: 'test@example.com' };
      const sessionToken = jwt.sign(
        { userId: user.id, email: user.email, type: 'session' },
        'test-secret',
      );

      // Mock auth success, but payload validation should fail
      mockPrisma.user.findUnique.mockResolvedValue(user as any);
      mockPrisma.subscription.findFirst.mockResolvedValue({
        status: 'active',
      } as any);

      await request(app.getHttpServer())
        .post('/auth/vpn-token')
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ blindedToken: 'invalid-base64!!!' })
        .expect(400);
    });
  });

  describe('GET /auth/vpn-token/public-key', () => {
    it('should return public key', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/vpn-token/public-key')
        .expect(200);

      expect(response.body.publicKey).toBeDefined();
      expect(response.body.publicKey).toContain('BEGIN PUBLIC KEY');
    });
  });
});
