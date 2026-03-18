import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type * as firebaseAdmin from 'firebase-admin';
import type Stripe from 'stripe';
import * as crypto from 'crypto';

export type MockPrismaClient = DeepMockProxy<PrismaClient>;
export type MockConfigService = DeepMockProxy<ConfigService>;
export type MockFirebaseAuth = DeepMockProxy<firebaseAdmin.auth.Auth>;
export type MockStripe = DeepMockProxy<Stripe>;

export function createMockPrismaClient(): MockPrismaClient {
  return mockDeep<PrismaClient>();
}

export function createMockConfigService(): MockConfigService {
  const mock = mockDeep<ConfigService>();
  // Set default values - use environment variables if available (from jest.setup.ts)
  mock.get.mockImplementation((key: string, defaultValue?: any) => {
    // First check environment variables (set in jest.setup.ts)
    if (process.env[key]) {
      return process.env[key];
    }

    const defaults: Record<string, any> = {
      NODE_ENV: 'test',
      PORT: 3000,
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      FIREBASE_PROJECT_ID: 'test-project',
      FIREBASE_PRIVATE_KEY_ID: 'test-private-key-id',
      // Use a valid RSA private key format for Firebase (same as blind signing key)
      FIREBASE_PRIVATE_KEY:
        process.env.BLIND_SIGNING_PRIVATE_KEY ||
        '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj\nMzEfYyjiWA4R4/M2bN1K3ytty6ZqdyJ3x3pO1YI8P3J2N2Y5N2Y5N2Y5N2Y5N2Y5\nN2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5\nN2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5\nN2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5N2Y5\nAgMBAAECggEBAK8k8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X\n8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X\n8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X\n8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X\n8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X\nQKBgQDyVqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX\n8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8X\nqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX\n8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8X\nqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX\nQKBgQDyVqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX\n8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8X\nqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX\n8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8X\nqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX8XqX\n-----END PRIVATE KEY-----',
      FIREBASE_CLIENT_EMAIL: 'test@test.iam.gserviceaccount.com',
      FIREBASE_CLIENT_ID: 'test-client-id',
      FIREBASE_AUTH_URI: 'https://accounts.google.com/o/oauth2/auth',
      FIREBASE_TOKEN_URI: 'https://oauth2.googleapis.com/token',
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      STRIPE_INDIVIDUAL_ANNUAL_PRICE_ID: 'price_test_annual',
      STRIPE_INDIVIDUAL_MONTHLY_PRICE_ID: 'price_test_monthly',
      JWT_SECRET: 'test-secret',
      // Use env var if available, otherwise fallback
      BLIND_SIGNING_PRIVATE_KEY:
        process.env.BLIND_SIGNING_PRIVATE_KEY ||
        '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
    };
    return defaults[key] || defaultValue;
  });
  return mock;
}

export function createMockFirebaseAuth(): MockFirebaseAuth {
  return mockDeep<firebaseAdmin.auth.Auth>();
}

export function createMockFirebaseConfig(): any {
  return {
    getAuth: jest.fn().mockReturnValue(createMockFirebaseAuth()),
  };
}

export function createMockStripe(): MockStripe {
  const mock = mockDeep<Stripe>();
  // Setup default mock implementations
  (mock.customers.create as jest.Mock) = jest.fn();
  (mock.customers.retrieve as jest.Mock) = jest.fn();
  (mock.checkout.sessions.create as jest.Mock) = jest.fn();
  (mock.billingPortal.sessions.create as jest.Mock) = jest.fn();
  (mock.subscriptions.retrieve as jest.Mock) = jest.fn();
  (mock.webhooks.constructEvent as jest.Mock) = jest.fn();
  return mock;
}

export function createMockCrypto(): typeof crypto {
  const mockPrivateKey = {
    export: jest
      .fn()
      .mockReturnValue(
        '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
      ),
  };
  const mockPublicKey = {
    export: jest
      .fn()
      .mockReturnValue(
        '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----',
      ),
  };

  return {
    ...crypto,
    createPrivateKey: jest.fn().mockReturnValue(mockPrivateKey),
    createPublicKey: jest.fn().mockReturnValue(mockPublicKey),
    sign: jest.fn().mockReturnValue(Buffer.from('mock-signature')),
  } as any;
}

export function createMockFetch(): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: true,
    text: jest.fn().mockResolvedValue(JSON.stringify({ status: 0 })),
  });
}
