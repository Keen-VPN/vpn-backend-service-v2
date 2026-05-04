import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { VpnSessionService } from '../../../src/vpn/vpn-session.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { createMockPrismaClient, MockPrismaClient } from '../../setup/mocks';

describe('VpnSessionService', () => {
  let service: VpnSessionService;
  let mockPrisma: MockPrismaClient;

  const userId = 'user-1';
  const sessionId = '11111111-1111-4111-8111-111111111111';
  const t0 = '2026-05-04T10:00:00.000Z';
  const t1 = '2026-05-04T10:01:00.000Z';
  const t2 = '2026-05-04T10:02:00.000Z';

  beforeEach(async () => {
    mockPrisma = createMockPrismaClient();
    mockPrisma.$transaction.mockImplementation(async (arg: unknown) => {
      const fn = arg as (tx: typeof mockPrisma) => Promise<unknown>;
      return fn(mockPrisma);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VpnSessionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(VpnSessionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates a new session', async () => {
    mockPrisma.connectionSession.findUnique.mockResolvedValue(null);
    mockPrisma.connectionSession.upsert.mockResolvedValue({
      id: 'row-1',
      clientSessionId: sessionId,
      userId,
      sessionStart: new Date(t0),
      sessionEnd: null,
      heartbeatTimestamp: new Date(t0),
      disconnectReason: null,
    } as any);

    const res = await service.upsertSession(userId, {
      id: sessionId,
      startAt: t0,
      lastSeenAt: t0,
      endAt: null,
    });

    expect(res.success).toBe(true);
    expect(mockPrisma.connectionSession.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clientSessionId: sessionId },
      }),
    );
  });

  it('duplicate upload is idempotent (same row, monotonic lastSeenAt)', async () => {
    const existing = {
      id: 'row-1',
      clientSessionId: sessionId,
      userId,
      sessionStart: new Date(t0),
      sessionEnd: null,
      heartbeatTimestamp: new Date(t1),
      disconnectReason: null,
      eventType: 'HEARTBEAT',
    };
    mockPrisma.connectionSession.findUnique.mockResolvedValue(existing as any);
    mockPrisma.connectionSession.upsert.mockResolvedValue({
      ...existing,
      heartbeatTimestamp: new Date(t2),
    } as any);

    await service.upsertSession(userId, {
      id: sessionId,
      startAt: t0,
      lastSeenAt: t2,
      endAt: null,
    });

    expect(mockPrisma.connectionSession.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          heartbeatTimestamp: new Date(t2),
        }),
      }),
    );
  });

  it('heartbeat updates lastSeenAt forward only', async () => {
    const existing = {
      id: 'row-1',
      clientSessionId: sessionId,
      userId,
      sessionStart: new Date(t0),
      sessionEnd: null,
      heartbeatTimestamp: new Date(t2),
      disconnectReason: null,
      eventType: 'HEARTBEAT',
    };
    mockPrisma.connectionSession.findUnique.mockResolvedValue(existing as any);
    mockPrisma.connectionSession.upsert.mockResolvedValue(existing as any);

    await service.upsertSession(userId, {
      id: sessionId,
      startAt: t0,
      lastSeenAt: t1,
      endAt: null,
    });

    expect(mockPrisma.connectionSession.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          heartbeatTimestamp: new Date(t2),
        }),
      }),
    );
  });

  it('stop upload closes session (sets endAt)', async () => {
    const existing = {
      id: 'row-1',
      clientSessionId: sessionId,
      userId,
      sessionStart: new Date(t0),
      sessionEnd: null,
      heartbeatTimestamp: new Date(t1),
      disconnectReason: null,
      eventType: 'HEARTBEAT',
    };
    mockPrisma.connectionSession.findUnique.mockResolvedValue(existing as any);
    mockPrisma.connectionSession.upsert.mockResolvedValue({
      ...existing,
      sessionEnd: new Date(t2),
      disconnectReason: 'ne_stop_reason_1',
    } as any);

    await service.upsertSession(userId, {
      id: sessionId,
      startAt: t0,
      lastSeenAt: t2,
      endAt: t2,
      disconnectReason: 'ne_stop_reason_1',
    });

    expect(mockPrisma.connectionSession.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          sessionEnd: new Date(t2),
          disconnectReason: 'ne_stop_reason_1',
        }),
      }),
    );
    expect(mockPrisma.$executeRaw).toHaveBeenCalled();
  });

  it('rejects endAt before startAt', async () => {
    mockPrisma.connectionSession.findUnique.mockResolvedValue(null);
    await expect(
      service.upsertSession(userId, {
        id: sessionId,
        startAt: t2,
        lastSeenAt: t2,
        endAt: t0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects lastSeenAt before startAt', async () => {
    await expect(
      service.upsertSession(userId, {
        id: sessionId,
        startAt: t1,
        lastSeenAt: t0,
        endAt: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('closeStaleOpenSessions runs update for stale rows', async () => {
    process.env.VPN_SESSION_STALE_MINUTES = '5';
    mockPrisma.$executeRaw.mockResolvedValue(3);

    const n = await service.closeStaleOpenSessions(
      new Date('2026-05-04T12:00:00.000Z'),
    );

    expect(n).toBe(3);
    expect(mockPrisma.$executeRaw).toHaveBeenCalled();
  });

  it('does not create duplicate rows for repeated sessionId', async () => {
    mockPrisma.connectionSession.findUnique.mockResolvedValue({
      id: 'row-1',
      clientSessionId: sessionId,
      userId,
      sessionStart: new Date(t0),
      sessionEnd: null,
      heartbeatTimestamp: new Date(t1),
      eventType: 'HEARTBEAT',
    } as any);
    mockPrisma.connectionSession.upsert.mockResolvedValue({
      id: 'row-1',
      clientSessionId: sessionId,
    } as any);

    await service.upsertSession(userId, {
      id: sessionId,
      startAt: t0,
      lastSeenAt: t2,
      endAt: null,
    });

    expect(mockPrisma.connectionSession.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrisma.connectionSession.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clientSessionId: sessionId },
      }),
    );
  });
});
