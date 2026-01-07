import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private configService: ConfigService) {
    super({
      // Prisma 7 reads DATABASE_URL from environment variable automatically
      // But we can also set it explicitly if needed
    });
    
    // Ensure DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
      const dbUrl = this.configService.get<string>('DATABASE_URL');
      if (dbUrl) {
        process.env.DATABASE_URL = dbUrl;
      }
    }
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

