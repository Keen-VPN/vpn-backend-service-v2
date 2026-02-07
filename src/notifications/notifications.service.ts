import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async registerPushToken(
    userId: string,
    token: string,
    deviceHash?: string,
    platform?: string,
    environment?: string,
  ): Promise<{ success: boolean }> {
    await this.prisma.pushToken.upsert({
      where: { token },
      create: {
        userId,
        token,
        deviceHash: deviceHash ?? null,
        platform: platform ?? null,
        environment: environment ?? null,
      },
      update: {
        userId,
        deviceHash: deviceHash ?? undefined,
        platform: platform ?? undefined,
        environment: environment ?? undefined,
      },
    });
    return { success: true };
  }
}
