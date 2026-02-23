import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SubscriptionPlanFeature {
  name: string;
  included: boolean;
  highlighted?: boolean;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  period: string;
  interval: string;
  billingPeriod: string;
  features: SubscriptionPlanFeature[];
  priceId: string;
}

@Injectable()
export class PlansConfigService {
  constructor(@Inject(ConfigService) private configService: ConfigService) {}

  get annualPriceId(): string {
    return (
      this.configService.get<string>('STRIPE_INDIVIDUAL_ANNUAL_PRICE_ID') || ''
    );
  }

  get monthlyPriceId(): string {
    return (
      this.configService.get<string>('STRIPE_INDIVIDUAL_MONTHLY_PRICE_ID') || ''
    );
  }

  getSubscriptionPlans(): SubscriptionPlan[] {
    if (!this.annualPriceId || !this.monthlyPriceId) {
      // Allow fallback for development, but throw if required? Old code threw error but that crashed the app at runtime if missing.
      // Let's return plans anyway with fake/empty IDs, or throw error depending on environment.
      // We will follow the old project behavior.
      if (this.configService.get<string>('NODE_ENV') === 'production') {
        throw new Error('Stripe price IDs are not configured');
      }
    }

    const annualPlanPrice = parseFloat(
      this.configService.get<string>('ANNUAL_PLAN_PRICE') || '40.00',
    );
    const monthlyPlanPrice = parseFloat(
      this.configService.get<string>('MONTHLY_PLAN_PRICE') || '4.00',
    );
    const annualPlanName =
      this.configService.get<string>('ANNUAL_PLAN_NAME') ||
      'Premium VPN - Annual';
    const monthlyPlanName =
      this.configService.get<string>('MONTHLY_PLAN_NAME') ||
      'Premium VPN - Monthly';

    const planFeatures: SubscriptionPlanFeature[] = [
      { name: '1 month free trial', included: true, highlighted: true },
      { name: 'Access to all server locations', included: true },
      { name: 'Unlimited bandwidth', included: true },
      { name: 'Military-grade encryption', included: true },
      { name: '24/7 customer support', included: true },
      { name: 'No-log policy guaranteed', included: true },
      { name: 'Kill switch protection', included: true },
      { name: 'Priority support', included: false },
    ];

    const plans: SubscriptionPlan[] = [
      {
        id: 'premium_monthly',
        name: monthlyPlanName,
        price: monthlyPlanPrice,
        period: 'month',
        interval: 'month',
        billingPeriod: 'month',
        features: planFeatures,
        priceId: this.monthlyPriceId,
      },
      {
        id: 'premium_yearly',
        name: annualPlanName,
        price: annualPlanPrice,
        period: 'year',
        interval: 'year',
        billingPeriod: 'year',
        features: planFeatures,
        priceId: this.annualPriceId,
      },
    ];

    return plans;
  }

  getPlanById(planId: string): SubscriptionPlan | null {
    const plans = this.getSubscriptionPlans();
    return plans.find((plan) => plan.id === planId) || null;
  }

  getPriceIdForPlan(planId: 'premium_monthly' | 'premium_yearly'): string {
    if (!this.annualPriceId || !this.monthlyPriceId) {
      if (this.configService.get<string>('NODE_ENV') === 'production') {
        throw new Error('Stripe price IDs are not configured');
      }
    }
    return planId === 'premium_monthly'
      ? this.monthlyPriceId
      : this.annualPriceId;
  }

  getPlanName(planId: 'premium_monthly' | 'premium_yearly'): string {
    const plan = this.getPlanById(planId);
    return plan?.name || 'Premium VPN';
  }

  getBillingPeriod(
    planId: 'premium_monthly' | 'premium_yearly',
  ): 'month' | 'year' {
    return planId === 'premium_monthly' ? 'month' : 'year';
  }
}
