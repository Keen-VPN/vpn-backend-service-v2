import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionAuthGuard } from '../../../src/auth/guards/session-auth.guard';
import { PrismaService } from '../../../src/prisma/prisma.service';
import {
  createMockPrismaClient,
  createMockConfigService,
  MockPrismaClient,
} from '../../setup/mocks';
import { createMockUser } from '../../setup/test-helpers';
import * as jwt from 'jsonwebtoken';

jest.mock('jsonwebtoken');

describe('SessionAuthGuard - merged user redirect', () => {
  let guard: SessionAuthGuard;
  let mockPrisma: MockPrismaClient;

  beforeEach(async () => {
    mockPrisma = createMockPrismaClient();
    const mockConfig = createMockConfigService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionAuthGuard,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    guard = module.get<SessionAuthGuard>(SessionAuthGuard);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function createMockExecutionContext(sessionToken: string): ExecutionContext {
    const request = {
      body: { sessionToken },
      headers: {},
      user: undefined as any,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  it('should redirect merged user to primary user', async () => {
    const primaryUser = createMockUser({ id: 'primary-id' });
    const mergedUser = createMockUser({
      id: 'merged-id',
      mergedIntoUserId: 'primary-id',
    });

    (jwt.verify as jest.Mock).mockReturnValue({
      userId: 'merged-id',
      type: 'session',
    });

    mockPrisma.user.findUnique
      .mockResolvedValueOnce(mergedUser)
      .mockResolvedValueOnce(primaryUser);

    const context = createMockExecutionContext('valid-token');
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    const request = context.switchToHttp().getRequest();
    expect(request.user.uid).toBe('primary-id');
    expect(request.user.email).toBe(primaryUser.email);
  });

  it('should throw when merged user target not found', async () => {
    const mergedUser = createMockUser({
      id: 'merged-id',
      mergedIntoUserId: 'deleted-primary-id',
    });

    (jwt.verify as jest.Mock).mockReturnValue({
      userId: 'merged-id',
      type: 'session',
    });

    mockPrisma.user.findUnique
      .mockResolvedValueOnce(mergedUser)
      .mockResolvedValueOnce(null);

    const context = createMockExecutionContext('valid-token');
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should pass through for non-merged user', async () => {
    const normalUser = createMockUser({
      id: 'normal-id',
      mergedIntoUserId: null,
    });

    (jwt.verify as jest.Mock).mockReturnValue({
      userId: 'normal-id',
      type: 'session',
    });

    mockPrisma.user.findUnique.mockResolvedValueOnce(normalUser);

    const context = createMockExecutionContext('valid-token');
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    const request = context.switchToHttp().getRequest();
    expect(request.user.uid).toBe('normal-id');
  });
});
