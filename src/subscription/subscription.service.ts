import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SafeLogger } from '../common/utils/logger.util';
import { TrialService } from './trial.service';
import { PlansConfigService } from './config/plans.config';
import { serializeTrialStatus } from './trial.util';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class SubscriptionService {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(TrialService) private trialService: TrialService,
    @Inject(PlansConfigService) private plansConfigService: PlansConfigService,
  ) {}

  getPlans() {
    try {
      const plans = this.plansConfigService.getSubscriptionPlans();
      return {
        success: true,
        data: { plans },
      };
    } catch (error) {
      SafeLogger.error(
        'Failed to get subscription plans',
        error instanceof Error ? error : new Error(String(error)),
      );
      return {
        success: false,
        error: 'Failed to get subscription plans',
      };
    }
  }

  getPlanById(planId: string) {
    try {
      if (!planId) {
        return {
          success: false,
          error: 'Plan ID is required',
        };
      }

      const plan = this.plansConfigService.getPlanById(planId);
      if (!plan) {
        return {
          success: false,
          error: 'Plan not found',
        };
      }

      return {
        success: true,
        data: { plan },
      };
    } catch (error) {
      SafeLogger.error(
        `Failed to get plan details for ${planId}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      return {
        success: false,
        error: 'Failed to get plan details',
      };
    }
  }

  async getStatusWithSession(sessionToken: string) {
    try {
      // Verify session token
      const secret =
        this.configService?.get<string>('JWT_SECRET') ||
        process.env.JWT_SECRET ||
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

      // Get active subscription (includes both "active" and "trialing" status)
      const activeSubscription = await this.prisma.subscription.findFirst({
        where: {
          userId: user.id,
          status: {
            in: ['active', 'trialing'], // Include both active and trialing subscriptions
          },
          OR: [
            { currentPeriodEnd: null },
            { currentPeriodEnd: { gte: new Date() } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });

      // Check if subscription is active (DB subscription or linked Apple IAP)
      let hasActiveSubscription =
        activeSubscription !== null &&
        (activeSubscription.status === 'active' ||
          activeSubscription.status === 'trialing');

      if (!hasActiveSubscription) {
        const validIAP = await this.prisma.appleIAPPurchase.findFirst({
          where: {
            linkedUserId: user.id,
            OR: [{ expiresDate: null }, { expiresDate: { gte: new Date() } }],
          },
        });
        if (validIAP) {
          hasActiveSubscription = true;
          SafeLogger.info(
            'Active access from linked Apple IAP',
            { service: 'SubscriptionService', userId: user.id },
            { productId: validIAP.productId },
          );
        }
      }

      // Get trial status using TrialService (automatically expires if needed)
      await this.trialService.expireIfNeeded(user.id);
      const trialStatus = await this.trialService.status(user.id);

      // Serialize trial status for API response
      const trial = serializeTrialStatus(trialStatus);

      SafeLogger.info(
        'Subscription status checked',
        { service: 'SubscriptionService', userId: user.id },
        {
          hasActiveSubscription: !!activeSubscription,
          status: activeSubscription?.status || 'none',
        },
      );

      return {
        success: true,
        hasActiveSubscription,
        subscription: activeSubscription
          ? {
              status: activeSubscription.status,
              plan: activeSubscription.planName || '',
              endDate: activeSubscription.currentPeriodEnd?.toISOString() || '',
              customerId:
                activeSubscription.stripeCustomerId ||
                activeSubscription.appleTransactionId ||
                '',
              cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd || false,
              subscriptionType: activeSubscription.subscriptionType,
            }
          : {
              status: 'inactive',
              plan: '',
              endDate: '',
              customerId: '',
              cancelAtPeriodEnd: false,
              subscriptionType: 'stripe',
            },
        trial,
      };
    } catch (error) {
      SafeLogger.error(
        'Subscription status check failed',
        error instanceof Error ? error : new Error(String(error)),
        { service: 'SubscriptionService' },
      );
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

    // Find active subscription (includes both "active" and "trialing" status)
    const activeSubscription = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: {
          in: ['active', 'trialing'], // Include both active and trialing subscriptions
        },
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

    SafeLogger.info(
      'Subscription cancellation requested',
      { service: 'SubscriptionService', userId },
      { subscriptionId: activeSubscription.id },
    );

    return {
      success: true,
      message:
        'Subscription will be cancelled at the end of the current period',
      error: null,
    };
  }
}
