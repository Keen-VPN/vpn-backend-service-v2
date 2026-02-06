// Global test setup
// This file runs before all tests

// Suppress console logs in tests (optional - can be enabled for debugging)
if (process.env.SUPPRESS_TEST_LOGS === 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };
}

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
process.env.FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || 'test-project';
process.env.FIREBASE_PRIVATE_KEY_ID =
  process.env.FIREBASE_PRIVATE_KEY_ID || 'test-private-key-id';
process.env.FIREBASE_PRIVATE_KEY =
  process.env.FIREBASE_PRIVATE_KEY ||
  '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';
process.env.FIREBASE_CLIENT_EMAIL =
  process.env.FIREBASE_CLIENT_EMAIL || 'test@test.iam.gserviceaccount.com';
process.env.FIREBASE_CLIENT_ID =
  process.env.FIREBASE_CLIENT_ID || 'test-client-id';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_123';
process.env.STRIPE_WEBHOOK_SECRET =
  process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test';
// Use a valid test RSA private key format for crypto operations
// Generate a real RSA key for testing (this runs once before all tests)
if (!process.env.BLIND_SIGNING_PRIVATE_KEY) {
  const crypto = require('crypto');
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  process.env.BLIND_SIGNING_PRIVATE_KEY = privateKey;
}

// Increase timeout for integration tests
jest.setTimeout(30000);
