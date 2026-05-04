import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';

function safeCompareKey(provided: string, expected: string): boolean {
  try {
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Protects internal admin routes (e.g. membership transfer review).
 * Send header: X-Admin-Api-Key: <MEMBERSHIP_TRANSFER_ADMIN_KEY>
 */
@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const expected =
      this.configService.get<string>('MEMBERSHIP_TRANSFER_ADMIN_KEY') ||
      process.env.MEMBERSHIP_TRANSFER_ADMIN_KEY;
    if (!expected || expected.length < 16) {
      throw new UnauthorizedException(
        'Admin membership tools are not configured',
      );
    }
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers['x-admin-api-key'];
    const provided = Array.isArray(header) ? header[0] : header;
    if (typeof provided !== 'string' || !safeCompareKey(provided, expected)) {
      throw new UnauthorizedException('Invalid admin API key');
    }
    return true;
  }
}
