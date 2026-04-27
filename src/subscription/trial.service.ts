import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SafeLogger } from '../common/utils/logger.util';
import {
  addDaysUtc,
  isBeforeUtc,
  computeTrialDaysRemaining,
} from './trial-helpers';
import { SubscriptionStatus } from '@prisma/client';
import { getActiveSubscriptionForUser } from './subscription-lookup.util';
import { NotificationService } from '../notification/notification.service';
import { getLinkedUserClusterIds } from './linked-user-cluster.util';

const TRIAL_DURATION_DAYS = 30;
const TRIAL_TIER_NAME = 'free_trial';

export interface TrialGrantNotifyContext {
  billingChannel: 'stripe' | 'apple';
  planLabel: string;
}

export interface GrantResult {
  granted: boolean;
  reason?: string;
  userId: string;
  trialEndsAt?: Date;
}

export interface TrialStatus {
  trialActive: boolean;
  trialEndsAt: Date | null;
  daysRemaining: number;
  isPaid: boolean;
  tier: string | null;
}

@Injectable()
export class TrialService {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(NotificationService)
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Grants a trial to a user if they are eligible
   * Requirements:
   * - Feature flag must be enabled (FF_TRIALS_ENABLED)
   * - User must not already have a trial grant (one-time only)
   * - User must have an active subscription (status "active" or "trialing")
   * - Device fingerprint validation (if provided)
   */
  async grantIfEligible(
    user: { id: string; email: string; provider: string | null },
    deviceHash: string | null,
    trialNotify?: TrialGrantNotifyContext,
  ): Promise<GrantResult> {
    SafeLogger.debug(
      'TrialService.grantIfEligible called',
      { service: 'TrialService', userId: user.id },
      {
        deviceHash: deviceHash || 'null',
        FF_TRIALS_ENABLED:
          this.configService?.get<string>('FF_TRIALS_ENABLED') ||
          process.env.FF_TRIALS_ENABLED,
      },
    );

    // Check feature flag
    const trialsEnabled =
      (this.configService?.get<string>('FF_TRIALS_ENABLED') ||
        process.env.FF_TRIALS_ENABLED) === 'true';

    if (!trialsEnabled) {
      SafeLogger.debug('Trial feature flag is disabled', {
        service: 'TrialService',
      });
      return { granted: false, reason: 'feature_disabled', userId: user.id };
    }

    const now = new Date();
    const expiresAt = addDaysUtc(now, TRIAL_DURATION_DAYS);

    const result = await this.prisma.$transaction(async (tx) => {
      // Check if user already has a trial grant (one-time only)
      const existingGrant = await tx.trialGrant.findUnique({
        where: { userId: user.id },
      });

      if (existingGrant) {
        const grantStillActive = isBeforeUtc(now, existingGrant.expiresAt);
        await tx.user.update({
          where: { id: user.id },
          data: {
            trialActive: grantStillActive,
            trialStartsAt: existingGrant.grantedAt,
            trialEndsAt: existingGrant.expiresAt,
            trialTier: grantStillActive ? TRIAL_TIER_NAME : null,
          },
        });

        SafeLogger.debug('Trial blocked: User already has a trial grant', {
          service: 'TrialService',
          userId: user.id,
        });
        return {
          granted: false,
          reason: 'existing_grant',
          userId: user.id,
          trialEndsAt: existingGrant.expiresAt,
        };
      }

      // Free trial is one-time only per user (regardless of IAP or Stripe subscription)
      // REQUIRED: User must have a subscription (trialing or active) to get a trial
      // Trials are only granted when users subscribe, not on sign-up
      const activeSubscription = await tx.subscription.findFirst({
        where: {
          userId: user.id,
          status: {
            in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING], // Include both active and trialing subscriptions
          },
          OR: [
            { currentPeriodEnd: null },
            { currentPeriodEnd: { gte: new Date() } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });

      const hasSubscription = activeSubscription !== null;
      const subscriptionStatus = activeSubscription?.status;

      SafeLogger.debug(
        'Checking for subscription',
        { service: 'TrialService' },
        {
          hasSubscription,
          subscriptionStatus,
          subscriptionId: activeSubscription?.id,
        },
      );

      if (!hasSubscription) {
        SafeLogger.warn(
          'Trial blocked: User does not have a subscription (trials only granted when subscribing)',
          { service: 'TrialService' },
        );
        return {
          granted: false,
          reason: 'no_subscription',
          userId: user.id,
        };
      }

      // Device fingerprint validation (if provided)
      if (deviceHash) {
        const existingFingerprint = await tx.deviceTrialFingerprint.findUnique({
          where: { hash: deviceHash },
        });

        if (existingFingerprint && existingFingerprint.userId !== user.id) {
          SafeLogger.warn(
            'Trial blocked: Device hash already used by another user',
            { service: 'TrialService', userId: user.id },
            { existingUserId: existingFingerprint.userId },
          );
          return {
            granted: false,
            reason: 'device_hash_exists',
            userId: user.id,
          };
        }

        // Upsert device fingerprint
        await tx.deviceTrialFingerprint.upsert({
          where: { hash: deviceHash },
          update: {
            userId: user.id,
            lastSeen: now,
            platform: user.provider || undefined,
          },
          create: {
            hash: deviceHash,
            userId: user.id,
            platform: user.provider || undefined,
          },
        });
      }

      // Create trial grant
      const trial = await tx.trialGrant.create({
        data: {
          userId: user.id,
          deviceHash: deviceHash ?? 'unknown',
          expiresAt,
        },
      });

      // Update user with trial information
      await tx.user.update({
        where: { id: user.id },
        data: {
          trialActive: true,
          trialStartsAt: now,
          trialEndsAt: expiresAt,
          trialTier: TRIAL_TIER_NAME,
        },
      });

      SafeLogger.info(
        'Trial granted successfully',
        { service: 'TrialService', userId: user.id },
        { grantId: trial.id, expiresAt: expiresAt.toISOString() },
      );

      return { granted: true, userId: user.id, trialEndsAt: expiresAt };
    });

    if (result.granted && trialNotify) {
      await this.maybeNotifyTrialStartedSlack(user.id, user.email, trialNotify);
    }

    return result;
  }

  /**
   * One Slack message per linked identity cluster: if any linked user was already
   * notified for a trial start, skip (covers Apple + Google on separate user rows).
   */
  private async maybeNotifyTrialStartedSlack(
    userId: string,
    userEmail: string,
    trialNotify: TrialGrantNotifyContext,
  ): Promise<void> {
    try {
      const clusterIds = await getLinkedUserClusterIds(this.prisma, userId);
      const grants = await this.prisma.trialGrant.findMany({
        where: {
          userId: { in: clusterIds },
        },
        select: { userId: true, slackTrialStartedNotifiedAt: true },
        orderBy: { userId: 'asc' },
      });
      const alreadyNotified = grants.some(
        (g) => g.slackTrialStartedNotifiedAt !== null,
      );
      if (alreadyNotified) {
        return;
      }
      const coordinatorUserId = grants[0]?.userId ?? userId;
      const claimAt = new Date();
      const claim = await this.prisma.trialGrant.updateMany({
        where: {
          userId: coordinatorUserId,
          slackTrialStartedNotifiedAt: null,
        },
        data: { slackTrialStartedNotifiedAt: claimAt },
      });
      if (claim.count === 0) {
        return;
      }

      const sent = await this.notificationService.notifyTrialStarted({
        userId,
        userEmail,
        billingChannel: trialNotify.billingChannel,
        planLabel: trialNotify.planLabel,
        occurredAt: new Date(),
      });

      if (!sent) {
        await this.prisma.trialGrant.updateMany({
          where: {
            userId: coordinatorUserId,
            slackTrialStartedNotifiedAt: claimAt,
          },
          data: { slackTrialStartedNotifiedAt: null },
        });
      }
    } catch (err) {
      SafeLogger.warn(
        'Trial Slack notification failed (non-fatal)',
        { service: 'TrialService', userId },
        {
          error: err instanceof Error ? err.message : String(err),
        },
      );
    }
  }

  /**
   * Updates device fingerprint for trial abuse prevention
   */
  async touchDeviceFingerprint(
    userId: string,
    deviceHash: string | null,
    platform: string | null = null,
  ): Promise<void> {
    if (!deviceHash) return;

    const now = new Date();
    await this.prisma.deviceTrialFingerprint.upsert({
      where: { hash: deviceHash },
      update: {
        userId,
        lastSeen: now,
        platform: platform || undefined,
      },
      create: {
        hash: deviceHash,
        userId,
        platform: platform || undefined,
      },
    });
  }

  /**
   * Gets the current trial status for a user
   * Automatically checks if trial has expired
   */
  async status(userId: string): Promise<TrialStatus> {
    // First, expire if needed
    await this.expireIfNeeded(userId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        trialActive: true,
        trialEndsAt: true,
        trialTier: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const now = new Date();
    let trialEndsAt = user.trialEndsAt ?? null;
    let trialActive = Boolean(
      user.trialActive && trialEndsAt && isBeforeUtc(now, trialEndsAt),
    );
    let trialTier = user.trialTier ?? null;

    // Reconcile from source-of-truth trial grant when user fields drift.
    if (!trialActive && !trialEndsAt) {
      const existingGrant = await this.prisma.trialGrant.findUnique({
        where: { userId },
        select: { grantedAt: true, expiresAt: true },
      });

      if (existingGrant) {
        const grantStillActive = isBeforeUtc(now, existingGrant.expiresAt);
        trialEndsAt = existingGrant.expiresAt;
        trialActive = grantStillActive;
        trialTier = grantStillActive ? TRIAL_TIER_NAME : null;

        await this.prisma.user.update({
          where: { id: userId },
          data: {
            trialActive: grantStillActive,
            trialStartsAt: existingGrant.grantedAt,
            trialEndsAt: existingGrant.expiresAt,
            trialTier: grantStillActive ? TRIAL_TIER_NAME : null,
          },
        });
      }
    }

    const daysRemaining = trialEndsAt
      ? computeTrialDaysRemaining(trialEndsAt, now)
      : 0;

    // Check if user has active subscription (includes "active" and "trialing")
    const hasActiveSubscription = await this.hasActiveSubscription(userId);

    return {
      trialActive,
      trialEndsAt,
      daysRemaining,
      isPaid: hasActiveSubscription,
      tier: trialTier,
    };
  }

  /**
   * Checks and expires trials that have passed their end date
   * Should be called before checking trial status
   */
  async expireIfNeeded(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          trialActive: true,
          trialEndsAt: true,
        },
      });

      if (!user?.trialActive || !user.trialEndsAt) {
        return;
      }

      const now = new Date();
      if (!isBeforeUtc(now, user.trialEndsAt)) {
        // Trial has expired
        await tx.user.update({
          where: { id: userId },
          data: {
            trialActive: false,
            trialTier: null,
          },
        });

        SafeLogger.info(
          'Trial expired',
          { service: 'TrialService', userId },
          { expiredAt: now.toISOString() },
        );
      }
    });
  }

  /**
   * Checks if user has an active subscription (status "active" or "trialing")
   */
  private async hasActiveSubscription(userId: string): Promise<boolean> {
    const sub = await getActiveSubscriptionForUser(this.prisma, userId);
    return sub !== null;
  }
}
