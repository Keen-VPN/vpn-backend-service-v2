import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { AdminUserRole, AdminUserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminSessionService, hashSessionToken } from './admin-session.service';
import { AdminLoginRateLimiterService } from './admin-login-rate-limit.service';
import { permissionsForRole, type AdminPermission } from './admin-permissions';
import { DEFAULT_ADMIN_SESSION_MAX_AGE_SEC } from './admin.constants';
import { SafeLogger } from '../common/utils/logger.util';

export type AdminMePayload = {
  id: string;
  email: string;
  name: string;
  role: AdminUserRole;
  permissions: AdminPermission[];
};

@Injectable()
export class AdminAuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(AdminSessionService) private readonly sessions: AdminSessionService,
    @Inject(AdminAuditService) private readonly audit: AdminAuditService,
    @Inject(AdminLoginRateLimiterService)
    private readonly loginRate: AdminLoginRateLimiterService,
  ) {}

  sessionMaxAgeSec(): number {
    const raw = this.config.get<string>('ADMIN_SESSION_MAX_AGE_SEC');
    const n = raw ? parseInt(raw, 10) : NaN;
    if (Number.isFinite(n) && n >= 300 && n <= 60 * 60 * 24 * 30) {
      return n;
    }
    return DEFAULT_ADMIN_SESSION_MAX_AGE_SEC;
  }

  async hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async verifyPassword(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  async login(
    emailRaw: string,
    password: string,
    ip: string | null,
    userAgent: string | null,
  ): Promise<{ rawToken: string; admin: AdminMePayload }> {
    const email = emailRaw.trim().toLowerCase();
    const rateKey = `${email}|${ip ?? 'unknown'}`;
    await this.loginRate.assertAllowed(rateKey);

    const user = await this.prisma.adminUser.findUnique({
      where: { email },
    });

    const fail = async (reason: string): Promise<never> => {
      try {
        await this.audit.log({
          adminUserId: user?.id ?? null,
          action: 'admin.login.failure',
          targetType: 'admin_session',
          metadata: { reason } as object,
          ipAddress: ip,
          userAgent,
        });
      } catch (error) {
        SafeLogger.error(
          'Failed to write admin login failure audit log',
          error,
          {
            service: AdminAuthService.name,
            reason,
            email,
          },
        );
      }
      throw new UnauthorizedException('Invalid email or password');
    };

    if (!user) {
      return await fail('invalid_credentials');
    }
    if (user.status !== AdminUserStatus.ACTIVE) {
      return await fail('account_disabled');
    }

    const ok = await this.verifyPassword(user.passwordHash, password);
    if (!ok) {
      return await fail('invalid_credentials');
    }

    await this.sessions.revokeAllActiveForUser(user.id);
    const expiresAt = new Date(Date.now() + this.sessionMaxAgeSec() * 1000);
    const { rawToken } = await this.sessions.createSession(
      user.id,
      expiresAt,
      ip,
      userAgent,
    );

    await this.prisma.adminUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.audit.log({
      adminUserId: user.id,
      action: 'admin.login.success',
      targetType: 'admin_session',
      metadata: {} as object,
      ipAddress: ip,
      userAgent,
    });

    const admin: AdminMePayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions: permissionsForRole(user.role),
    };

    return { rawToken, admin };
  }

  async resolveSession(
    rawToken: string | undefined,
  ): Promise<{ admin: AdminMePayload; sessionId: string } | null> {
    if (!rawToken || rawToken.length < 32) {
      return null;
    }
    const sessionTokenHash = hashSessionToken(rawToken);
    const session = await this.prisma.adminSession.findFirst({
      where: {
        sessionTokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        adminUser: { status: AdminUserStatus.ACTIVE },
      },
      include: { adminUser: true },
    });
    if (!session) {
      return null;
    }
    const u = session.adminUser;
    const admin: AdminMePayload = {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      permissions: permissionsForRole(u.role),
    };
    return { admin, sessionId: session.id };
  }

  async logout(
    sessionId: string,
    adminUserId: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<void> {
    await this.sessions.revokeSession(sessionId);
    await this.audit.log({
      adminUserId,
      action: 'admin.logout',
      targetType: 'admin_session',
      targetId: sessionId,
      metadata: {} as object,
      ipAddress,
      userAgent,
    });
  }
}
