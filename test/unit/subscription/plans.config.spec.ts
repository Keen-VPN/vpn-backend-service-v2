import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PlansConfigService } from '../../../src/subscription/config/plans.config';

describe('PlansConfigService', () => {
  let service: PlansConfigService;
  let mockConfigService: Partial<ConfigService>;

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'STRIPE_INDIVIDUAL_ANNUAL_PRICE_ID':
            return 'price_annual';
          case 'STRIPE_INDIVIDUAL_MONTHLY_PRICE_ID':
            return 'price_monthly';
          case 'ANNUAL_PLAN_PRICE':
            return '99.99';
          case 'MONTHLY_PLAN_PRICE':
            return '9.99';
          case 'ANNUAL_PLAN_NAME':
            return 'Annual Plan';
          case 'MONTHLY_PLAN_NAME':
            return 'Monthly Plan';
          case 'NODE_ENV':
            return 'development';
          default:
            return undefined;
        }
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlansConfigService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<PlansConfigService>(PlansConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSubscriptionPlans', () => {
    it('should return subscription plans correctly', () => {
      const plans = service.getSubscriptionPlans();
      expect(plans.length).toBe(2);
      expect(plans[0].id).toBe('premium_monthly');
      expect(plans[0].price).toBe(9.99);
      expect(plans[0].priceId).toBe('price_monthly');
      expect(plans[1].id).toBe('premium_yearly');
      expect(plans[1].price).toBe(99.99);
      expect(plans[1].priceId).toBe('price_annual');
    });

    it('should throw an error in production if price IDs are missing', () => {
      (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        return undefined; // no price IDs
      });

      expect(() => service.getSubscriptionPlans()).toThrow(
        'Stripe price IDs are not configured',
      );
    });
  });

  describe('getPlanById', () => {
    it('should return the correct plan', () => {
      const plan = service.getPlanById('premium_monthly');
      expect(plan).toBeDefined();
      expect(plan?.id).toBe('premium_monthly');
      expect(plan?.name).toBe('Monthly Plan');
    });

    it('should return null for unknown plan', () => {
      const plan = service.getPlanById('unknown_plan');
      expect(plan).toBeNull();
    });
  });

  describe('getPriceIdForPlan', () => {
    it('should return correct price id for monthly', () => {
      const priceId = service.getPriceIdForPlan('premium_monthly');
      expect(priceId).toBe('price_monthly');
    });

    it('should return correct price id for yearly', () => {
      const priceId = service.getPriceIdForPlan('premium_yearly');
      expect(priceId).toBe('price_annual');
    });

    it('should throw error in production if missing', () => {
      (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        return undefined;
      });

      expect(() => service.getPriceIdForPlan('premium_monthly')).toThrow(
        'Stripe price IDs are not configured',
      );
    });
  });

  describe('getPlanName', () => {
    it('should return correct name for monthly', () => {
      expect(service.getPlanName('premium_monthly')).toBe('Monthly Plan');
    });

    it('should return default Premium VPN if not found', () => {
      // Intentionally passing unknown even though strictly typed to test fallback
      expect(service.getPlanName('unknown' as any)).toBe('Premium VPN');
    });
  });

  describe('getBillingPeriod', () => {
    it('should return correct building period', () => {
      expect(service.getBillingPeriod('premium_monthly')).toBe('month');
      expect(service.getBillingPeriod('premium_yearly')).toBe('year');
    });
  });
});
