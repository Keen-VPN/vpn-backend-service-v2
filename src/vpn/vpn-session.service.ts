import {
  BadRequestException,
  ConflictException,
  Injectable,
  Inject,
} from '@nestjs/common';
import { EventType, TerminationReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VpnSessionUpsertDto } from './dto/vpn-session-upsert.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SafeLogger } from '../common/utils/logger.util';

function parseIso(name: string, value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`Invalid ISO8601 for ${name}`);
  }
  return d;
}

@Injectable()
export class VpnSessionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Idempotent upsert per (userId, clientSessionId).
   * - lastSeenAt only moves forward (monotonic).
   * - endAt set only when client provides a valid end; never cleared back to open.
   * - Duration for analytics is derived once from (endAt - startAt) on a single row — no double counting.
   */
  async upsertSession(userId: string, dto: VpnSessionUpsertDto) {
    SafeLogger.info('VPN session upsert received', {
      service: VpnSessionService.name,
      userId,
      clientSessionId: dto.id,
      hasEndAt: dto.endAt != null && String(dto.endAt).trim() !== '',
    });

    const startAt = parseIso('startAt', dto.startAt);
    const lastSeenIn = parseIso('lastSeenAt', dto.lastSeenAt);
    const endIn =
      dto.endAt != null && String(dto.endAt).trim() !== ''
        ? parseIso('endAt', dto.endAt)
        : null;

    if (lastSeenIn.getTime() < startAt.getTime()) {
      throw new BadRequestException('lastSeenAt must be on or after startAt');
    }
    if (endIn && endIn.getTime() < startAt.getTime()) {
      throw new BadRequestException('endAt must be on or after startAt');
    }

    return this.prisma.$transaction(async (tx) => {
      const byClientId = await tx.connectionSession.findUnique({
        where: { clientSessionId: dto.id },
      });

      if (byClientId && byClientId.userId && byClientId.userId !== userId) {
        throw new ConflictException(
          'clientSessionId is already associated with a different user',
        );
      }

      const existingForUser =
        byClientId &&
        (byClientId.userId === userId || byClientId.userId == null)
          ? byClientId
          : null;

      const mergedLastSeenAt = existingForUser
        ? new Date(
            Math.max(
              existingForUser.heartbeatTimestamp?.getTime() ?? 0,
              lastSeenIn.getTime(),
            ),
          )
        : lastSeenIn;

      let sessionEnd = existingForUser?.sessionEnd ?? null;
      let disconnectReason = existingForUser?.disconnectReason ?? null;
      let eventType: EventType =
        existingForUser?.eventType ?? EventType.SESSION_START;

      if (endIn != null) {
        // Close once: don't widen duration on replays.
        if (sessionEnd == null) {
          sessionEnd = endIn;
        }
        if (dto.disconnectReason != null && dto.disconnectReason !== '') {
          disconnectReason = dto.disconnectReason;
        }
        eventType = EventType.SESSION_END;
      } else if (
        dto.disconnectReason != null &&
        dto.disconnectReason !== '' &&
        sessionEnd != null
      ) {
        disconnectReason = dto.disconnectReason;
      } else if (!existingForUser) {
        eventType = EventType.SESSION_START;
      } else {
        eventType =
          existingForUser.eventType === EventType.SESSION_END
            ? EventType.SESSION_END
            : EventType.HEARTBEAT;
      }

      const row = await tx.connectionSession.upsert({
        where: { clientSessionId: dto.id },
        create: {
          clientSessionId: dto.id,
          userId,
          sessionStart: startAt,
          sessionEnd,
          durationSeconds:
            sessionEnd != null
              ? Math.max(
                  0,
                  Math.floor((sessionEnd.getTime() - startAt.getTime()) / 1000),
                )
              : 0,
          platform: 'ios_extension',
          appVersion: null,
          bytesTransferred: BigInt(0),
          subscriptionTier: null,
          terminationReason:
            sessionEnd != null
              ? TerminationReason.CONNECTION_LOST
              : TerminationReason.USER_TERMINATION,
          disconnectReason,
          eventType,
          protocol: 'wireguard',
          networkType: null,
          heartbeatTimestamp: mergedLastSeenAt,
        },
        update: {
          userId: userId,
          heartbeatTimestamp: mergedLastSeenAt,
          sessionEnd,
          disconnectReason,
          eventType,
          terminationReason:
            sessionEnd != null ? TerminationReason.CONNECTION_LOST : undefined,
        },
      });

      if (sessionEnd != null) {
        const derivedDuration = Math.max(
          0,
          Math.floor(
            (sessionEnd.getTime() - row.sessionStart.getTime()) / 1000,
          ),
        );
        await tx.$executeRaw`
          UPDATE connection_sessions
             SET duration_seconds = GREATEST(duration_seconds, ${derivedDuration})
           WHERE client_session_id = ${dto.id}
        `;
      }

      SafeLogger.info('VPN session upsert persisted', {
        service: VpnSessionService.name,
        userId,
        clientSessionId: dto.id,
        sessionStart: row.sessionStart.toISOString(),
        sessionEnd: row.sessionEnd?.toISOString() ?? null,
        heartbeatTimestamp: row.heartbeatTimestamp?.toISOString() ?? null,
        eventType: row.eventType,
      });

      return {
        success: true,
        data: {
          id: row.id,
          clientSessionId: row.clientSessionId,
          userId: row.userId,
          sessionStart: row.sessionStart.toISOString(),
          sessionEnd: row.sessionEnd?.toISOString() ?? null,
          heartbeatTimestamp: row.heartbeatTimestamp?.toISOString() ?? null,
          disconnectReason: row.disconnectReason ?? null,
          eventType: row.eventType,
          terminationReason: row.terminationReason,
          updatedAt: row.updatedAt.toISOString(),
        },
      };
    });
  }

  /**
   * Close still-open rows whose lastSeenAt is older than the stale threshold.
   * Uses last_seen_at as the inferred end instant (conservative, heartbeat-based).
   */
  async closeStaleOpenSessions(asOf: Date = new Date()): Promise<number> {
    const minutes = Number(process.env.VPN_SESSION_STALE_MINUTES ?? '5');
    const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 5;
    const cutoff = new Date(asOf.getTime() - safeMinutes * 60 * 1000);

    const result = await this.prisma.$executeRaw`
      UPDATE "connection_sessions"
      SET
        "session_end" = "heartbeat_timestamp",
        "event_type" = 'session_end'::event_type,
        "termination_reason" = 'connection_lost'::termination_reason,
        "disconnect_reason" = COALESCE("disconnect_reason", 'server_inferred_last_seen_timeout')
      WHERE "session_end" IS NULL
        AND "heartbeat_timestamp" IS NOT NULL
        AND "heartbeat_timestamp" < ${cutoff}
    `;
    const n = typeof result === 'number' ? result : 0;
    if (n > 0) {
      SafeLogger.info(
        `Closed ${n} stale open connection_sessions`,
        { service: VpnSessionService.name },
        { cutoff: cutoff.toISOString() },
      );
    }
    return n;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduledStaleClose(): Promise<void> {
    try {
      await this.closeStaleOpenSessions();
    } catch (e) {
      SafeLogger.error('scheduledStaleClose failed', e, {
        service: VpnSessionService.name,
      });
    }
  }
}
