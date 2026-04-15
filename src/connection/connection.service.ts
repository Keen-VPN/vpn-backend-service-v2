import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SafeLogger } from '../common/utils/logger.util';
import { ConnectionSessionDto } from '../common/dto/connection-session.dto';
import { NodesService } from '../nodes/nodes.service';

@Injectable()
export class ConnectionService {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(NodesService) private nodesService: NodesService,
  ) {}

  async getRecommendedNode(region: string) {
    const nodes = await this.nodesService.getActiveNodesInRegion(region);

    if (nodes.length === 0) {
      return null;
    }

    // Simple load balancing: pick the one with the fewest active sessions or just first for now
    // Future: consider metrics (CPU/RAM)
    return nodes[0];
  }

  async recordSession(sessionDto: ConnectionSessionDto) {
    try {
      const sessionStart = new Date(sessionDto.session_start);
      // Map event type string to Enum if needed, or rely on Prisma casting
      // sessionDto.event_type is 'START' | 'HEARTBEAT' | 'END'
      // Prisma EventType is SESSION_START, HEARTBEAT, SESSION_END

      let eventType: 'SESSION_START' | 'HEARTBEAT' | 'SESSION_END';
      switch (sessionDto.event_type) {
        case 'START':
          eventType = 'SESSION_START';
          break;
        case 'HEARTBEAT':
          eventType = 'HEARTBEAT';
          break;
        case 'END':
          eventType = 'SESSION_END';
          break;
        default:
          eventType = 'HEARTBEAT';
      }

      const sessionEnd = sessionDto.session_end
        ? new Date(sessionDto.session_end)
        : sessionDto.event_type === 'END'
          ? new Date() // Default to now if END but no time provided
          : null;

      // Upsert the session based on clientSessionId
      await this.prisma.connectionSession.upsert({
        where: { clientSessionId: sessionDto.client_session_id },
        update: {
          durationSeconds: sessionDto.duration_seconds || 0,
          bytesTransferred: sessionDto.bytes_transferred
            ? BigInt(sessionDto.bytes_transferred)
            : undefined,
          heartbeatTimestamp: new Date(),
          eventType: eventType,
          sessionEnd: sessionEnd,
          terminationReason:
            sessionDto.event_type === 'END' ? 'USER_TERMINATION' : undefined,
          disconnectReason: sessionDto.disconnect_reason,
          networkType: sessionDto.network_type,
          subscriptionTier: sessionDto.subscription_tier,
          // Only update these if provided? Or strictly update?
          // Usually heartbeat just updates duration/bytes/timestamp
        },
        create: {
          clientSessionId: sessionDto.client_session_id,
          sessionStart: sessionStart,
          sessionEnd: sessionEnd,
          durationSeconds: sessionDto.duration_seconds || 0,
          platform: sessionDto.platform,
          appVersion: sessionDto.app_version,
          serverLocation: sessionDto.server_location,
          subscriptionTier: sessionDto.subscription_tier,
          bytesTransferred: sessionDto.bytes_transferred
            ? BigInt(sessionDto.bytes_transferred)
            : BigInt(0),
          eventType: eventType,
          terminationReason: 'USER_TERMINATION',
          protocol: sessionDto.protocol || 'wireguard',
          networkType: sessionDto.network_type,
          heartbeatTimestamp: new Date(),
        },
      });

      SafeLogger.info('Connection session recorded', {
        clientId: sessionDto.client_session_id,
        event: sessionDto.event_type,
        duration: sessionDto.duration_seconds,
      });

      return {
        success: true,
      };
    } catch (error) {
      SafeLogger.error('Error recording connection session', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to record session';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async upsertUserLongestSession(userId: string, durationSeconds: number) {
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ longest_session_seconds: number }>
      >`
        UPDATE users
        SET longest_session_seconds = GREATEST(longest_session_seconds, ${durationSeconds})
        WHERE id = ${userId}
        RETURNING longest_session_seconds
      `;
      const updated = rows[0];

      if (!updated) {
        return {
          success: false,
          error: 'User not found',
        };
      }

      return {
        success: true,
        data: { longest_session_seconds: updated.longest_session_seconds ?? 0 },
      };
    } catch (error) {
      SafeLogger.error('Error updating user longest session', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to update longest session';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async getUserLongestSession(userId: string) {
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ longest_session_seconds: number }>
      >`SELECT longest_session_seconds FROM users WHERE id = ${userId} LIMIT 1`;
      const user = rows[0];

      if (!user) {
        return {
          success: false,
          error: 'User not found',
        };
      }

      return {
        success: true,
        data: { longest_session_seconds: user.longest_session_seconds ?? 0 },
      };
    } catch (error) {
      SafeLogger.error('Error fetching user longest session', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to fetch metric';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async getConnectionStats() {
    try {
      // NOTE: Current schema stores connection sessions without user linkage.
      // This returns aggregate totals from all recorded sessions.
      const [aggregate, platformRows, dailyRows] = await Promise.all([
        this.prisma.connectionSession.aggregate({
          _count: { _all: true },
          _sum: {
            durationSeconds: true,
            bytesTransferred: true,
          },
          _avg: {
            durationSeconds: true,
          },
        }),
        this.prisma.connectionSession.groupBy({
          by: ['platform'],
          _count: { _all: true },
          _sum: { durationSeconds: true },
        }),
        this.prisma.$queryRaw<Array<{ day: Date; count: number }>>`
          SELECT DATE(session_start) AS day, COUNT(*)::int AS count
          FROM connection_sessions
          WHERE session_start >= (CURRENT_DATE - INTERVAL '13 days')
          GROUP BY DATE(session_start)
          ORDER BY day ASC
        `,
      ]);

      const totalSessions = aggregate._count._all ?? 0;
      const totalDurationSeconds = aggregate._sum.durationSeconds ?? 0;
      const averageDurationSeconds = Math.round(
        aggregate._avg.durationSeconds ?? 0,
      );
      const totalBytesTransferred = Number(
        aggregate._sum.bytesTransferred ?? BigInt(0),
      );

      const platformBreakdown = platformRows.reduce<
        Record<string, { sessions: number; total_duration_seconds: number }>
      >((acc, row) => {
        const key = row.platform || 'unknown';
        acc[key] = {
          sessions: row._count._all ?? 0,
          total_duration_seconds: row._sum.durationSeconds ?? 0,
        };
        return acc;
      }, {});

      const countsByDay = new Map<string, number>();
      for (const row of dailyRows) {
        const key = new Date(row.day).toISOString().slice(0, 10);
        countsByDay.set(key, row.count ?? 0);
      }

      const dailyConnectionFrequency: Array<{ date: string; count: number }> =
        [];
      for (let offset = 13; offset >= 0; offset -= 1) {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - offset);
        const key = date.toISOString().slice(0, 10);
        dailyConnectionFrequency.push({
          date: `${key}T00:00:00.000Z`,
          count: countsByDay.get(key) ?? 0,
        });
      }

      return {
        success: true,
        data: {
          total_sessions: totalSessions,
          total_duration_seconds: totalDurationSeconds,
          average_duration_seconds: averageDurationSeconds,
          total_bytes_transferred: totalBytesTransferred,
          platform_breakdown: platformBreakdown,
          daily_connection_frequency: dailyConnectionFrequency,
        },
      };
    } catch (error) {
      SafeLogger.error('Error fetching connection stats', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to fetch connection stats';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async getConnectionSessions(limit = 50, offset = 0) {
    try {
      const safeLimit = Math.max(1, Math.min(limit, 200));
      const safeOffset = Math.max(0, offset);

      const sessions = await this.prisma.connectionSession.findMany({
        orderBy: { sessionStart: 'desc' },
        take: safeLimit,
        skip: safeOffset,
        select: {
          id: true,
          sessionStart: true,
          sessionEnd: true,
          durationSeconds: true,
          platform: true,
          appVersion: true,
        },
      });

      return {
        success: true,
        data: sessions.map((session) => ({
          id: session.id,
          session_start: session.sessionStart.toISOString(),
          session_end: session.sessionEnd?.toISOString() ?? null,
          duration_seconds: session.durationSeconds ?? 0,
          platform: session.platform,
          app_version: session.appVersion ?? null,
        })),
      };
    } catch (error) {
      SafeLogger.error('Error fetching connection sessions', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to fetch connection sessions';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}
