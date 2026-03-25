import { faker } from '@faker-js/faker';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import type { User, Subscription, AppleIAPPurchase } from '@prisma/client';

export function createMockUser(overrides?: Partial<User>): User {
  return {
    id: faker.string.uuid(),
    firebaseUid: faker.string.alphanumeric(28),
    appleUserId: null,
    googleUserId: null,
    email: faker.internet.email(),
    displayName: faker.person.fullName(),
    provider: 'google',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    stripeCustomerId: null,
    trialActive: false,
    trialStartsAt: null,
    trialEndsAt: null,
    trialTier: null,
    mergedIntoUserId: null,
    ...overrides,
  };
}

export function createMockSubscription(
  overrides?: Partial<Subscription>,
): Subscription {
  return {
    id: faker.string.uuid(),
    userId: faker.string.uuid(),
    stripeCustomerId: `cus_${faker.string.alphanumeric(24)}`,
    stripeSubscriptionId: `sub_${faker.string.alphanumeric(24)}`,
    status: SubscriptionStatus.ACTIVE,
    planId: 'premium-annual',
    planName: 'Premium VPN - Annual',
    priceAmount: new Prisma.Decimal(130.99),
    priceCurrency: 'USD',
    billingPeriod: 'year',
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    appleEnvironment: null,
    appleOriginalTransactionId: null,
    appleProductId: null,
    appleTransactionId: null,
    subscriptionType: 'stripe',
    ...overrides,
  };
}

export function createMockAppleIAPPurchase(
  overrides?: Partial<AppleIAPPurchase>,
): AppleIAPPurchase {
  return {
    id: faker.string.uuid(),
    transactionId: faker.string.alphanumeric(32),
    originalTransactionId: faker.string.alphanumeric(32),
    productId: 'com.keenvpn.premium.annual',
    environment: 'Production',
    purchaseDate: new Date(),
    expiresDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    receiptData: null,
    linkedUserId: faker.string.uuid(),
    linkedEmail: faker.internet.email(),
    linkedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockFirebaseToken(): string {
  // Generate a mock JWT-like token (not a real JWT, just for testing)
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      uid: faker.string.alphanumeric(28),
      email: faker.internet.email(),
      name: faker.person.fullName(),
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    }),
  ).toString('base64url');
  const signature = faker.string.alphanumeric(43);
  return `${header}.${payload}.${signature}`;
}

export function createMockDecodedFirebaseToken() {
  return {
    uid: faker.string.alphanumeric(28),
    email: faker.internet.email(),
    name: faker.person.fullName(),
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
}

export function createMockStripeEvent(type: string, data: any): any {
  return {
    id: `evt_${faker.string.alphanumeric(24)}`,
    object: 'event',
    type,
    data: {
      object: data,
    },
    created: Math.floor(Date.now() / 1000),
  };
}

export function createMockAppleReceipt(): any {
  return {
    status: 0,
    environment: 'Production',
    receipt: {
      receipt_type: 'Production',
      in_app: [
        {
          transaction_id: faker.string.alphanumeric(32),
          original_transaction_id: faker.string.alphanumeric(32),
          product_id: 'com.keenvpn.premium.annual',
          purchase_date_ms: Date.now().toString(),
          expires_date_ms: (Date.now() + 365 * 24 * 60 * 60 * 1000).toString(),
        },
      ],
    },
  };
}

export function createMockBlindedToken(): string {
  // Generate a base64-encoded mock blinded token
  const token = faker.string.alphanumeric(256);
  return Buffer.from(token).toString('base64');
}

export function createMockStripeCustomer(): any {
  return {
    id: `cus_${faker.string.alphanumeric(24)}`,
    email: faker.internet.email(),
    metadata: { userId: faker.string.uuid() },
  };
}

export function createMockStripeSubscription(): any {
  return {
    id: `sub_${faker.string.alphanumeric(24)}`,
    customer: `cus_${faker.string.alphanumeric(24)}`,
    status: 'active',
    current_period_start: Math.floor(Date.now() / 1000),
    current_period_end: Math.floor(
      (Date.now() + 365 * 24 * 60 * 60 * 1000) / 1000,
    ),
    cancel_at_period_end: false,
    items: {
      data: [
        {
          price: {
            id: `price_${faker.string.alphanumeric(24)}`,
            nickname: 'Premium VPN - Annual',
            currency: 'usd',
            unit_amount: 13099,
            recurring: {
              interval: 'year',
            },
          },
        },
      ],
    },
  };
}

export function createMockSubscriptionUser(
  overrides?: Partial<{
    id: string;
    subscriptionId: string;
    userId: string;
    createdAt: Date;
  }>,
) {
  return {
    id: faker.string.uuid(),
    subscriptionId: faker.string.uuid(),
    userId: faker.string.uuid(),
    createdAt: new Date(),
    ...overrides,
  };
}
