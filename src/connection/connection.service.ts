import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SafeLogger } from '../common/utils/logger.util';
import { ConnectionSessionDto } from '../common/dto/connection-session.dto';
import { AnonymousSessionDto } from '../common/dto/anonymous-session.dto';
import { CryptoService } from '../crypto/crypto.service';

@Injectable()
export class ConnectionService {
  // System user ID for anonymous sessions
  private readonly ANONYMOUS_USER_ID = '00000000-0000-0000-0000-000000000000';

  constructor(
    private prisma: PrismaService,
    private cryptoService: CryptoService,
  ) {}

  async recordSession(userId: string, sessionDto: ConnectionSessionDto) {
    try {
      // Anonymized request: client omitted email (identifies only via Bearer token).
      // Store under anonymous user so no userId link is persisted (true anonymization).
      const isAnonymized =
        sessionDto.email === undefined ||
        sessionDto.email === null ||
        String(sessionDto.email).trim() === '';

      let targetUserId: string;
      let isAnonymizedFlag = false;

      if (isAnonymized) {
        await this.ensureAnonymousUserExists();
        targetUserId = this.ANONYMOUS_USER_ID;
        isAnonymizedFlag = true;
      } else {
        // Identified request: resolve user from provided userId or email
        targetUserId = userId;
        if (!targetUserId) {
          const user = await this.prisma.user.findUnique({
            where: { email: sessionDto.email },
          });
          if (!user) {
            throw new Error('User not found');
          }
          targetUserId = user.id;
        }
      }

      const sessionStart = new Date(sessionDto.session_start);
      const sessionEnd = sessionDto.session_end
        ? new Date(sessionDto.session_end)
        : null;

      // Store connection session in database (no user link when anonymized)
      await this.prisma.connectionSession.create({
        data: {
          userId: targetUserId,
          sessionStart,
          sessionEnd,
          durationSeconds: sessionDto.duration_seconds || 0,
          platform: sessionDto.platform,
          appVersion: sessionDto.app_version,
          serverLocation: sessionDto.server_location,
          serverAddress: sessionDto.server_address,
          subscriptionTier: sessionDto.subscription_tier,
          bytesTransferred: sessionDto.bytes_transferred
            ? BigInt(sessionDto.bytes_transferred)
            : BigInt(0),
          isAnonymized: isAnonymizedFlag,
          terminationReason: 'USER_TERMINATION' as const,
          eventType: 'SESSION_START' as const,
        },
      });

      SafeLogger.info('Connection session recorded', {
        anonymized: isAnonymizedFlag,
        duration: sessionDto.duration_seconds,
        platform: sessionDto.platform,
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

  async getSessions(email: string, limit: number, offset: number) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        return {
          success: false,
          data: [],
          error: 'User not found',
        };
      }

      // Query connection sessions
      const sessions = await this.prisma.connectionSession.findMany({
        where: { userId: user.id },
        orderBy: { sessionStart: 'desc' },
        take: limit,
        skip: offset,
      });

      const data = sessions.map((session) => ({
        id: session.id,
        session_start: session.sessionStart.toISOString(),
        session_end: session.sessionEnd?.toISOString() || null,
        duration_seconds: session.durationSeconds,
        platform: session.platform,
        app_version: session.appVersion || null,
      }));

      return {
        success: true,
        data,
      };
    } catch (error) {
      SafeLogger.error('Error getting connection sessions', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to get sessions';
      return {
        success: false,
        data: [],
        error: errorMessage,
      };
    }
  }

  async getStats(email: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        return {
          success: false,
          data: null,
          error: 'User not found',
        };
      }

      // Calculate stats from connection sessions
      const sessions = await this.prisma.connectionSession.findMany({
        where: { userId: user.id },
      });

      const totalSessions = sessions.length;
      const totalDurationSeconds = sessions.reduce(
        (sum, s) => sum + s.durationSeconds,
        0,
      );
      const averageDurationSeconds =
        totalSessions > 0
          ? Math.floor(totalDurationSeconds / totalSessions)
          : 0;

      // Calculate platform breakdown
      const platformBreakdown: Record<
        string,
        { sessions: number; total_duration: number }
      > = {};
      sessions.forEach((session) => {
        if (!platformBreakdown[session.platform]) {
          platformBreakdown[session.platform] = {
            sessions: 0,
            total_duration: 0,
          };
        }
        platformBreakdown[session.platform].sessions += 1;
        platformBreakdown[session.platform].total_duration +=
          session.durationSeconds;
      });

      return {
        success: true,
        data: {
          total_sessions: totalSessions,
          total_duration_seconds: totalDurationSeconds,
          average_duration_seconds: averageDurationSeconds,
          platform_breakdown: platformBreakdown,
        },
      };
    } catch (error) {
      SafeLogger.error('Error getting connection stats', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to get stats';
      return {
        success: false,
        data: null,
        error: errorMessage,
      };
    }
  }

  /**
   * Record an anonymous connection session using a blind-signed token
   * @param sessionDto Anonymous session data with token and signature
   * @returns Success response
   */
  async recordAnonymousSession(sessionDto: AnonymousSessionDto) {
    try {
      // Verify the blind-signed token
      const isValid = this.cryptoService.verifyBlindSignedToken(
        sessionDto.token,
        sessionDto.signature,
      );

      if (!isValid) {
        throw new BadRequestException('Invalid blind-signed token');
      }

      // Ensure anonymous user exists (create if not)
      await this.ensureAnonymousUserExists();

      const sessionStart = new Date(sessionDto.session_start);
      const sessionEnd = sessionDto.session_end
        ? new Date(sessionDto.session_end)
        : null;

      // Store connection session with isAnonymized = true
      await this.prisma.connectionSession.create({
        data: {
          userId: this.ANONYMOUS_USER_ID,
          sessionStart,
          sessionEnd,
          durationSeconds: sessionDto.duration_seconds || 0,
          platform: sessionDto.platform,
          appVersion: sessionDto.app_version,
          serverLocation: sessionDto.server_location,
          serverAddress: sessionDto.server_address,
          subscriptionTier: sessionDto.subscription_tier,
          bytesTransferred: sessionDto.bytes_transferred
            ? BigInt(sessionDto.bytes_transferred)
            : BigInt(0),
          isAnonymized: true, // Mark as anonymized
          terminationReason: 'USER_TERMINATION' as const,
          eventType: 'SESSION_START' as const,
        },
      });

      SafeLogger.info('Anonymous connection session recorded', {
        duration: sessionDto.duration_seconds,
        platform: sessionDto.platform,
        serverLocation: sessionDto.server_location,
      });

      return {
        success: true,
      };
    } catch (error) {
      SafeLogger.error('Error recording anonymous connection session', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to record anonymous session';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Ensure the anonymous system user exists
   * Creates it if it doesn't exist
   */
  private async ensureAnonymousUserExists() {
    const existingUser = await this.prisma.user.findUnique({
      where: { id: this.ANONYMOUS_USER_ID },
    });

    if (!existingUser) {
      await this.prisma.user.create({
        data: {
          id: this.ANONYMOUS_USER_ID,
          email: 'anonymous@system.keenvpn',
          displayName: 'Anonymous User',
          firebaseUid: 'anonymous-system-user',
          provider: 'system',
          emailVerified: false,
        },
      });

      SafeLogger.info('Created anonymous system user');
    }
  }
}
