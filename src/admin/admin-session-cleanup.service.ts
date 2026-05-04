import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SafeLogger } from '../common/utils/logger.util';
import { AdminSessionService } from './admin-session.service';

@Injectable()
export class AdminSessionCleanupService {
  constructor(
    @Inject(AdminSessionService)
    private readonly adminSessions: AdminSessionService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cleanup(): Promise<void> {
    const deleted =
      await this.adminSessions.cleanupExpiredOrRevokedSessions(30);
    if (deleted > 0) {
      SafeLogger.info(
        'Cleaned up expired/revoked admin sessions',
        {
          service: AdminSessionCleanupService.name,
        },
        { deleted },
      );
    }
  }
}
