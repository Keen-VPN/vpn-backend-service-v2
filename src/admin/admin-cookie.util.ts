import { ConfigService } from '@nestjs/config';
import type { CookieOptions } from 'express';

export function adminSessionCookieOptions(
  config: ConfigService,
  maxAgeSec: number,
): CookieOptions {
  const nodeEnv = config.get<string>('NODE_ENV') || 'development';
  const isProd = nodeEnv === 'production';
  const rawSameSite = (
    config.get<string>('ADMIN_SESSION_COOKIE_SAME_SITE') || 'lax'
  ).toLowerCase();
  const sameSite =
    rawSameSite === 'strict' || rawSameSite === 'none' || rawSameSite === 'lax'
      ? rawSameSite
      : 'lax';
  const domain = config.get<string>('ADMIN_SESSION_COOKIE_DOMAIN');
  return {
    httpOnly: true,
    secure: isProd || sameSite === 'none',
    sameSite: sameSite as CookieOptions['sameSite'],
    path: '/api',
    maxAge: maxAgeSec * 1000,
    ...(domain ? { domain } : {}),
  };
}

export function adminSessionClearCookieOptions(
  config: ConfigService,
): CookieOptions {
  const base = adminSessionCookieOptions(config, 0);
  return {
    ...base,
    maxAge: 0,
  };
}
