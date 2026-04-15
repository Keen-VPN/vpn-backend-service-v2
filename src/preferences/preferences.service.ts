import { Injectable, Inject, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { ServerLocationPreferenceBodyDto } from '../common/dto/server-location-preference.dto';

export interface ServerLocationPreferenceResult {
  id: string;
  region: string;
  reason: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class PreferencesService {
  private readonly logger = new Logger(PreferencesService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async submitServerLocationPreference(
    body: ServerLocationPreferenceBodyDto,
  ): Promise<ServerLocationPreferenceResult> {
    const preference = await this.prisma.serverLocationPreference.create({
      data: {
        region: body.region,
        reason: body.reason,
      },
    });

    const result = {
      id: preference.id,
      region: preference.region,
      reason: preference.reason,
      createdAt: preference.createdAt.toISOString(),
      updatedAt: preference.updatedAt.toISOString(),
    };

    // Resolve NotificationService at runtime — constructor DI for its inner
    // deps (ConfigService/HttpService) is unreliable under Netlify's
    // serverless bundling, matching the workaround in HttpExceptionFilter.
    try {
      const notificationService = this.moduleRef.get(NotificationService, {
        strict: false,
      });
      if (
        notificationService &&
        typeof notificationService.notifyServerLocationRequest === 'function'
      ) {
        void notificationService
          .notifyServerLocationRequest({
            region: result.region,
            reason: result.reason,
            createdAt: result.createdAt,
          })
          .catch((error: Error) => {
            this.logger.error(
              `Failed to send Slack notification for server location request: ${error.message}`,
            );
          });
      }
    } catch (error) {
      this.logger.error(
        `Could not resolve NotificationService for server location request: ${(error as Error).message}`,
      );
    }

    return result;
  }
}
