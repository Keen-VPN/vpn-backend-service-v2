import { Injectable, Inject } from '@nestjs/common';
import { Prisma, TerminationReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SafeLogger } from '../common/utils/logger.util';
import { ConnectionSessionDto } from '../common/dto/connection-session.dto';
import { IpAddressClickEventDto } from '../common/dto/product-event.dto';
import { NodesService } from '../nodes/nodes.service';
import { normalizeServerLocationForStats } from './server-location-stats.util';
import { formatNodeServerLocationDisplay } from './server-location-display.util';
import { randomUUID } from 'crypto';

const HEALTH_CHECK_FAILURE_REASON =
  'HEALTH_CHECK_FAILURE' as unknown as TerminationReason;
const RECOVERY_EXHAUSTED_REASON =
  'RECOVERY_EXHAUSTED' as unknown as TerminationReason;

@Injectable()
export class ConnectionService {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(NodesService) private nodesService: NodesService,
  ) {}

  /**
   * Prefer canonical label from `nodes` when `server_id` is sent; otherwise use client
   * `server_location`. Always run through `normalizeServerLocationForStats` before persist.
   */
  private async resolveStoredServerLocation(
    sessionDto: ConnectionSessionDto,
  ): Promise<string | null> {
    const sid = sessionDto.server_id?.trim();
    let fromNode = '';
    if (sid) {
      const node = await this.prisma.node.findUnique({
        where: { id: sid },
        select: { country: true, city: true },
      });
      if (node) {
        fromNode = formatNodeServerLocationDisplay(node.country, node.city);
      }
    }
    const client = sessionDto.server_location?.trim() ?? '';
    const raw = fromNode.length > 0 ? fromNode : client;
    if (!raw) {
      return null;
    }
    const normalized = normalizeServerLocationForStats(raw);
    return normalized.length > 0 ? normalized : null;
  }

  async getRecommendedNode(region: string) {
    const nodes = await this.nodesService.getActiveNodesInRegion(region);

    if (nodes.length === 0) {
      return null;
    }

    // Simple load balancing: pick the one with the fewest active sessions or just first for now
    // Future: consider metrics (CPU/RAM)
    return nodes[0];
  }

  async recordSession(sessionDto: ConnectionSessionDto, userId?: string) {
    try {
      const sessionStart = new Date(sessionDto.session_start);

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
          ? new Date()
          : null;

      // Derive a typed TerminationReason from the granular disconnect_reason sent
      // by the client. Only set on END events; leave undefined for START/HEARTBEAT.
      const resolveTerminationReason = (
        disconnectReason?: string,
      ): TerminationReason => {
        switch (disconnectReason) {
          case 'RECOVERY_EXHAUSTED':
            return RECOVERY_EXHAUSTED_REASON;
          case 'HEALTH_CHECK_FAILURE':
            return HEALTH_CHECK_FAILURE_REASON;
          case 'NETWORK_RECOVERY':
            // Mid-recovery reconnect — classify as connection lost (not user-initiated)
            return TerminationReason.CONNECTION_LOST;
          case 'USER_TERMINATION':
          default:
            return TerminationReason.USER_TERMINATION;
        }
      };

      const terminationReasonForEnd =
        sessionDto.event_type === 'END'
          ? resolveTerminationReason(sessionDto.disconnect_reason)
          : undefined;

      // Build the update payload carefully so that:
      //   - durationSeconds / bytesTransferred never regress to smaller values
      //     (handled via GREATEST in a follow-up raw query)
      //   - sessionEnd is only written on END events (HEARTBEATs would otherwise
      //     clobber a real end time with null)
      //   - userId is set if it wasn't already, so orphaned rows created before
      //     the user authenticated get linked retroactively
      const incomingDuration = sessionDto.duration_seconds ?? 0;
      const incomingBytes = sessionDto.bytes_transferred
        ? BigInt(sessionDto.bytes_transferred)
        : BigInt(0);

      const storedServerLocation =
        await this.resolveStoredServerLocation(sessionDto);

      const updatePayload: Record<string, unknown> = {
        heartbeatTimestamp: new Date(),
        eventType: eventType,
        disconnectReason: sessionDto.disconnect_reason,
        networkType: sessionDto.network_type,
        subscriptionTier: sessionDto.subscription_tier,
      };
      if (sessionDto.event_type === 'END') {
        updatePayload.sessionEnd = sessionEnd;
        updatePayload.terminationReason = terminationReasonForEnd;
      }
      if (storedServerLocation) {
        updatePayload.serverLocation = storedServerLocation;
      }

      await this.prisma.connectionSession.upsert({
        where: { clientSessionId: sessionDto.client_session_id },
        update: updatePayload,
        create: {
          clientSessionId: sessionDto.client_session_id,
          userId: userId ?? null,
          sessionStart: sessionStart,
          sessionEnd: sessionEnd,
          durationSeconds: incomingDuration,
          platform: sessionDto.platform,
          appVersion: sessionDto.app_version,
          serverLocation: storedServerLocation ?? undefined,
          subscriptionTier: sessionDto.subscription_tier,
          bytesTransferred: incomingBytes,
          eventType: eventType,
          terminationReason:
            terminationReasonForEnd ?? TerminationReason.USER_TERMINATION,
          disconnectReason: sessionDto.disconnect_reason,
          protocol: sessionDto.protocol || 'wireguard',
          networkType: sessionDto.network_type,
          heartbeatTimestamp: new Date(),
        },
      });

      // Monotonic (GREATEST) update for the counters + retroactive userId link.
      // Done as a single raw UPDATE to keep it atomic and avoid regressions when
      // events arrive out of order (e.g. a late HEARTBEAT after an END).
      await this.prisma.$executeRaw`
        UPDATE connection_sessions
           SET duration_seconds = GREATEST(duration_seconds, ${incomingDuration}),
               bytes_transferred = GREATEST(bytes_transferred, ${incomingBytes}),
               user_id = COALESCE(user_id, ${userId ?? null})
         WHERE client_session_id = ${sessionDto.client_session_id}
      `;

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

  async recordIpAddressClick(eventDto: IpAddressClickEventDto, userId: string) {
    try {
      const properties = {
        app_version: eventDto.app_version ?? null,
      };

      await this.prisma.$executeRaw`
        INSERT INTO product_events (
          id,
          user_id,
          event_name,
          platform,
          server_location,
          connection_status,
          ip_address_present,
          properties,
          created_at
        )
        VALUES (
          ${randomUUID()},
          ${userId},
          ${'ip_address_clicked'},
          ${eventDto.platform ?? null},
          ${eventDto.server_location ?? null},
          ${eventDto.connection_status ?? null},
          ${eventDto.ip_address_present ?? null},
          ${JSON.stringify(properties)}::jsonb,
          NOW()
        )
      `;

      SafeLogger.info(
        'Product event recorded',
        { service: 'ConnectionService', userId },
        {
          eventName: 'ip_address_clicked',
          platform: eventDto.platform,
          connectionStatus: eventDto.connection_status,
          serverLocation: eventDto.server_location,
        },
      );

      return { success: true };
    } catch (error) {
      SafeLogger.error('Error recording IP address click event', error);
      return {
        success: false,
        error: 'Failed to record event',
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

  async getConnectionStats(userId: string) {
    try {
      // `duration_seconds` can lag behind reality when the client is killed before
      // sending an END event. Fall back to the elapsed time between session_start
      // and the freshest timestamp we have (session_end > heartbeat_timestamp > updated_at).
      // Using GREATEST picks whichever value is largest, so real telemetry beats
      // the fallback once it catches up.
      const effectiveDurationSql = `GREATEST(
        COALESCE(duration_seconds, 0),
        COALESCE(
          EXTRACT(EPOCH FROM (
            COALESCE(session_end, heartbeat_timestamp, updated_at) - session_start
          ))::int,
          0
        )
      )`;

      const [aggregateRows, platformRows, dailyRows, topLocationRows] =
        await Promise.all([
          this.prisma.$queryRaw<
            Array<{
              total_sessions: number;
              total_duration_seconds: number | null;
              average_duration_seconds: number | null;
              total_bytes_transferred: bigint | null;
              max_duration_seconds: number | null;
            }>
          >`
          SELECT
            COUNT(*)::int                                               AS total_sessions,
            COALESCE(SUM(${Prisma.raw(effectiveDurationSql)}), 0)::bigint AS total_duration_seconds,
            COALESCE(AVG(${Prisma.raw(effectiveDurationSql)}), 0)::float AS average_duration_seconds,
            COALESCE(SUM(bytes_transferred), 0)::bigint                 AS total_bytes_transferred,
            COALESCE(MAX(${Prisma.raw(effectiveDurationSql)}), 0)::int  AS max_duration_seconds
          FROM connection_sessions
          WHERE user_id = ${userId}
        `,
          this.prisma.$queryRaw<
            Array<{
              platform: string | null;
              sessions: number;
              total_duration_seconds: number | null;
            }>
          >`
          SELECT
            platform,
            COUNT(*)::int                                               AS sessions,
            COALESCE(SUM(${Prisma.raw(effectiveDurationSql)}), 0)::bigint AS total_duration_seconds
          FROM connection_sessions
          WHERE user_id = ${userId}
          GROUP BY platform
        `,
          this.prisma.$queryRaw<Array<{ day: Date; count: number }>>`
          SELECT DATE(session_start) AS day, COUNT(*)::int AS count
          FROM connection_sessions
          WHERE session_start >= (CURRENT_DATE - INTERVAL '13 days')
            AND user_id = ${userId}
          GROUP BY DATE(session_start)
          ORDER BY day ASC
        `,
          this.prisma.$queryRaw<
            Array<{ server_location: string; sessions: number }>
          >`
          SELECT server_location, COUNT(*)::int AS sessions
          FROM connection_sessions
          WHERE user_id = ${userId}
            AND server_location IS NOT NULL
            AND TRIM(BOTH FROM server_location) <> ''
          GROUP BY server_location
        `,
        ]);

      const aggregate = aggregateRows[0] ?? {
        total_sessions: 0,
        total_duration_seconds: BigInt(0),
        average_duration_seconds: 0,
        total_bytes_transferred: BigInt(0),
        max_duration_seconds: 0,
      };

      const totalSessions = Number(aggregate.total_sessions ?? 0);
      const totalDurationSeconds = Number(
        aggregate.total_duration_seconds ?? 0,
      );
      const averageDurationSeconds = Math.round(
        Number(aggregate.average_duration_seconds ?? 0),
      );
      const totalBytesTransferred = Number(
        aggregate.total_bytes_transferred ?? BigInt(0),
      );
      const maxDurationSeconds = Number(aggregate.max_duration_seconds ?? 0);

      const platformBreakdown = platformRows.reduce<
        Record<string, { sessions: number; total_duration_seconds: number }>
      >((acc, row) => {
        const key = row.platform || 'unknown';
        acc[key] = {
          sessions: Number(row.sessions ?? 0),
          total_duration_seconds: Number(row.total_duration_seconds ?? 0),
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

      const byBucket = new Map<string, number>();
      for (const row of topLocationRows) {
        const bucket = normalizeServerLocationForStats(row.server_location);
        if (bucket.length === 0) {
          continue;
        }
        byBucket.set(
          bucket,
          (byBucket.get(bucket) ?? 0) + Number(row.sessions ?? 0),
        );
      }
      const topServerLocations = [...byBucket.entries()]
        .map(([displayName, count]) => ({ displayName, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map((row) => {
          const c = row.count;
          const rawPct = totalSessions > 0 ? (c / totalSessions) * 100 : 0;
          const percentage = Math.round(rawPct * 10) / 10;
          return {
            display_name: row.displayName,
            session_count: c,
            percentage,
          };
        });

      return {
        success: true,
        data: {
          total_sessions: totalSessions,
          total_duration_seconds: totalDurationSeconds,
          average_duration_seconds: averageDurationSeconds,
          total_bytes_transferred: totalBytesTransferred,
          max_duration_seconds: maxDurationSeconds,
          platform_breakdown: platformBreakdown,
          daily_connection_frequency: dailyConnectionFrequency,
          top_server_locations: topServerLocations,
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

  async getConnectionSessions(userId: string, limit = 50, offset = 0) {
    try {
      const safeLimit = Math.max(1, Math.min(limit, 200));
      const safeOffset = Math.max(0, offset);

      const sessions = await this.prisma.connectionSession.findMany({
        where: { userId },
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
          serverLocation: true,
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
          server_location: session.serverLocation ?? null,
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
