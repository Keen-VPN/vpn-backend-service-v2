import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { adminSessionCookieOptions } from '../../../src/admin/admin-cookie.util';
import {
  assertNoWildcardOrigins,
  parseCorsOrigins,
} from '../../../src/common/http/cors.util';

describe('admin cookie + cors hardening', () => {
  function cfg(values: Record<string, string | undefined>): ConfigService {
    return {
      get: jest.fn((k: string) => values[k]),
    } as unknown as ConfigService;
  }

  it('uses /api path and HttpOnly defaults', () => {
    const options = adminSessionCookieOptions(
      cfg({ NODE_ENV: 'development' }),
      3600,
    );
    expect(options.path).toBe('/api');
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('lax');
  });

  it('forces Secure when SameSite=None', () => {
    const options = adminSessionCookieOptions(
      cfg({
        NODE_ENV: 'development',
        ADMIN_SESSION_COOKIE_SAME_SITE: 'none',
      }),
      3600,
    );
    expect(options.sameSite).toBe('none');
    expect(options.secure).toBe(true);
  });

  it('rejects wildcard CORS origins with credentials policy', () => {
    expect(() => assertNoWildcardOrigins(parseCorsOrigins('*'))).toThrow(
      BadRequestException,
    );
  });
});
