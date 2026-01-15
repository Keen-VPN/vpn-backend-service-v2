import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SafeLogger } from '../common/utils/logger.util';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class SubscriptionService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async getStatusWithSession(sessionToken: string) {
    try {
      // Verify session token
      const secret =
        this.configService.get<string>('JWT_SECRET') ||
        'default-secret-change-in-production';
      const decoded = jwt.verify(sessionToken, secret) as {
        userId: string;
        email: string;
        type: string;
      };

      if (decoded.type !== 'session') {
        throw new UnauthorizedException('Invalid token type');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Get active subscription
      const activeSubscription = await this.prisma.subscription.findFirst({
        where: {
          userId: user.id,
          status: 'active',
          OR: [
            { currentPeriodEnd: null },
            { currentPeriodEnd: { gte: new Date() } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });

      // Check for trial status
      const trialActive = user.trialActive || false;
      const trialEndsAt = user.trialEndsAt;
      let daysRemaining = 0;
      if (trialEndsAt && trialEndsAt > new Date()) {
        const diff = trialEndsAt.getTime() - new Date().getTime();
        daysRemaining = Math.ceil(diff / (1000 * 60 * 60 * 24));
      }

      const trial = {
        trialActive,
        trialEndsAt: trialEndsAt?.toISOString() || null,
        daysRemaining,
        isPaid: !!activeSubscription,
        tier: user.trialTier || null,
      };

      SafeLogger.info('Subscription status checked', {
        userId: user.id,
        email: '[REDACTED]',
        hasActiveSubscription: !!activeSubscription,
      });

      return {
        success: true,
        hasActiveSubscription: !!activeSubscription,
        subscription: activeSubscription
          ? {
              status: activeSubscription.status,
              endDate: activeSubscription.currentPeriodEnd?.toISOString() || null,
              cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd || false,
              subscriptionType: activeSubscription.subscriptionType,
            }
          : null,
        trial,
      };
    } catch (error) {
      SafeLogger.error('Subscription status check failed', error);
      throw new UnauthorizedException('Invalid session token');
    }
  }

  async cancel(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Find active subscription
    const activeSubscription = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: 'active',
        OR: [
          { currentPeriodEnd: null },
          { currentPeriodEnd: { gte: new Date() } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeSubscription) {
      return {
        success: false,
        message: 'No active subscription found',
        error: 'No active subscription to cancel',
      };
    }

    // Update subscription to cancel at period end
    await this.prisma.subscription.update({
      where: { id: activeSubscription.id },
      data: {
        cancelAtPeriodEnd: true,
      },
    });

    SafeLogger.info('Subscription cancellation requested', {
      userId,
      subscriptionId: activeSubscription.id,
    });

    return {
      success: true,
      message: 'Subscription will be cancelled at the end of the current period',
      error: null,
    };
  }
}

