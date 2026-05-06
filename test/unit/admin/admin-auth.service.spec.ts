import { Test, TestingModule } from '@nestjs/testing';
import {
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminUserRole, AdminUserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { AdminAuthService } from '../../../src/admin/admin-auth.service';
import { AdminSessionService } from '../../../src/admin/admin-session.service';
import { AdminAuditService } from '../../../src/admin/admin-audit.service';
import { AdminLoginRateLimiterService } from '../../../src/admin/admin-login-rate-limit.service';
import { PrismaService } from '../../../src/prisma/prisma.service';

describe('AdminAuthService', () => {
  let service: AdminAuthService;
  let prisma: {
    adminUser: { findUnique: jest.Mock; update: jest.Mock };
    adminSession: { findFirst: jest.Mock };
  };
  let sessions: {
    revokeAllActiveForUser: jest.Mock;
    createSession: jest.Mock;
    revokeSession: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let rate: AdminLoginRateLimiterService;

  const email = 'admin@example.com';
  let passwordHash: string;
  const password = 'Str0ng!Passcode';

  beforeAll(async () => {
    passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  });

  beforeEach(async () => {
    prisma = {
      adminUser: { findUnique: jest.fn(), update: jest.fn() },
      adminSession: { findFirst: jest.fn() },
    };
    sessions = {
      revokeAllActiveForUser: jest.fn().mockResolvedValue(undefined),
      createSession: jest
        .fn()
        .mockResolvedValue({ rawToken: 'tok'.repeat(16), sessionId: 'sess-1' }),
      revokeSession: jest.fn(),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    const config = {
      get: jest.fn((k: string) =>
        k === 'ADMIN_SESSION_MAX_AGE_SEC' ? undefined : undefined,
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuthService,
        AdminLoginRateLimiterService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: AdminSessionService, useValue: sessions },
        { provide: AdminAuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(AdminAuthService);
    rate = module.get(AdminLoginRateLimiterService);
    rate.resetAll();
  });

  it('login succeeds for active admin with correct password', async () => {
    prisma.adminUser.findUnique.mockResolvedValue({
      id: 'a1',
      email,
      passwordHash,
      name: 'Admin',
      role: AdminUserRole.BILLING_ADMIN,
      status: AdminUserStatus.ACTIVE,
    });
    prisma.adminUser.update.mockResolvedValue({});

    const res = await service.login(email, password, '127.0.0.1', 'jest');

    expect(res.rawToken).toBeDefined();
    expect(res.admin.email).toBe(email);
    expect(res.admin.permissions).toContain('membership_transfer.approve');
    expect(sessions.revokeAllActiveForUser).toHaveBeenCalledWith('a1');
    expect(sessions.createSession).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.login.success' }),
    );
  });

  it('login fails for wrong password', async () => {
    prisma.adminUser.findUnique.mockResolvedValue({
      id: 'a1',
      email,
      passwordHash,
      name: 'Admin',
      role: AdminUserRole.SUPER_ADMIN,
      status: AdminUserStatus.ACTIVE,
    });

    await expect(
      service.login(email, 'WrongPass!!!', '127.0.0.1', null),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.login.failure' }),
    );
  });

  it('disabled admin cannot login', async () => {
    prisma.adminUser.findUnique.mockResolvedValue({
      id: 'a1',
      email,
      passwordHash,
      name: 'Admin',
      role: AdminUserRole.READONLY_ADMIN,
      status: AdminUserStatus.DISABLED,
    });

    await expect(
      service.login(email, password, '127.0.0.1', null),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rate limit triggers after many attempts', async () => {
    prisma.adminUser.findUnique.mockResolvedValue(null);
    const keyIp = '10.0.0.1';
    for (let i = 0; i < 10; i += 1) {
      await expect(
        service.login(email, 'x', keyIp, null),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    try {
      await service.login(email, 'x', keyIp, null);
      throw new Error('expected rate limit');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  });

  it('resolveSession returns null without token', async () => {
    await expect(service.resolveSession(undefined)).resolves.toBeNull();
  });
});
