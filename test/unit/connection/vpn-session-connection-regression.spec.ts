import { Test, TestingModule } from '@nestjs/testing';
import { ConnectionService } from '../../../src/connection/connection.service';
import { VpnSessionService } from '../../../src/vpn/vpn-session.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { NodesService } from '../../../src/nodes/nodes.service';

type SessionRow = {
  id: string;
  clientSessionId: string;
  userId: string | null;
  sessionStart: Date;
  sessionEnd: Date | null;
  durationSeconds: number;
  platform: string;
  appVersion: string | null;
  bytesTransferred: bigint;
  subscriptionTier: string | null;
  terminationReason: 'USER_TERMINATION' | 'CONNECTION_LOST';
  disconnectReason: string | null;
  eventType: 'SESSION_START' | 'HEARTBEAT' | 'SESSION_END';
  protocol: string | null;
  networkType: string | null;
  heartbeatTimestamp: Date | null;
  serverLocation: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const effectiveDuration = (row: SessionRow): number => {
  const fallbackEnd = row.sessionEnd ?? row.heartbeatTimestamp ?? row.updatedAt;
  const fallback = Math.max(
    0,
    Math.floor((fallbackEnd.getTime() - row.sessionStart.getTime()) / 1000),
  );
  return Math.max(row.durationSeconds, fallback);
};

describe('VPN session regression: canonical connection_sessions', () => {
  let connectionService: ConnectionService;
  let vpnSessionService: VpnSessionService;
  let callIndex = 0;
  const rows: SessionRow[] = [];

  const mockPrisma = {
    connectionSession: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    node: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    callIndex = 0;
    rows.length = 0;
    jest.clearAllMocks();

    mockPrisma.connectionSession.findUnique.mockImplementation(
      async ({ where }: { where: { clientSessionId: string } }) =>
        rows.find((r) => r.clientSessionId === where.clientSessionId) ?? null,
    );

    mockPrisma.connectionSession.upsert.mockImplementation(
      async ({
        where,
        create,
        update,
      }: {
        where: { clientSessionId: string };
        create: Partial<SessionRow>;
        update: Partial<SessionRow>;
      }) => {
        const existing = rows.find(
          (r) => r.clientSessionId === where.clientSessionId,
        );
        if (!existing) {
          const now = new Date();
          const row: SessionRow = {
            id: `row-${rows.length + 1}`,
            clientSessionId: String(create.clientSessionId),
            userId: (create.userId as string | null) ?? null,
            sessionStart: create.sessionStart as Date,
            sessionEnd: (create.sessionEnd as Date | null) ?? null,
            durationSeconds: Number(create.durationSeconds ?? 0),
            platform: String(create.platform ?? 'unknown'),
            appVersion: (create.appVersion as string | null) ?? null,
            bytesTransferred: (create.bytesTransferred as bigint) ?? BigInt(0),
            subscriptionTier:
              (create.subscriptionTier as string | null) ?? null,
            terminationReason:
              (create.terminationReason as
                | 'USER_TERMINATION'
                | 'CONNECTION_LOST') ?? 'USER_TERMINATION',
            disconnectReason:
              (create.disconnectReason as string | null) ?? null,
            eventType:
              (create.eventType as
                | 'SESSION_START'
                | 'HEARTBEAT'
                | 'SESSION_END') ?? 'SESSION_START',
            protocol: (create.protocol as string | null) ?? 'wireguard',
            networkType: (create.networkType as string | null) ?? null,
            heartbeatTimestamp:
              (create.heartbeatTimestamp as Date | null) ?? null,
            serverLocation: (create.serverLocation as string | null) ?? null,
            createdAt: now,
            updatedAt: now,
          };
          rows.push(row);
          return row;
        }
        Object.assign(existing, update, { updatedAt: new Date() });
        return existing;
      },
    );

    mockPrisma.connectionSession.findMany.mockImplementation(
      async ({ where }: { where: { userId: string } }) =>
        rows
          .filter((r) => r.userId === where.userId)
          .sort((a, b) => b.sessionStart.getTime() - a.sessionStart.getTime())
          .map((r) => ({
            id: r.id,
            sessionStart: r.sessionStart,
            sessionEnd: r.sessionEnd,
            durationSeconds: r.durationSeconds,
            platform: r.platform,
            appVersion: r.appVersion,
            serverLocation: r.serverLocation,
          })),
    );

    mockPrisma.$transaction.mockImplementation(async (fn: any) =>
      fn(mockPrisma),
    );

    mockPrisma.$executeRaw.mockImplementation(async (...args: any[]) => {
      const [strings, ...values] = args;
      const sql = Array.isArray(strings) ? strings.join(' ') : String(strings);
      if (sql.includes('duration_seconds = GREATEST(duration_seconds')) {
        const [incomingDuration, incomingBytes, userId, clientSessionId] =
          values;
        const row = rows.find((r) => r.clientSessionId === clientSessionId);
        if (!row) return 0;
        row.durationSeconds = Math.max(
          row.durationSeconds,
          Number(incomingDuration),
        );
        row.bytesTransferred =
          row.bytesTransferred > BigInt(incomingBytes)
            ? row.bytesTransferred
            : BigInt(incomingBytes);
        if (!row.userId) row.userId = userId ?? null;
        return 1;
      }
      if (sql.includes('SET duration_seconds = GREATEST(duration_seconds')) {
        const [derivedDuration, clientSessionId] = values;
        const row = rows.find((r) => r.clientSessionId === clientSessionId);
        if (!row) return 0;
        row.durationSeconds = Math.max(
          row.durationSeconds,
          Number(derivedDuration),
        );
        return 1;
      }
      if (sql.includes('"session_end" IS NULL')) {
        const [cutoff] = values;
        let count = 0;
        for (const row of rows) {
          if (
            row.sessionEnd == null &&
            row.heartbeatTimestamp != null &&
            row.heartbeatTimestamp < cutoff
          ) {
            row.sessionEnd = row.heartbeatTimestamp;
            row.eventType = 'SESSION_END';
            row.terminationReason = 'CONNECTION_LOST';
            row.disconnectReason =
              row.disconnectReason ?? 'server_inferred_last_seen_timeout';
            count += 1;
          }
        }
        return count;
      }
      return 0;
    });

    mockPrisma.$queryRaw.mockImplementation(async () => {
      // Prisma's tagged template internals are opaque in mocked unit tests.
      // Scope to our seeded rows (single-user fixture) for deterministic assertions.
      const userRows = [...rows];
      const slot = callIndex % 4;
      callIndex += 1;

      if (slot === 0) {
        const durations = userRows.map(effectiveDuration);
        const totalDuration = durations.reduce((a, b) => a + b, 0);
        return [
          {
            total_sessions: userRows.length,
            total_duration_seconds: BigInt(totalDuration),
            average_duration_seconds:
              userRows.length > 0 ? totalDuration / userRows.length : 0,
            total_bytes_transferred: userRows.reduce(
              (a, b) => a + b.bytesTransferred,
              BigInt(0),
            ),
            max_duration_seconds:
              durations.length > 0 ? Math.max(...durations) : 0,
          },
        ];
      }
      if (slot === 1) {
        const grouped = new Map<string, { sessions: number; total: number }>();
        for (const r of userRows) {
          const prev = grouped.get(r.platform) ?? { sessions: 0, total: 0 };
          prev.sessions += 1;
          prev.total += effectiveDuration(r);
          grouped.set(r.platform, prev);
        }
        return [...grouped.entries()].map(([platform, v]) => ({
          platform,
          sessions: v.sessions,
          total_duration_seconds: BigInt(v.total),
        }));
      }
      if (slot === 2) {
        const daily = new Map<string, number>();
        for (const r of userRows) {
          const k = r.sessionStart.toISOString().slice(0, 10);
          daily.set(k, (daily.get(k) ?? 0) + 1);
        }
        return [...daily.entries()].map(([day, count]) => ({
          day: new Date(`${day}T00:00:00.000Z`),
          count,
        }));
      }
      const locations = new Map<string, number>();
      for (const r of userRows) {
        if (!r.serverLocation) continue;
        locations.set(
          r.serverLocation,
          (locations.get(r.serverLocation) ?? 0) + 1,
        );
      }
      return [...locations.entries()].map(([server_location, sessions]) => ({
        server_location,
        sessions,
      }));
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectionService,
        VpnSessionService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: NodesService,
          useValue: {
            getActiveNodesInRegion: jest.fn(),
          },
        },
      ],
    }).compile();

    connectionService = module.get(ConnectionService);
    vpnSessionService = module.get(VpnSessionService);
  });

  it('includes /vpn/sessions-created rows in existing history service', async () => {
    const userId = 'user-1';
    await vpnSessionService.upsertSession(userId, {
      id: '11111111-1111-4111-8111-111111111111',
      startAt: '2026-05-04T10:00:00.000Z',
      lastSeenAt: '2026-05-04T10:01:00.000Z',
      endAt: null,
    });

    const history = await connectionService.getConnectionSessions(
      userId,
      50,
      0,
    );
    expect(history.success).toBe(true);
    expect(history.data).toHaveLength(1);
    expect(history.data?.[0]).toEqual(
      expect.objectContaining({
        platform: 'ios_extension',
        session_start: '2026-05-04T10:00:00.000Z',
      }),
    );
  });

  it('stats include vpn-created open/closed rows exactly like connection rows', async () => {
    const userId = 'user-1';

    // App path row (canonical connection_sessions writer).
    await connectionService.recordSession(
      {
        client_session_id: 'app-session-1',
        event_type: 'END',
        session_start: '2026-05-04T09:00:00.000Z',
        session_end: '2026-05-04T09:05:00.000Z',
        duration_seconds: 300,
        platform: 'ios',
        app_version: '1.0.0',
        server_location: 'US - Virginia',
        subscription_tier: 'premium',
        bytes_transferred: 1200,
      },
      userId,
    );

    // Extension path row - open with heartbeat (duration fallback path).
    await vpnSessionService.upsertSession(userId, {
      id: '22222222-2222-4222-8222-222222222222',
      startAt: '2026-05-04T10:00:00.000Z',
      lastSeenAt: '2026-05-04T10:10:00.000Z',
      endAt: null,
    });

    // Extension path row - closed with endAt.
    await vpnSessionService.upsertSession(userId, {
      id: '33333333-3333-4333-8333-333333333333',
      startAt: '2026-05-04T11:00:00.000Z',
      lastSeenAt: '2026-05-04T11:06:00.000Z',
      endAt: '2026-05-04T11:06:00.000Z',
      disconnectReason: 'ne_stop_reason_1',
    });

    const stats = await connectionService.getConnectionStats(userId);
    expect(stats.success).toBe(true);
    expect(stats.data?.total_sessions).toBe(3);
    // 300 (app closed) + 600 (open heartbeat fallback) + 360 (closed vpn row)
    expect(stats.data?.total_duration_seconds).toBe(1260);
    expect(stats.data?.platform_breakdown).toEqual(
      expect.objectContaining({
        ios: expect.objectContaining({ sessions: 1 }),
        ios_extension: expect.objectContaining({ sessions: 2 }),
      }),
    );
  });

  it('stale inference closes open vpn rows on the same canonical table', async () => {
    const userId = 'user-1';
    await vpnSessionService.upsertSession(userId, {
      id: '44444444-4444-4444-8444-444444444444',
      startAt: '2026-05-04T10:00:00.000Z',
      lastSeenAt: '2026-05-04T10:01:00.000Z',
      endAt: null,
    });

    const changed = await vpnSessionService.closeStaleOpenSessions(
      new Date('2026-05-04T10:20:00.000Z'),
    );
    expect(changed).toBe(1);
    expect(rows[0].sessionEnd?.toISOString()).toBe('2026-05-04T10:01:00.000Z');
    expect(rows[0].disconnectReason).toBe('server_inferred_last_seen_timeout');
  });
});
