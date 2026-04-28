import { Injectable, Inject } from '@nestjs/common';
import { SubscriptionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';

@Injectable()
export class PaidConversionSlackService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationService)
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Stripe: notify when subscription enters paid `active` (not `trialing`).
   * Deduped per Stripe subscription id so webhooks cannot double-notify.
   */
  async maybeNotifyStripePaidConversion(params: {
    user: { id: string; email: string };
    stripeSubscriptionId: string;
    previousDbStatus: SubscriptionStatus | null;
    stripeRawStatus: string;
    billingPeriod: string | null;
  }): Promise<void> {
    if (params.stripeRawStatus !== 'active') {
      return;
    }

    const dedupeKey = `stripe:${params.stripeSubscriptionId}:paid`;
    const notificationId = await this.tryAcquireDedupeKey(
      dedupeKey,
      params.user.id,
    );
    if (!notificationId) {
      return;
    }

    const conversionType =
      params.previousDbStatus === SubscriptionStatus.TRIALING
        ? 'trial_to_paid'
        : 'new_paid';

    const planDisplay = this.planDisplayFromBilling(params.billingPeriod);

    const sent = await this.notificationService.notifyPaidConversion({
      userId: params.user.id,
      userEmail: params.user.email,
      paymentSource: 'stripe',
      planDisplay,
      conversionType,
      occurredAt: new Date(),
    });

    if (!sent) {
      await this.prisma.paidConversionSlackNotification.delete({
        where: { id: notificationId },
      });
    }
  }

  /**
   * Apple IAP: notify once per original transaction id when subscription is paid/active.
   * Trial → Paid when the user has a trial grant record (VPN trial program).
   */
  async maybeNotifyApplePaidConversion(params: {
    userId: string;
    userEmail: string;
    originalTransactionId: string;
    billingPeriod: string | null;
  }): Promise<void> {
    const now = new Date();

    const dedupeKey = `apple:${params.originalTransactionId}:paid`;
    const notificationId = await this.tryAcquireDedupeKey(
      dedupeKey,
      params.userId,
    );
    if (!notificationId) {
      return;
    }

    const trialGrant = await this.prisma.trialGrant.findUnique({
      where: { userId: params.userId },
    });
    // If the user is currently in an active trial window, do not send any "paid conversion"
    // notification. This prevents false "trial → paid" notifications during Apple trial flows.
    if (trialGrant && trialGrant.expiresAt && trialGrant.expiresAt > now) {
      await this.prisma.paidConversionSlackNotification.delete({
        where: { id: notificationId },
      });
      return;
    }

    const conversionType = trialGrant ? 'trial_to_paid' : 'new_paid';

    const planDisplay = this.planDisplayFromBilling(params.billingPeriod);

    const sent = await this.notificationService.notifyPaidConversion({
      userId: params.userId,
      userEmail: params.userEmail,
      paymentSource: 'apple',
      planDisplay,
      conversionType,
      occurredAt: new Date(),
    });

    if (!sent) {
      await this.prisma.paidConversionSlackNotification.delete({
        where: { id: notificationId },
      });
    }
  }

  private async tryAcquireDedupeKey(
    dedupeKey: string,
    userId: string,
  ): Promise<string | null> {
    try {
      const row = await this.prisma.paidConversionSlackNotification.create({
        data: { dedupeKey, userId },
      });
      return row.id;
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return null;
      }
      throw error;
    }
  }

  private planDisplayFromBilling(billingPeriod: string | null): string {
    if (billingPeriod === 'month') {
      return 'Monthly';
    }
    if (billingPeriod === 'year') {
      return 'Annual';
    }
    return 'Paid';
  }
}
