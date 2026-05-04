import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminAuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async log(params: {
    adminUserId: string | null;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    metadata?: Prisma.InputJsonValue;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    await this.prisma.adminAuditLog.create({
      data: {
        adminUserId: params.adminUserId,
        action: params.action,
        targetType: params.targetType ?? null,
        targetId: params.targetId ?? null,
        metadata: params.metadata ?? Prisma.JsonNull,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  }
}
