import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ServerLocationPreferenceBodyDto } from '../common/dto/server-location-preference.dto';

@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async submitServerLocationPreference(body: ServerLocationPreferenceBodyDto) {
    const preference = await this.prisma.serverLocationPreference.create({
      data: {
        clientSessionId: body.client_session_id ?? null,
        country: body.country,
        reason: body.reason,
      },
    });

    return {
      id: preference.id,
      client_session_id: preference.clientSessionId ?? '',
      country: preference.country,
      reason: preference.reason,
      createdAt: preference.createdAt.toISOString(),
      updatedAt: preference.updatedAt.toISOString(),
    };
  }
}
