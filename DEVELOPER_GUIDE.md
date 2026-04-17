# Backend Developer Guide

This document covers the features, architecture decisions, and integration points of the NestJS backend service. It is intended for both existing team members and new developers onboarding to the project.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Feature Map](#feature-map)
3. [Architecture Decisions](#architecture-decisions)
4. [Module Deep Dives](#module-deep-dives)
5. [Integration Points](#integration-points)
6. [Deployment & Infrastructure](#deployment--infrastructure)
7. [Testing Strategy](#testing-strategy)
8. [Common Patterns](#common-patterns)
9. [Known Gotchas](#known-gotchas)

---

## System Overview

The backend is a NestJS 11 API deployed as a Netlify Function via `@vendia/serverless-express`. It uses PostgreSQL (Prisma ORM) for persistence and Redis for caching. The service enforces a strict "Church & State" privacy model, separating user identity from VPN usage data.

### Core Responsibilities

- User authentication (Firebase, Google OAuth, Apple Sign-In)
- Subscription management (Stripe + Apple IAP)
- Account linking across auth providers
- VPN config generation via blind-signed tokens
- Node fleet management (heartbeats, health scoring, IP allocation)
- Slack notifications for operational alerts and user requests
- Server location preference collection

---

## Feature Map

### Node Management & Fleet Operations

**Files:** `src/node-management/`, `src/allocation/`, `src/location/`, `src/notification/`

The node management system handles VPN server fleet operations:

- **Node registration** -- Nodes self-register with the backend providing their region, public key, and endpoint. See `src/node-management/node-management.service.ts`.
- **Pulse/heartbeat processing** -- Nodes send periodic pulses with CPU, memory, and connection metrics. DTOs at `src/node-management/dto/pulse.dto.ts`.
- **Health scoring** -- The allocation service scores nodes based on load and responsiveness. See `src/allocation/allocation.service.ts`.
- **Location service** -- Returns available VPN locations with average load calculations. Filters to only active nodes. See `src/location/location.service.ts`.
- **IP allocation** -- Assigns IPs from the `10.66.0.0/16` range on the healthiest available node.

### Subscription System

**Files:** `src/subscription/`, `src/payment/stripe/`, `src/payment/apple/`

Supports both Stripe (web) and Apple IAP (native apps):

- **Plan resolution** -- `subscription.service.ts` and `auth.service.ts` resolve the active plan from either Stripe or Apple subscription data. Plan naming includes billing period detection (monthly vs yearly).
- **Subscription lookup utility** -- `src/subscription/subscription-lookup.util.ts` provides helpers for finding subscription users across providers.
- **Trial management** -- `src/subscription/trial.service.ts` handles device-fingerprint-based trials.
- **Stripe webhooks** -- `src/payment/stripe/stripe.webhook.controller.ts` processes Stripe events. Requires raw body for signature verification (excluded from body parsing middleware).
- **Apple IAP webhooks** -- `src/payment/apple/apple.service.ts` handles Apple server notifications.
- **Premium yearly pricing** -- Added as a plan option in `stripe.service.ts`.

### Account Linking

**Files:** `src/auth/auth.service.ts`, `src/auth/auth.controller.ts`, `src/common/dto/link-provider.dto.ts`, `src/common/dto/unlink-provider.dto.ts`

Users can link multiple auth providers (Google + Apple) to a single account:

- **Link provider** -- `POST /api/v1/auth/link-provider`. Validates that the target provider isn't already linked to a different account. Handles subscription migration when linking accounts that have separate subscriptions.
- **Unlink provider** -- `POST /api/v1/auth/unlink-provider`. Validates the user has at least one remaining provider.
- **Conflict detection** -- Before linking, the service checks for provider conflicts (e.g., the Apple ID is already associated with a different Firebase user). See the conflict check logic in `auth.service.ts`.
- **Database schema** -- The `LinkedAccount` and `SubscriptionUser` models in `prisma/schema.prisma` support the many-to-many relationship between users and auth providers. A backfill script exists at `prisma/backfill-subscription-users.sql`.

### Slack Notifications

**Files:** `src/notification/notification.service.ts`, `src/notification/notification.module.ts`

Two Slack webhook integrations:

1. **Operational alerts** (`SLACK_WEBHOOK_URL`) -- High load warnings, node death alerts, node registration info, API error reports. The `reportErrorToSlack()` method is called from the global exception filter for every API error, including file/line from the stack trace.
2. **Server location requests** (`SLACK_SERVER_REQUESTS_WEBHOOK_URL`) -- User-submitted server location preferences are posted to a dedicated `#server-requests` channel. This is a fire-and-forget notification; failures are logged but don't affect the API response.

Both skip sending in development (`NODE_ENV=development`).

### Server Location Preferences

**Files:** `src/preferences/`

- **Controller** -- `POST /api/v1/user/preferences/server-locations`. Uses `OptionalSessionGuard` (auth not required).
- **Service** -- Creates a DB record with `region` and `reason`, then fires a Slack notification.
- **DTO** -- `ServerLocationPreferenceBodyDto` whitelists only `region` and `reason`. The global `ValidationPipe` with `forbidNonWhitelisted: true` rejects any extra properties.

### VPN Config Generation

**Files:** `src/config/`, `src/crypto/`

- Endpoint: `POST /api/config/vpn`
- Uses RSA-FDH blind-signed tokens for privacy. The client obtains a blind signature, then presents the unblinded token to get a WireGuard config.
- IP allocation happens during config generation, selecting the healthiest node.

---

## Architecture Decisions

### Church & State Privacy Model

The most critical architectural constraint: user identity (Firebase UID, payment data) must never be linked to VPN connection data (WireGuard keys, session IPs). This is enforced at the code level -- there is no foreign key or join path from a user record to a connection session.

### Explicit Dependency Injection with `@Inject()`

All NestJS constructor parameters use explicit `@Inject(Token)` decorators. This is **required** because the Netlify bundler strips `reflect-metadata`, causing type-only injection to fail silently in production. Example:

```typescript
constructor(
  @Inject(PrismaService) private readonly prisma: PrismaService,
  @Inject(NotificationService) private readonly notificationService: NotificationService,
) {}
```

### Global Validation Pipeline

The `ValidationPipe` is configured globally in both `src/main.ts` and `netlify/functions/api.ts`:

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
);
```

- `whitelist: true` -- Strips undecorated properties from the request body.
- `forbidNonWhitelisted: true` -- Returns 400 if the request contains properties not defined in the DTO.
- `transform: true` -- Auto-transforms plain objects to DTO class instances.

This means every new field added to a request body **must** be decorated in the DTO, or clients will get a 400 error.

### Serverless Deployment

The backend runs as a single Netlify Function. Key considerations:

- **Path rewriting** -- Netlify redirects all traffic (`/*`) to `/.netlify/functions/api`. The handler rewrites paths to prepend the `/api` global prefix. See `netlify/functions/api.ts` lines 193-210.
- **Cold starts** -- The NestJS app is cached in `cachedServer` to avoid re-initialization on subsequent invocations.
- **Secrets** -- In staging/production, large secrets (NODE_TOKEN, FIREBASE_PRIVATE_KEY, BLIND_SIGNING_PRIVATE_KEY) are fetched from AWS Secrets Manager at bootstrap.
- **Connection management** -- `context.callbackWaitsForEmptyEventLoop = false` prevents Lambda from waiting on Prisma connections.

### Redemption Module Removal

The original `Redemption` module (token redemption for VPN configs) was removed in March 2026 in favor of the blind-signing flow via the `config/` module. The Redis module that supported it was also removed. If you see references to "redemption" in old code or docs, it's deprecated.

---

## Module Deep Dives

### Auth Module (`src/auth/`)

The auth module is the largest and most complex:

| File | Purpose |
|------|---------|
| `auth.service.ts` | Core logic: Firebase auth, provider linking/unlinking, conflict detection, subscription resolution |
| `auth.controller.ts` | Routes: login, link-provider, unlink-provider, linked-accounts |
| `guards/firebase-auth.guard.ts` | Validates Firebase JWT tokens |
| `guards/optional-session.guard.ts` | Validates Bearer tokens when present, but always allows the request through |
| `guards/node-auth.guard.ts` | Validates static NODE_TOKEN for node-to-backend auth |

**Account linking flow:**
1. Client sends `POST /api/v1/auth/link-provider` with the new provider's token
2. Service verifies the token with the provider (Google/Apple)
3. Checks for conflicts (is this provider ID already linked to another user?)
4. If no conflict, creates a `LinkedAccount` record and migrates any existing subscriptions
5. Returns updated linked accounts list

### Payment Module (`src/payment/`)

**Stripe (`src/payment/stripe/`):**
- `stripe.service.ts` -- Creates checkout sessions, manages subscriptions, resolves plan names with billing period.
- `stripe.webhook.controller.ts` -- Handles Stripe webhook events. Uses raw body for signature verification. API version: `2026-02-25`.

**Apple (`src/payment/apple/`):**
- `apple.service.ts` -- Processes Apple server-to-server notifications, validates receipts, manages subscription state.

### Notification Module (`src/notification/`)

- Sanitizes all user-supplied text before including in Slack messages (`sanitizeForSlackText`, `sanitizeForSlackUrl`) to prevent mrkdwn injection.
- `reportErrorToSlack()` extracts file and line number from error stacks via `parseErrorLocation()`.
- URL construction for Slack messages uses multiple fallbacks: Host header -> X-Forwarded-Host (only if `TRUST_FORWARDED_HOST=true` and host is in `ALLOWED_HOSTS`) -> `PUBLIC_BASE_URL`/`API_BASE_URL`.

---

## Integration Points

### With Apple Apps (iOS/macOS)

- **Auth** -- Apps authenticate via Firebase (Google/Apple Sign-In) and send the Firebase ID token to the backend.
- **Subscriptions** -- iOS/macOS use Apple IAP; the backend receives server notifications from Apple. The apps also call the backend to check subscription status.
- **VPN Config** -- Apps request VPN configs via blind-signed tokens at `POST /api/config/vpn`.
- **Server Preferences** -- Apps submit server location preferences to `POST /api/v1/user/preferences/server-locations`.
- **Connection Sessions** -- Apps report connection lifecycle events (connect/disconnect) to the backend for PII-free session tracking.
- **Base URL** -- Apps use `https://vpnkeen.netlify.app/api` (configured in `KeenVPNModels/Configuration/AppConfig.swift`).

### With Website

- **Auth** -- Website uses Firebase auth (Google Sign-In) and sends tokens to the backend.
- **Subscriptions** -- Website creates Stripe checkout sessions via `POST /api/v1/payment/stripe/create-checkout-session`. Stripe redirects back to success/cancel URLs.
- **Account Page** -- Website fetches subscription status, linked accounts, and subscription history from the backend.
- **Billing Portal** -- Website can open Stripe billing portal sessions for subscription management.

### Slack

- **Operational alerts** -- `SLACK_WEBHOOK_URL` for errors, node health, high load.
- **Server requests** -- `SLACK_SERVER_REQUESTS_WEBHOOK_URL` for user location requests.

---

## Deployment & Infrastructure

### Netlify Configuration (`netlify.toml`)

- **Build command** -- Runs Prisma generate + migrate deploy + NestJS build. Branch deploys use a separate command that resolves specific migration conflicts.
- **Redirect rule** -- `/* -> /.netlify/functions/api` (status 200, force: true).
- **External modules** -- `class-transformer` and `class-validator` are listed in `external_node_modules` to prevent bundling issues.

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `FIREBASE_PRIVATE_KEY` | Firebase Admin SDK key |
| `NODE_TOKEN` | Static token for node-to-backend auth |
| `BLIND_SIGNING_PRIVATE_KEY` | RSA private key for blind signatures |
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature secret |
| `SLACK_WEBHOOK_URL` | Operational alerts Slack webhook |
| `SLACK_SERVER_REQUESTS_WEBHOOK_URL` | Server location requests Slack webhook |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `NODE_ENV` | `development`, `staging`, or `production` |

### Database

PostgreSQL 16 with Prisma ORM. Schema at `prisma/schema.prisma`. Key models:

- `User`, `LinkedAccount`, `SubscriptionUser` -- User identity and provider linking
- `Subscription` -- Subscription state (Stripe or Apple)
- `Node` -- VPN server nodes
- `ConnectionSession` -- PII-free VPN connection records
- `ServerLocationPreference` -- User-submitted server region requests

---

## Testing Strategy

### Configuration

- Test config: `test/jest.config.ts`
- Coverage thresholds: 60% branches, 80% functions/lines/statements
- Test directories: `test/unit/` and `test/e2e/`

### Running Tests

```bash
npm run test:unit           # Unit tests only
npm run test:e2e            # E2E tests (needs PostgreSQL)
npx jest --config test/jest.config.ts <path>  # Single test file
```

### Test Organization

Unit tests mirror the source structure:

```
test/unit/
  auth/
    auth.controller.spec.ts
    auth.service.spec.ts
    link-provider.spec.ts
    unlink-provider.spec.ts
    optional-session.guard.spec.ts
  account/
    account-delete.spec.ts
    account.service.spec.ts
    linked-providers.spec.ts
  payment/
    stripe.service.spec.ts
    apple.service.spec.ts
  subscription/
    subscription.service.spec.ts
    subscription-user-lookup.spec.ts
  notification/
    notification.service.spec.ts
  preferences/
    preferences.service.spec.ts
  prisma/
    prisma.service.spec.ts
  allocation/
    allocation.service.spec.ts
  location/
    location.service.spec.ts
  node-management/
    node-management.service.spec.ts
```

### Mock Setup

Shared mock helpers in `test/setup/`:
- `createMockPrismaClient()` -- Returns a fully-mocked Prisma client
- `test-helpers.ts` -- Common test utilities

---

## Common Patterns

### Fire-and-Forget Notifications

Slack notifications are sent without awaiting the result. Failures are caught and logged but don't affect the API response:

```typescript
this.notificationService
  .notifyServerLocationRequest({ region, reason, createdAt })
  .catch((error: Error) => {
    this.logger.error(`Failed to send Slack notification: ${error.message}`);
  });
```

### Guard Stacking

Controllers use multiple guard types depending on the endpoint's auth requirements:
- `@UseGuards(FirebaseAuthGuard)` -- Requires authenticated user
- `@UseGuards(NodeAuthGuard)` -- Requires valid NODE_TOKEN (for node daemons)
- `@UseGuards(OptionalSessionGuard)` -- Validates auth if present, but doesn't require it

### DTO Validation

All request bodies use `class-validator` decorators. The global pipe enforces strict validation:

```typescript
export class ServerLocationPreferenceBodyDto {
  @IsString() @IsNotEmpty() @MaxLength(255)
  region: string;

  @IsString() @IsNotEmpty() @MaxLength(2000)
  reason: string;
}
```

---

## Known Gotchas

1. **`forbidNonWhitelisted` rejects unknown fields** -- If a client sends properties not in the DTO, the request fails with 400. This has caused bugs when clients send extra fields like `client_session_id`. Always check the DTO when adding new request fields.

2. **Netlify path rewriting** -- The function handler rewrites `/.netlify/functions/api/*` to `/api/*`. If routes aren't resolving, check the rewrite logic in `netlify/functions/api.ts`.

3. **`@Inject()` is mandatory** -- Do not rely on TypeScript type-based injection. The Netlify bundler strips metadata. Always use explicit `@Inject(Token)`.

4. **Stripe raw body** -- The Stripe webhook controller must receive the raw request body for signature verification. It's excluded from the global body parsing middleware.

5. **Slack notifications skip in development** -- Both `sendSlackAlert()` and `notifyServerLocationRequest()` return early when `NODE_ENV=development`. If you're debugging Slack integration locally, you'll need to temporarily change this or use a different env value.

6. **Migration conflicts** -- The Netlify build command includes specific migration resolution flags. If you add new migrations, ensure they don't conflict with the branch-deploy build command in `netlify.toml`.

7. **Subscription resolution order** -- When a user has both Stripe and Apple subscriptions (possible after account linking), the service prioritizes the active one. See the resolution logic in `auth.service.ts` and `subscription.service.ts`.
