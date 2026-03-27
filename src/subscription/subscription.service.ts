import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SafeLogger } from '../common/utils/logger.util';
import { TrialService } from './trial.service';
import { PlansConfigService } from './config/plans.config';
import { serializeTrialStatus } from './trial.util';
import * as jwt from 'jsonwebtoken';
import { SubscriptionStatus } from '@prisma/client';
import { getActiveSubscriptionForUser } from './subscription-lookup.util';

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
      const activeSubscription = await getActiveSubscriptionForUser(
        this.prisma,
        user.id,
      );

      // Check if subscription is active (DB subscription or linked Apple IAP)
      let hasActiveSubscription =
        activeSubscription !== null &&
        (activeSubscription.status === SubscriptionStatus.ACTIVE ||
          activeSubscription.status === SubscriptionStatus.TRIALING);

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
          status: activeSubscription?.status || 'NONE',
        },
      );

      return {
        success: true,
        hasActiveSubscription,
        subscription: activeSubscription
          ? {
              status: activeSubscription.status,
              plan: this.resolveApplePlanName(activeSubscription),
              endDate: activeSubscription.currentPeriodEnd?.toISOString() || '',
              customerId:
                activeSubscription.stripeCustomerId ||
                activeSubscription.appleTransactionId ||
                '',
              cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd || false,
              subscriptionType: activeSubscription.subscriptionType,
            }
          : {
              status: SubscriptionStatus.INACTIVE,
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
    const activeSubscription = await getActiveSubscriptionForUser(
      this.prisma,
      user.id,
    );

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

  async getHistory(
    userId: string,
    filters: {
      page?: string | number;
      limit?: string | number;
      provider?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ) {
    const page = Math.max(1, Number(filters.page || 1));
    const limit = Math.min(100, Math.max(1, Number(filters.limit || 25)));
    const skip = (page - 1) * limit;

    const where: {
      userId: string;
      subscriptionType?: string;
      createdAt?: { gte?: Date; lte?: Date };
    } = { userId };

    if (filters.provider === 'stripe' || filters.provider === 'apple_iap') {
      where.subscriptionType = filters.provider;
    }

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) {
        const from = new Date(filters.dateFrom);
        if (isNaN(from.getTime())) {
          throw new BadRequestException('Invalid dateFrom');
        }
        where.createdAt.gte = from;
      }
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        if (isNaN(to.getTime())) {
          throw new BadRequestException('Invalid dateTo');
        }
        where.createdAt.lte = to;
      }
    }

    const [total, subscriptions] = await Promise.all([
      this.prisma.subscription.count({ where }),
      this.prisma.subscription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      success: true,
      data: {
        events: subscriptions.map((sub) => ({
          id: sub.id,
          eventDate: sub.createdAt.toISOString(),
          eventType: this.resolveEventType(sub.status),
          provider:
            sub.subscriptionType === 'apple_iap' ? 'apple_iap' : 'stripe',
          planName: this.resolveApplePlanName(sub) || 'Premium VPN',
          amount: sub.priceAmount ? Number(sub.priceAmount) : undefined,
          currency: sub.priceCurrency || 'USD',
          status: sub.status.toLowerCase(),
          periodStart: sub.currentPeriodStart?.toISOString(),
          periodEnd: sub.currentPeriodEnd?.toISOString(),
          description: this.describeSubscriptionEvent(sub.status),
        })),
        pagination: {
          page,
          limit,
          total,
          hasNextPage: skip + subscriptions.length < total,
          hasPreviousPage: page > 1,
        },
      },
    };
  }

  async getHistoryWithSession(
    sessionToken: string,
    filters: {
      page?: string | number;
      limit?: string | number;
      provider?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ) {
    let userId: string;

    try {
      const secret =
        this.configService?.get<string>('JWT_SECRET') ||
        process.env.JWT_SECRET ||
        'default-secret-change-in-production';
      const decoded = jwt.verify(sessionToken, secret) as {
        userId: string;
        type: string;
      };

      if (decoded.type !== 'session') {
        throw new UnauthorizedException('Invalid token type');
      }
      userId = decoded.userId;
    } catch (error) {
      SafeLogger.error(
        'Subscription history session validation failed',
        error instanceof Error ? error : new Error(String(error)),
        { service: 'SubscriptionService' },
      );
      throw new UnauthorizedException('Invalid session token');
    }

    return this.getHistory(userId, filters);
  }

  async getHistoryEventDetails(userId: string, eventId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: eventId, userId },
    });

    if (!sub) {
      throw new NotFoundException('Subscription history event not found');
    }

    return {
      success: true,
      data: {
        event: {
          id: sub.id,
          eventDate: sub.createdAt.toISOString(),
          eventType: this.resolveEventType(sub.status),
          provider:
            sub.subscriptionType === 'apple_iap' ? 'apple_iap' : 'stripe',
          planName: this.resolveApplePlanName(sub) || 'Premium VPN',
          amount: sub.priceAmount ? Number(sub.priceAmount) : undefined,
          currency: sub.priceCurrency || 'USD',
          status: sub.status.toLowerCase(),
          periodStart: sub.currentPeriodStart?.toISOString(),
          periodEnd: sub.currentPeriodEnd?.toISOString(),
          description: this.describeSubscriptionEvent(sub.status),
          providerActions: {
            appStoreManage: sub.subscriptionType === 'apple_iap',
            manageSubscription:
              sub.subscriptionType === 'stripe'
                ? '/account/payments'
                : undefined,
          },
          additionalDetails: {
            stripeSubscriptionId: sub.stripeSubscriptionId || undefined,
            stripeCustomerId: sub.stripeCustomerId || undefined,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
            currentPeriodStart: sub.currentPeriodStart?.toISOString(),
            currentPeriodEnd: sub.currentPeriodEnd?.toISOString(),
            transactionId: sub.appleTransactionId || undefined,
            originalTransactionId: sub.appleOriginalTransactionId || undefined,
            productId: sub.appleProductId || undefined,
            environment: sub.appleEnvironment || undefined,
          },
        },
      },
    };
  }

  /**
   * Derives the correct plan name from appleProductId when the stored planName
   * is generic (e.g. "Premium VPN" without Monthly/Annual qualifier).
   * This fixes existing DB records without requiring a manual SQL migration.
   */
  private resolveApplePlanName(subscription: {
    planName: string | null;
    appleProductId?: string | null;
  }): string {
    const planName = subscription.planName || '';
    const productId = subscription.appleProductId || '';

    // If planName already contains a qualifier, use it as-is
    if (
      planName.toLowerCase().includes('monthly') ||
      planName.toLowerCase().includes('annual') ||
      planName.toLowerCase().includes('yearly')
    ) {
      return planName;
    }

    // Derive from appleProductId for Apple IAP subscriptions with generic planName
    if (productId.includes('yearly') || productId.includes('annual')) {
      return 'Premium VPN - Annual';
    }
    if (productId.includes('monthly')) {
      return 'Premium VPN - Monthly';
    }

    return planName;
  }

  private resolveEventType(status: SubscriptionStatus) {
    if (status === SubscriptionStatus.CANCELLED) return 'cancellation';
    if (status === SubscriptionStatus.ACTIVE) return 'purchase';
    if (status === SubscriptionStatus.TRIALING) return 'trial_start';
    // EXPIRED is not trial-specific; map to cancellation to avoid
    // mislabeling expired paid subscriptions as "trial ended".
    if (status === SubscriptionStatus.EXPIRED) return 'cancellation';
    return 'renewal';
  }

  private describeSubscriptionEvent(status: SubscriptionStatus): string {
    if (status === SubscriptionStatus.CANCELLED) {
      return 'Subscription cancelled';
    }
    if (status === SubscriptionStatus.ACTIVE) {
      return 'Subscription active';
    }
    if (status === SubscriptionStatus.TRIALING) {
      return 'Trial active';
    }
    if (status === SubscriptionStatus.EXPIRED) {
      return 'Subscription expired';
    }
    return 'Subscription updated';
  }
}
