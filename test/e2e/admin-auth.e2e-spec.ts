import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { FirebaseConfig } from '../../src/config/firebase.config';
import { ConfigService } from '@nestjs/config';
import {
  createMockConfigService,
  createMockPrismaClient,
  createMockFirebaseConfig,
  MockPrismaClient,
} from '../setup/mocks';
import { AdminUserRole, AdminUserStatus } from '@prisma/client';
import { hashSessionToken } from '../../src/admin/admin-session.service';
import { ADMIN_SESSION_COOKIE } from '../../src/admin/admin.constants';

function extractSessionCookie(setCookie: string[] | undefined): string | null {
  if (!setCookie?.length) return null;
  const line = setCookie.find((c) => c.startsWith(`${ADMIN_SESSION_COOKIE}=`));
  if (!line) return null;
  const part = line.split(';')[0];
  const raw = part.slice(`${ADMIN_SESSION_COOKIE}=`.length);
  return decodeURIComponent(raw);
}

describe('Admin auth (e2e)', () => {
  let app: INestApplication;
  let mockPrisma: MockPrismaClient;

  beforeEach(async () => {
    mockPrisma = createMockPrismaClient();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(FirebaseConfig)
      .useValue(createMockFirebaseConfig())
      .overrideProvider(ConfigService)
      .useValue(createMockConfigService())
      .compile();

    const nestApp =
      moduleFixture.createNestApplication<NestExpressApplication>();
    nestApp.use(cookieParser());
    nestApp.setGlobalPrefix('api');
    app = nestApp;
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /api/admin/auth/me returns 401 without session cookie', async () => {
    await request(app.getHttpServer()).get('/api/admin/auth/me').expect(401);
  });

  it('GET /api/admin/subscription/transfer-requests returns 401 without session (API key ignored)', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/subscription/transfer-requests')
      .set('x-admin-api-key', 'should-not-work')
      .expect(401);
  });

  it('POST /api/admin/auth/login sets cookie and GET /me succeeds', async () => {
    const email = 'ops@example.com';
    const password = 'Str0ng!Passcode';
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    mockPrisma.adminUser.findUnique.mockResolvedValue({
      id: 'admin-1',
      email,
      passwordHash: hash,
      name: 'Ops',
      role: AdminUserRole.SUPER_ADMIN,
      status: AdminUserStatus.ACTIVE,
    } as never);
    mockPrisma.adminSession.updateMany.mockResolvedValue({ count: 0 } as never);
    mockPrisma.adminSession.create.mockResolvedValue({
      id: 'sess-new',
    } as never);
    mockPrisma.adminUser.update.mockResolvedValue({} as never);
    mockPrisma.adminAuditLog.create.mockResolvedValue({} as never);

    const login = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ email, password })
      .expect(200);

    expect(login.body.success).toBe(true);
    expect(login.body.data.admin.email).toBe(email);
    expect(login.body.data.admin.passwordHash).toBeUndefined();
    const rawToken = extractSessionCookie(login.headers['set-cookie']);
    expect(rawToken).toBeTruthy();
    const setCookie = login.headers['set-cookie'] as string[] | undefined;
    expect(setCookie?.some((line) => line.includes('HttpOnly'))).toBe(true);
    expect(setCookie?.some((line) => line.includes('Path=/api'))).toBe(true);

    mockPrisma.adminSession.findFirst.mockResolvedValue({
      id: 'sess-new',
      adminUser: {
        id: 'admin-1',
        email,
        name: 'Ops',
        role: AdminUserRole.SUPER_ADMIN,
        status: AdminUserStatus.ACTIVE,
      },
    } as never);

    expect(hashSessionToken(rawToken!)).toBeTruthy();

    const me = await request(app.getHttpServer())
      .get('/api/admin/auth/me')
      .set('Cookie', [`${ADMIN_SESSION_COOKIE}=${rawToken}`])
      .expect(200);

    expect(me.body.data.admin.permissions).toContain('admin_users.manage');
    expect(me.body.data.admin.passwordHash).toBeUndefined();
  });

  it('POST /api/admin/auth/logout revokes current session and clears access', async () => {
    const rawToken = 'x'.repeat(64);
    mockPrisma.adminSession.findFirst
      .mockResolvedValueOnce({
        id: 'sess-logout',
        adminUser: {
          id: 'admin-1',
          email: 'ops@example.com',
          name: 'Ops',
          role: AdminUserRole.SUPER_ADMIN,
          status: AdminUserStatus.ACTIVE,
        },
      } as never)
      .mockResolvedValueOnce(null as never);
    mockPrisma.adminSession.updateMany.mockResolvedValue({ count: 1 } as never);
    mockPrisma.adminAuditLog.create.mockResolvedValue({} as never);

    await request(app.getHttpServer())
      .post('/api/admin/auth/logout')
      .set('Cookie', [`${ADMIN_SESSION_COOKIE}=${rawToken}`])
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/admin/auth/me')
      .set('Cookie', [`${ADMIN_SESSION_COOKIE}=${rawToken}`])
      .expect(401);
  });

  it('disabled admin session cannot access protected endpoints', async () => {
    mockPrisma.adminSession.findFirst.mockResolvedValue(null as never);
    await request(app.getHttpServer())
      .get('/api/admin/auth/me')
      .set('Cookie', [`${ADMIN_SESSION_COOKIE}=${'d'.repeat(64)}`])
      .expect(401);
  });

  it('all admin membership-transfer endpoints reject unauthenticated users', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/subscription/transfer-requests')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/admin/subscription/transfer-requests/req-1/proof-view')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/admin/subscription/transfer-requests/req-1/proof')
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/admin/subscription/transfer-requests/req-1/approve')
      .send({ approvedCreditDays: 10 })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/admin/subscription/transfer-requests/req-1/reject')
      .send({ adminNote: 'no' })
      .expect(401);
  });

  it('READONLY admin cannot approve transfer (403)', async () => {
    const rawToken = 'r'.repeat(64);
    mockPrisma.adminSession.findFirst.mockResolvedValue({
      id: 's1',
      adminUser: {
        id: 'ro-1',
        email: 'ro@example.com',
        name: 'Readonly',
        role: AdminUserRole.READONLY_ADMIN,
        status: AdminUserStatus.ACTIVE,
      },
    } as never);

    await request(app.getHttpServer())
      .post('/api/admin/subscription/transfer-requests/tr-1/approve')
      .set('Cookie', [`${ADMIN_SESSION_COOKIE}=${rawToken}`])
      .send({ approvedCreditDays: 10 })
      .expect(403);
  });

  it('SUPPORT admin cannot approve (403)', async () => {
    const rawToken = 's'.repeat(64);
    mockPrisma.adminSession.findFirst.mockResolvedValue({
      id: 's2',
      adminUser: {
        id: 'sup-1',
        email: 'sup@example.com',
        name: 'Support',
        role: AdminUserRole.SUPPORT_ADMIN,
        status: AdminUserStatus.ACTIVE,
      },
    } as never);

    await request(app.getHttpServer())
      .post('/api/admin/subscription/transfer-requests/tr-1/approve')
      .set('Cookie', [`${ADMIN_SESSION_COOKIE}=${rawToken}`])
      .send({ approvedCreditDays: 10 })
      .expect(403);
  });
});
