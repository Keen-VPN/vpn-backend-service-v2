import { createHash, randomBytes } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export function hashSessionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

@Injectable()
export class AdminSessionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createSession(
    adminUserId: string,
    expiresAt: Date,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<{ rawToken: string; sessionId: string }> {
    const rawToken = randomBytes(32).toString('hex');
    const sessionTokenHash = hashSessionToken(rawToken);
    const row = await this.prisma.adminSession.create({
      data: {
        adminUserId,
        sessionTokenHash,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });
    return { rawToken, sessionId: row.id };
  }

  async revokeAllActiveForUser(adminUserId: string): Promise<void> {
    await this.prisma.adminSession.updateMany({
      where: {
        adminUserId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { revokedAt: new Date() },
    });
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.adminSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async cleanupExpiredOrRevokedSessions(retentionDays = 30): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.adminSession.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: cutoff } },
          { revokedAt: { not: null, lt: cutoff } },
        ],
      },
    });
    return result.count;
  }
}
