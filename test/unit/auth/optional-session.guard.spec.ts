import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { OptionalSessionGuard } from '../../../src/auth/guards/optional-session.guard';
import {
  createMockConfigService,
  createMockPrismaClient,
  MockPrismaClient,
  MockConfigService,
} from '../../setup/mocks';

describe('OptionalSessionGuard', () => {
  let guard: OptionalSessionGuard;
  let mockPrisma: MockPrismaClient;
  let mockConfigService: MockConfigService;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    mockConfigService = createMockConfigService();
    guard = new OptionalSessionGuard(mockConfigService, mockPrisma as any);
  });

  function createMockContext(authHeader?: string): ExecutionContext {
    const request: any = { headers: {} };
    if (authHeader !== undefined) {
      request.headers.authorization = authHeader;
    }
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as any;
  }

  it('should return true when no authorization header is present', async () => {
    const context = createMockContext();
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('should return true when authorization header is not Bearer', async () => {
    const context = createMockContext('Basic abc123');
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('should return true when Bearer token is empty', async () => {
    const context = createMockContext('Bearer ');
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('should return true when token type is not session', async () => {
    const secret = 'test-secret';
    const token = jwt.sign(
      { userId: 'user-1', email: 'a@b.com', type: 'refresh' },
      secret,
    );
    const context = createMockContext(`Bearer ${token}`);
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('should return true when user is not found', async () => {
    const secret = 'test-secret';
    const token = jwt.sign(
      { userId: 'user-1', email: 'a@b.com', type: 'session' },
      secret,
    );
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const context = createMockContext(`Bearer ${token}`);
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('should attach user to request when token is valid and user exists', async () => {
    const secret = 'test-secret';
    const token = jwt.sign(
      { userId: 'user-1', email: 'a@b.com', type: 'session' },
      secret,
    );
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
    } as any);

    const request: any = { headers: { authorization: `Bearer ${token}` } };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as any;

    expect(await guard.canActivate(context)).toBe(true);
    expect(request.user).toEqual({
      uid: 'user-1',
      userId: 'user-1',
      email: 'a@b.com',
    });
  });

  it('should return true when jwt.verify throws', async () => {
    const context = createMockContext('Bearer invalid-token');
    expect(await guard.canActivate(context)).toBe(true);
  });
});
