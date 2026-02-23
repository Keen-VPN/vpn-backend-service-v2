import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async submitServerLocationPreference(
    body: ServerLocationPreferenceBodyDto,
  ): Promise<ServerLocationPreferenceResult> {
    const preference = await this.prisma.serverLocationPreference.create({
      data: {
        region: body.region,
        reason: body.reason,
      },
    });

    return {
      id: preference.id,
      region: preference.region,
      reason: preference.reason,
      createdAt: preference.createdAt.toISOString(),
      updatedAt: preference.updatedAt.toISOString(),
    };
  }
}
