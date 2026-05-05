import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminUserRole, AdminUserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminSessionService } from './admin-session.service';
import { assertStrongPassword } from './password-policy';
import { AdminAuditService } from './admin-audit.service';
import type { AdminRequestUser } from '../types/express';
import type { CreateAdminUserDto } from './dto/create-admin-user.dto';

@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AdminAuthService) private readonly adminAuth: AdminAuthService,
    @Inject(AdminSessionService) private readonly sessions: AdminSessionService,
    @Inject(AdminAuditService) private readonly audit: AdminAuditService,
  ) {}

  async create(
    actor: AdminRequestUser,
    dto: CreateAdminUserDto,
    ip: string | null,
    userAgent: string | null,
  ) {
    if (actor.role !== AdminUserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admins may create admin users');
    }
    if (
      dto.role === AdminUserRole.SUPER_ADMIN &&
      actor.role !== AdminUserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Only a super admin may create another super admin',
      );
    }
    assertStrongPassword(dto.password);
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.adminUser.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException('An admin with this email already exists');
    }
    const passwordHash = await this.adminAuth.hashPassword(dto.password);
    const user = await this.prisma.adminUser.create({
      data: {
        email,
        passwordHash,
        name: dto.name.trim(),
        role: dto.role,
        status: AdminUserStatus.ACTIVE,
      },
    });
    await this.audit.log({
      adminUserId: actor.id,
      action: 'admin.user.created',
      targetType: 'admin_user',
      targetId: user.id,
      metadata: { email: user.email, role: user.role } as object,
      ipAddress: ip,
      userAgent,
    });
    return {
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
      },
    };
  }

  async updateOwnPassword(
    actor: AdminRequestUser,
    currentPassword: string,
    newPassword: string,
    ip: string | null,
    userAgent: string | null,
  ) {
    if (actor.role !== AdminUserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only super admins may update admin passwords',
      );
    }
    assertStrongPassword(newPassword);
    const me = await this.prisma.adminUser.findUnique({
      where: { id: actor.id },
    });
    if (!me) {
      throw new NotFoundException('Admin user not found');
    }
    const ok = await this.adminAuth.verifyPassword(
      me.passwordHash,
      currentPassword,
    );
    if (!ok) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const passwordHash = await this.adminAuth.hashPassword(newPassword);
    await this.prisma.adminUser.update({
      where: { id: actor.id },
      data: { passwordHash },
    });
    await this.sessions.revokeAllActiveForUser(actor.id);
    await this.audit.log({
      adminUserId: actor.id,
      action: 'admin.user.password_updated',
      targetType: 'admin_user',
      targetId: actor.id,
      metadata: { email: me.email } as object,
      ipAddress: ip,
      userAgent,
    });
    return { success: true };
  }

  async getUsersOverview(limit = 20) {
    const safeLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(100, Math.floor(limit)))
      : 20;
    const [totalUsers, topUsers] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.findMany({
        orderBy: [{ longestSessionSeconds: 'desc' }, { createdAt: 'desc' }],
        take: safeLimit,
        select: {
          id: true,
          email: true,
          displayName: true,
          longestSessionSeconds: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      success: true,
      data: {
        totalUsers,
        users: topUsers.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.displayName ?? null,
          longestSessionSeconds: u.longestSessionSeconds,
          createdAt: u.createdAt.toISOString(),
        })),
      },
    };
  }

  async disable(
    actor: AdminRequestUser,
    targetId: string,
    ip: string | null,
    userAgent: string | null,
  ) {
    if (targetId === actor.id) {
      throw new ForbiddenException('You cannot disable your own account');
    }
    const target = await this.prisma.adminUser.findUnique({
      where: { id: targetId },
    });
    if (!target) {
      throw new NotFoundException('Admin user not found');
    }
    if (
      target.role === AdminUserRole.SUPER_ADMIN &&
      actor.role !== AdminUserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Only a super admin may disable a super admin',
      );
    }
    await this.prisma.adminUser.update({
      where: { id: targetId },
      data: { status: AdminUserStatus.DISABLED },
    });
    await this.sessions.revokeAllActiveForUser(targetId);
    await this.audit.log({
      adminUserId: actor.id,
      action: 'admin.user.disabled',
      targetType: 'admin_user',
      targetId,
      metadata: { email: target.email } as object,
      ipAddress: ip,
      userAgent,
    });
    return { success: true };
  }
}
