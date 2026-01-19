import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { SafeLogger } from '../../common/utils/logger.util';
import { TrialService } from '../../subscription/trial.service';

@Injectable()
export class StripeService {
  private stripe: Stripe;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    @Inject(forwardRef(() => TrialService))
    private trialService: TrialService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is required');
    }
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2025-12-15.clover',
    });
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

    // Get or create Stripe customer
    let customerId = user.stripeCustomerId;

    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: user.email,
        metadata: { userId },
      });
      customerId = customer.id;

      await this.prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customerId },
      });
    }

    // Get price ID for plan
    const priceId = this.getPriceIdForPlan(planId);
    if (!priceId) {
      throw new Error(`Price ID not found for plan: ${planId}`);
    }

    const session = await this.stripe.checkout.sessions.create({
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

    const user = await this.prisma.user.findUnique({
      where: { email: customer.email },
    });

    if (!user) {
      SafeLogger.error('User not found for email', undefined, {
        email: '[REDACTED]',
      });
      return;
    }

    const planInfo = this.extractPlanInfo(subscription);
    // Stripe subscription object uses snake_case properties not in TypeScript types

    const currentPeriodStart = new Date(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (subscription as any).current_period_start * 1000,
    );

    const currentPeriodEnd = new Date(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (subscription as any).current_period_end * 1000,
    );

    // Check for existing subscription with same period
    const existing = await this.prisma.subscription.findFirst({
      where: {
        stripeSubscriptionId: subscription.id,
        currentPeriodStart,
      },
    });

    if (existing) {
      // Update existing
      await this.prisma.subscription.update({
        where: { id: existing.id },
        data: {
          status:
            subscription.status === 'canceled'
              ? 'cancelled'
              : subscription.status,
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
              ? 'cancelled'
              : subscription.status,
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
          } as Record<string, any>);
        }
      } catch (trialError) {
        // Don't fail subscription creation if trial grant fails
        SafeLogger.warn(
          'Failed to grant trial on subscription (non-fatal)',
          trialError,
        );
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
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelAtPeriodEnd: false,
        },
      });
    }
  }

  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
    // Update subscription status if needed
    // Stripe Invoice subscription property can be string or object

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const subscriptionRef = (invoice as any).subscription;
    if (subscriptionRef) {
      const subscriptionId: string =
        typeof subscriptionRef === 'string'
          ? subscriptionRef
          : // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            (subscriptionRef.id as string);

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
    const priceMap: Record<string, string> = {
      'individual-annual':
        this.configService.get<string>('STRIPE_INDIVIDUAL_ANNUAL_PRICE_ID') ||
        '',
      'individual-monthly':
        this.configService.get<string>('STRIPE_INDIVIDUAL_MONTHLY_PRICE_ID') ||
        '',
    };

    return priceMap[planId] || null;
  }
}
