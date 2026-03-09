import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(@Inject(ConfigService) private configService: ConfigService) {
    let databaseUrl = configService?.get<string>('DATABASE_URL');

    if (!databaseUrl) {
      // Fallback for Netlify bundled environment if DI fails
      databaseUrl = process.env.DATABASE_URL;
    }

    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not defined (ConfigService or ENV)');
    }

    super({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
  }

  async onModuleInit() {
    // Intentionally left blank. Let Prisma construct connection lazily on the first query.
    // In serverless environments, an aggressive initial connection can hang the container spin-up.
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
