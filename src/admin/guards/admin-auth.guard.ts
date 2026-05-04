import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminAuthService } from '../admin-auth.service';
import { ADMIN_SESSION_COOKIE } from '../admin.constants';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly adminAuth: AdminAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const raw = cookies?.[ADMIN_SESSION_COOKIE];
    const token = typeof raw === 'string' ? raw : undefined;
    const resolved = await this.adminAuth.resolveSession(token);
    if (!resolved) {
      throw new UnauthorizedException('Admin session required');
    }
    req.adminAuth = resolved;
    return true;
  }
}
