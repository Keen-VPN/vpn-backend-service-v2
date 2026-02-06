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
  createMockUser,
} from '../setup/test-helpers';
import * as jwt from 'jsonwebtoken';
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
    it('should sign blinded token successfully', async () => {
      const blindedToken = createMockBlindedToken();
      const user = createMockUser();
      const secret =
        process.env.JWT_SECRET || 'default-secret-change-in-production';
      const token = jwt.sign(
        { userId: user.id, email: user.email, type: 'session' },
        secret,
      );

      mockPrisma.user.findUnique.mockResolvedValue(user);

      const response = await request(app.getHttpServer())
        .post('/auth/vpn-token')
        .set('Authorization', `Bearer ${token}`)
        .send({ blindedToken })
        .expect(200);

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
      // Valid token structure but failing verification or types
      // Actually, SessionAuthGuard verifies JWT signature.
      // We can send a malformed token or just verify it handles bad format.
      // But let's stick to what the test name implies: invalid format in the *body*?
      // No, "should return 400 for invalid token format" likely refers to 'blindedToken' in body.
      // We still need a valid session to get past the guard.

      const user = createMockUser();
      const secret =
        process.env.JWT_SECRET || 'default-secret-change-in-production';
      const token = jwt.sign(
        { userId: user.id, email: user.email, type: 'session' },
        secret,
      );
      mockPrisma.user.findUnique.mockResolvedValue(user);

      await request(app.getHttpServer())
        .post('/auth/vpn-token')
        .set('Authorization', `Bearer ${token}`)
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
