import { Injectable, Inject } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
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
    const already =
      await this.prisma.paidConversionSlackNotification.findUnique({
        where: { dedupeKey },
      });
    if (already) {
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

    if (sent) {
      await this.prisma.paidConversionSlackNotification.create({
        data: { dedupeKey, userId: params.user.id },
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
    const dedupeKey = `apple:${params.originalTransactionId}:paid`;
    const already =
      await this.prisma.paidConversionSlackNotification.findUnique({
        where: { dedupeKey },
      });
    if (already) {
      return;
    }

    const trialGrant = await this.prisma.trialGrant.findUnique({
      where: { userId: params.userId },
    });
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

    if (sent) {
      await this.prisma.paidConversionSlackNotification.create({
        data: { dedupeKey, userId: params.userId },
      });
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
