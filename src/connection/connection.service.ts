import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SafeLogger } from '../common/utils/logger.util';
import { ConnectionSessionDto } from '../common/dto/connection-session.dto';

@Injectable()
export class ConnectionService {
  constructor(private prisma: PrismaService) {}

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
}
