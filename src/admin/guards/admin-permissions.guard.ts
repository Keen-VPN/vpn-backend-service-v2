import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { REQUIRE_ADMIN_PERMISSIONS_KEY } from '../decorators/require-admin-permissions.decorator';
import type { AdminPermission } from '../admin-permissions';
import { AdminAuditService } from '../admin-audit.service';

@Injectable()
export class AdminPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AdminAuditService) private readonly adminAudit: AdminAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<
      AdminPermission[] | undefined
    >(REQUIRE_ADMIN_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) {
      return true;
    }
    const req = context.switchToHttp().getRequest<Request>();
    const admin = req.adminAuth?.admin;
    const userAgent =
      typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : null;
    if (!admin) {
      await this.adminAudit.log({
        adminUserId: null,
        action: 'admin.permission.denied',
        targetType: 'route',
        targetId: req.path,
        metadata: { required } as object,
        ipAddress: req.ip || null,
        userAgent,
      });
      throw new ForbiddenException('Missing admin context');
    }
    const granted = new Set(admin.permissions);
    const missing = required.filter((p) => !granted.has(p));
    if (missing.length > 0) {
      await this.adminAudit.log({
        adminUserId: admin.id,
        action: 'admin.permission.denied',
        targetType: 'route',
        targetId: req.path,
        metadata: { required, missing } as object,
        ipAddress: req.ip || null,
        userAgent,
      });
      throw new ForbiddenException('Insufficient admin permissions');
    }
    return true;
  }
}
