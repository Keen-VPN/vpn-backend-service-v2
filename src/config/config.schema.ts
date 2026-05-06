import * as Joi from 'joi';

export const configValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().default('redis://localhost:6379'),

  // Firebase Configuration
  FIREBASE_PROJECT_ID: Joi.string().required(),
  FIREBASE_PRIVATE_KEY_ID: Joi.string().required(),
  FIREBASE_PRIVATE_KEY: Joi.string().when('NODE_ENV', {
    is: Joi.string().valid('staging', 'production'),
    then: Joi.string().optional(),
    otherwise: Joi.string().required(),
  }),
  FIREBASE_CLIENT_EMAIL: Joi.string().required(),
  FIREBASE_CLIENT_ID: Joi.string().required(),
  FIREBASE_AUTH_URI: Joi.string().default(
    'https://accounts.google.com/o/oauth2/auth',
  ),
  FIREBASE_TOKEN_URI: Joi.string().default(
    'https://oauth2.googleapis.com/token',
  ),
  FIREBASE_AUTH_PROVIDER_X509_CERT_URL: Joi.string().optional(),
  FIREBASE_CLIENT_X509_CERT_URL: Joi.string().optional(),

  // Stripe Configuration
  STRIPE_SECRET_KEY: Joi.string().required(),
  STRIPE_WEBHOOK_SECRET: Joi.string().required(),
  STRIPE_INDIVIDUAL_ANNUAL_PRICE_ID: Joi.string().optional(),
  STRIPE_INDIVIDUAL_MONTHLY_PRICE_ID: Joi.string().optional(),

  // Apple IAP Configuration
  APPLE_SHARED_SECRET: Joi.string().optional(),
  APPLE_KEY_ID: Joi.string().optional(),
  APPLE_ISSUER_ID: Joi.string().optional(),
  APPLE_BUNDLE_ID: Joi.string().optional(),

  // Blind Signing Configuration
  BLIND_SIGNING_PRIVATE_KEY: Joi.string().when('NODE_ENV', {
    is: Joi.string().valid('staging', 'production'),
    then: Joi.string().optional(),
    otherwise: Joi.string().required(),
  }),

  // JWT Configuration
  JWT_SECRET: Joi.string().optional(),

  // Node Daemon Configuration
  NODE_TOKEN: Joi.string().when('NODE_ENV', {
    is: Joi.string().valid('staging', 'production'),
    then: Joi.string().optional(),
    otherwise: Joi.string().optional().default('dev-token-locally'),
  }),
  // Optional mapping to override node-daemon base URLs per node IP.
  // Example:
  //   NODE_DAEMON_URL_OVERRIDES="169.255.57.34=https://vegetation-tabs-....trycloudflare.com"
  NODE_DAEMON_URL_OVERRIDES: Joi.string().optional(),

  // Slack error reporting (optional)
  SLACK_WEBHOOK_URL: Joi.string().uri().optional(),
  // Free-trial growth notifications (optional; dedicated webhook recommended)
  SLACK_TRIAL_WEBHOOK_URL: Joi.string().uri().optional(),
  // Allow Slack notifications outside production (opt-in; useful for staging/dev verification)
  SLACK_ALLOW_NON_PROD: Joi.string().valid('true', 'false').optional(),

  // Resend transactional email (optional; emails are skipped when unset)
  RESEND_API_KEY: Joi.string().optional(),
  EMAIL_FROM: Joi.alternatives()
    .try(
      Joi.string().email(),
      Joi.string().pattern(/^.+<[^<>@\s]+@[^<>@\s]+>$/),
    )
    .optional(),
  RESEND_TIMEOUT_MS: Joi.number().integer().min(1000).max(60000).default(10000),
  SUPPORT_EMAIL: Joi.string().email().optional(),
  SALES_EMAIL: Joi.string().email().optional(),
  ACCOUNT_URL: Joi.string().uri().optional(),

  /** Admin session cookie max-age in seconds (300–2592000). Defaults to 7 days. */
  ADMIN_SESSION_MAX_AGE_SEC: Joi.number()
    .integer()
    .min(300)
    .max(2592000)
    .optional(),
  /** Cookie SameSite: lax | strict | none (use none + HTTPS when admin UI and API differ by site). */
  ADMIN_SESSION_COOKIE_SAME_SITE: Joi.string()
    .valid('lax', 'strict', 'none')
    .optional(),
  /** Optional explicit cookie Domain (e.g. .vpnkeen.com). */
  ADMIN_SESSION_COOKIE_DOMAIN: Joi.string().optional(),
  /** Login limiter backend: in_memory | redis. */
  ADMIN_LOGIN_RATE_LIMITER_BACKEND: Joi.string()
    .valid('in_memory', 'redis')
    .default('in_memory'),
  /** Optional expected instance count for safety warnings in production. */
  APP_INSTANCE_COUNT: Joi.number().integer().min(1).optional(),
  CORS_ORIGINS: Joi.string().optional(),
  /** S3 bucket for membership-transfer proof images (presigned PUT/GET). Optional until feature is enabled. */
  MEMBERSHIP_TRANSFER_S3_BUCKET: Joi.string().optional(),
  /** AWS region for S3 client (defaults to us-east-1 in code when unset). */
  AWS_REGION: Joi.string().optional(),
});
