import { BadRequestException } from '@nestjs/common';

export function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function assertNoWildcardOrigins(origins: string[]): void {
  if (origins.includes('*')) {
    throw new BadRequestException(
      'CORS_ORIGINS cannot include wildcard (*) when credentials are enabled',
    );
  }
}
