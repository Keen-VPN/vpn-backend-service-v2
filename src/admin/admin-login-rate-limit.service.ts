import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { SafeLogger } from '../common/utils/logger.util';

type Bucket = { count: number; resetAt: number };

/**
 * In-memory login rate limit keyed by email + IP. Suitable for single-node or dev;
 * use a shared store if horizontally scaling auth.
 */
@Injectable()
export class AdminLoginRateLimiterService implements OnModuleDestroy {
  private readonly buckets = new Map<string, Bucket>();
  private readonly maxAttempts = 10;
  private readonly windowMs = 15 * 60 * 1000;
  private readonly backend: 'in_memory' | 'redis';
  private redis: Redis | null = null;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    this.backend =
      (this.config.get<string>('ADMIN_LOGIN_RATE_LIMITER_BACKEND') as
        | 'in_memory'
        | 'redis'
        | undefined) ?? 'in_memory';
    this.warnIfInMemoryInMultiInstance();
  }

  async assertAllowed(key: string): Promise<void> {
    if (this.backend === 'redis') {
      await this.assertAllowedRedis(key);
      return;
    }
    this.assertAllowedInMemory(key);
  }

  private assertAllowedInMemory(key: string): void {
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || now > existing.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return;
    }
    existing.count += 1;
    if (existing.count > this.maxAttempts) {
      throw new HttpException(
        'Too many login attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async assertAllowedRedis(key: string): Promise<void> {
    const redis = this.getRedis();
    const redisKey = `admin:login:rate:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.pexpire(redisKey, this.windowMs);
    }
    if (count > this.maxAttempts) {
      throw new HttpException(
        'Too many login attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private getRedis(): Redis {
    if (this.redis) return this.redis;
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      throw new HttpException(
        'Rate limiter configured for redis but REDIS_URL is missing',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    this.redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });
    return this.redis;
  }

  private warnIfInMemoryInMultiInstance(): void {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    const countRaw = this.config.get<string>('APP_INSTANCE_COUNT');
    const count = countRaw ? parseInt(countRaw, 10) : 1;
    if (isProd && this.backend === 'in_memory' && count > 1) {
      SafeLogger.warn(
        'Admin login limiter uses in-memory backend across multiple instances; switch to redis for consistent enforcement',
        { service: AdminLoginRateLimiterService.name },
        { appInstanceCount: count },
      );
    }
  }

  /** @internal testing */
  resetAll(): void {
    this.buckets.clear();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }
}
