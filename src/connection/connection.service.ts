import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SafeLogger } from '../common/utils/logger.util';
import { ConnectionSessionDto } from '../common/dto/connection-session.dto';

@Injectable()
export class ConnectionService {
  constructor(private prisma: PrismaService) {}

  async recordSession(userId: string, sessionDto: ConnectionSessionDto) {
    try {
      // Find user by email to get userId if not provided
      let targetUserId = userId;
      if (!targetUserId) {
        const user = await this.prisma.user.findUnique({
          where: { email: sessionDto.email },
        });
        if (!user) {
          throw new Error('User not found');
        }
        targetUserId = user.id;
      }

      const sessionStart = new Date(sessionDto.session_start);
      const sessionEnd = sessionDto.session_end
        ? new Date(sessionDto.session_end)
        : null;

      // Store connection session in database
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
          terminationReason: 'USER_TERMINATION' as const, // Default, can be updated if needed
          eventType: 'SESSION_START' as const, // Default, can be updated if needed
        },
      });

      SafeLogger.info('Connection session recorded', {
        userId: userId,
        email: '[REDACTED]',
        duration: sessionDto.duration_seconds,
        platform: sessionDto.platform,
      });

      return {
        success: true,
      };
    } catch (error) {
      SafeLogger.error('Error recording connection session', error);
      return {
        success: false,
        error: error.message || 'Failed to record session',
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

      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
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
      return {
        success: false,
        data: [],
        error: error.message || 'Failed to get sessions',
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
        totalSessions > 0 ? Math.floor(totalDurationSeconds / totalSessions) : 0;

      // Calculate platform breakdown
      const platformBreakdown: Record<string, { sessions: number; total_duration: number }> = {};
      sessions.forEach((session) => {
        if (!platformBreakdown[session.platform]) {
          platformBreakdown[session.platform] = {
            sessions: 0,
            total_duration: 0,
          };
        }
        platformBreakdown[session.platform].sessions += 1;
        platformBreakdown[session.platform].total_duration += session.durationSeconds;
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
      return {
        success: false,
        data: null,
        error: error.message || 'Failed to get stats',
      };
    }
  }
}

