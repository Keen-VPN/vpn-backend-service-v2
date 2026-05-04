import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AdminRequestUser } from '../../types/express';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminRequestUser => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const admin = req.adminAuth?.admin;
    if (!admin) {
      throw new Error('CurrentAdmin used without AdminAuthGuard');
    }
    return admin;
  },
);

export const CurrentAdminSessionId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const id = req.adminAuth?.sessionId;
    if (!id) {
      throw new Error('CurrentAdminSessionId used without AdminAuthGuard');
    }
    return id;
  },
);
