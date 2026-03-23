import {
  Injectable,
  Inject,
  forwardRef,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionStatus } from '@prisma/client';
import { SafeLogger } from '../../common/utils/logger.util';
import { TrialService } from '../../subscription/trial.service';

@Injectable()
export class StripeService {
  private stripe: Stripe;

  constructor(
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(forwardRef(() => TrialService))
    private trialService: TrialService,
  ) {
    const secretKey =
      this.configService?.get<string>('STRIPE_SECRET_KEY') ||
      process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is required');
    }
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2026-02-25.clover',
    });
  }

  async getCustomerIdByUserId(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });
    return user?.stripeCustomerId || null;
  }

  async createCheckoutSession(
    userId: string,
    planId: string,
    successUrl: string,
    cancelUrl: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Server-side guard: never allow checkout when an active subscription exists.
    const existingSubscription = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
        },
        OR: [
          { currentPeriodEnd: null },
          { currentPeriodEnd: { gte: new Date() } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingSubscription) {
      throw new ConflictException(
        'User already has an active subscription. Checkout is not allowed.',
      );
    }

    // Get or create Stripe customer
    let customerId = user.stripeCustomerId;

    const ensureCustomer = async (): Promise<string> => {
      if (customerId) {
        return customerId;
      }
      const customer = await this.stripe.customers.create({
        email: user.email,
        metadata: { userId },
      });
      await this.prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customer.id },
      });
      return customer.id;
    };

    if (!customerId) {
      customerId = await ensureCustomer();
    }

    // Get price ID for plan
    const priceId = this.getPriceIdForPlan(planId);
    if (!priceId) {
      throw new Error(`Price ID not found for plan: ${planId}`);
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await this.stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          userId,
          planId,
        },
      });
    } catch (err: unknown) {
      const stripeError = err as { code?: string; message?: string };
      const isNoSuchCustomer =
        stripeError?.code === 'resource_missing' ||
        (typeof stripeError?.message === 'string' &&
          stripeError.message.toLowerCase().includes('no such customer'));

      if (isNoSuchCustomer && user.stripeCustomerId) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { stripeCustomerId: null },
        });
        customerId = await ensureCustomer();
        session = await this.stripe.checkout.sessions.create({
          customer: customerId,
          mode: 'subscription',
          payment_method_types: ['card'],
          line_items: [
            {
              price: priceId,
              quantity: 1,
            },
          ],
          success_url: successUrl,
          cancel_url: cancelUrl,
          metadata: {
            userId,
            planId,
          },
        });
      } else {
        throw err;
      }
    }

    SafeLogger.info('Stripe checkout session created', {
      userId,
      sessionId: session.id,
    });

    return session;
  }

  async createCustomerPortalSession(
    customerId: string,
    returnUrl: string,
  ): Promise<Stripe.BillingPortal.Session> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return session;
  }

  async handleWebhookEvent(event: Stripe.Event) {
    SafeLogger.info('Processing Stripe webhook', {
      eventType: event.type,
      eventId: event.id,
    });

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(event.data.object);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionCreatedOrUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(event.data.object);
        break;

      default:
        SafeLogger.warn('Unhandled Stripe webhook event', {
          eventType: event.type,
        });
    }
  }

  private async handleCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
  ) {
    if (!session.subscription || typeof session.subscription !== 'string') {
      return;
    }

    const subscription = await this.stripe.subscriptions.retrieve(
      session.subscription,
    );
    await this.handleSubscriptionCreatedOrUpdated(subscription);
  }

  private async handleSubscriptionCreatedOrUpdated(
    subscription: Stripe.Subscription,
  ) {
    const customerId = subscription.customer as string;
    const customer = (await this.stripe.customers.retrieve(
      customerId,
    )) as Stripe.Customer;

    if (!customer.email) {
      SafeLogger.error('Customer has no email', undefined, { customerId });
      return;
    }

    const metadataUserId =
      typeof customer.metadata?.userId === 'string' && customer.metadata.userId
        ? customer.metadata.userId
        : null;

    const user = metadataUserId
      ? await this.prisma.user.findUnique({ where: { id: metadataUserId } })
      : await this.prisma.user.findUnique({ where: { email: customer.email } });

    if (!user) {
      SafeLogger.error('User not found for email', undefined, {
        email: '[REDACTED]',
      });
      return;
    }

    const planInfo = this.extractPlanInfo(subscription);
    // Stripe subscription object uses snake_case properties not in TypeScript types

    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
    const subscriptionAny = subscription as any;
    const firstItem = subscription.items?.data?.[0] as any;
    const periodStartTimestamp =
      subscriptionAny.current_period_start ?? firstItem?.current_period_start;
    const periodEndTimestamp =
      subscriptionAny.current_period_end ?? firstItem?.current_period_end;

    // TEMPORARY - remove after confirming
    SafeLogger.info('Stripe period timestamps', {
      subscriptionId: subscription.id,
      fromRoot: subscriptionAny.current_period_start,
      fromItems: firstItem?.current_period_start,
      periodStartTimestamp,
      periodEndTimestamp,
    });
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

    if (!periodStartTimestamp || !periodEndTimestamp) {
      SafeLogger.error(
        'Missing period dates from Stripe subscription',
        undefined,
        {
          subscriptionId: subscription.id,
        },
      );
      return;
    }

    const currentPeriodStart = new Date(periodStartTimestamp * 1000);
    const currentPeriodEnd = new Date(periodEndTimestamp * 1000);

    // Check for existing subscription with same period
    const existing = await this.prisma.subscription.findFirst({
      where: {
        stripeSubscriptionId: subscription.id,
        currentPeriodStart,
      },
    });
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
    if (existing) {
      // Update existing
      await this.prisma.subscription.update({
        where: { id: existing.id },
        data: {
          status:
            subscription.status === 'canceled'
              ? SubscriptionStatus.CANCELLED
              : (subscription.status.toUpperCase() as SubscriptionStatus),
          cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
        },
      });
    } else {
      // Create new
      await this.prisma.subscription.create({
        data: {
          userId: user.id,
          subscriptionType: 'stripe',
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          status:
            subscription.status === 'canceled'
              ? SubscriptionStatus.CANCELLED
              : (subscription.status.toUpperCase() as SubscriptionStatus),
          planId: planInfo.planId || undefined,
          planName: planInfo.planName || undefined,
          priceAmount: planInfo.priceAmount || undefined,
          priceCurrency: planInfo.priceCurrency || 'USD',
          billingPeriod: planInfo.billingPeriod || undefined,
          currentPeriodStart,
          currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
        },
      });

      // Grant trial if eligible (after subscription is created)
      try {
        const trialResult = await this.trialService.grantIfEligible(user, null);
        if (trialResult.granted) {
          SafeLogger.info('Trial granted on subscription', {
            userId: trialResult.userId,
            trialEndsAt: trialResult.trialEndsAt?.toISOString(),
          } as Record<string, unknown>);
        }
      } catch (trialError) {
        // Don't fail subscription creation if trial grant fails
        SafeLogger.warn('Failed to grant trial on subscription (non-fatal)', {
          error:
            trialError instanceof Error
              ? trialError.message
              : String(trialError),
        });
      }
    }
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const existing = await this.prisma.subscription.findFirst({
      where: { stripeSubscriptionId: subscription.id },
    });

    if (existing) {
      await this.prisma.subscription.update({
        where: { id: existing.id },
        data: {
          status: SubscriptionStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelAtPeriodEnd: false,
        },
      });
    }
  }

  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
    // Update subscription status if needed
    // Stripe Invoice subscription property can be string or object

    const subscriptionRef = (invoice as any).subscription;
    if (subscriptionRef) {
      const subscriptionId: string =
        typeof subscriptionRef === 'string'
          ? subscriptionRef
          : (subscriptionRef.id as string);

      const subscription =
        await this.stripe.subscriptions.retrieve(subscriptionId);
      await this.handleSubscriptionCreatedOrUpdated(subscription);
    }
  }

  private extractPlanInfo(subscription: Stripe.Subscription) {
    const items = subscription.items.data;
    if (!items || items.length === 0) {
      return {
        planId: null,
        planName: null,
        priceAmount: null,
        priceCurrency: null,
        billingPeriod: null,
      };
    }

    const item = items[0];
    const price = item.price;

    if (!price) {
      return {
        planId: null,
        planName: null,
        priceAmount: null,
        priceCurrency: null,
        billingPeriod: null,
      };
    }

    const billingPeriod =
      price.recurring?.interval === 'year'
        ? 'year'
        : price.recurring?.interval === 'month'
          ? 'month'
          : null;

    const planName = price.nickname || 'Premium VPN';

    return {
      planId: price.id || null,
      planName,
      priceAmount: price.unit_amount ? price.unit_amount / 100 : null,
      priceCurrency: price.currency || 'USD',
      billingPeriod,
    };
  }

  private getPriceIdForPlan(planId: string): string | null {
    const annualPriceId =
      this.configService?.get<string>('STRIPE_INDIVIDUAL_ANNUAL_PRICE_ID') ||
      process.env.STRIPE_INDIVIDUAL_ANNUAL_PRICE_ID ||
      '';
    const monthlyPriceId =
      this.configService?.get<string>('STRIPE_INDIVIDUAL_MONTHLY_PRICE_ID') ||
      process.env.STRIPE_INDIVIDUAL_MONTHLY_PRICE_ID ||
      '';

    const priceMap: Record<string, string> = {
      'individual-annual': annualPriceId,
      'individual-monthly': monthlyPriceId,
      premium_annual: annualPriceId,
      premium_yearly: annualPriceId,
      premium_monthly: monthlyPriceId,
    };

    return priceMap[planId] || null;
  }
}
