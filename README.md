<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
yarn install
```

## Environment Configuration

1. **Copy the example environment file**:

```bash
cp .env.example .env
```

1. **Fill in your environment variables** in `.env`:

### Required Variables

- **Database**: `DATABASE_URL` - PostgreSQL connection string
- **Firebase**:
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_PRIVATE_KEY_ID`
  - `FIREBASE_PRIVATE_KEY` (PEM format with newlines as `\n`)
  - `FIREBASE_CLIENT_EMAIL`
  - `FIREBASE_CLIENT_ID`
- **Stripe**:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
- **Blind Signing**:
  - `BLIND_SIGNING_PRIVATE_KEY` (RSA private key in PEM format)

### Optional Variables

- `STRIPE_INDIVIDUAL_ANNUAL_PRICE_ID` - Stripe price ID for annual plan
- `STRIPE_INDIVIDUAL_MONTHLY_PRICE_ID` - Stripe price ID for monthly plan
- `APPLE_SHARED_SECRET` - Apple IAP shared secret
- `APPLE_KEY_ID` - Apple App Store Server API key ID
- `APPLE_ISSUER_ID` - Apple App Store Server API issuer ID
- `APPLE_BUNDLE_ID` - Your app bundle ID
- `JWT_SECRET` - JWT secret for additional operations
- `REDIS_URL` - Redis connection URL (defaults to `redis://localhost:6379`)

See `.env.example` for the complete list with descriptions.

## Compile and run the project

```bash
# development
$ yarn run start

# watch mode
$ yarn run start:dev

# production mode
$ yarn run start:prod
```

## Run tests

```bash
# unit tests
$ yarn run test

# e2e tests
$ yarn run test:e2e

# test coverage
$ yarn run test:cov
```

---

# Architecture & Security

## Blind Signature Implementation

The backend implements a **production-ready** blind signature system using RSA-FDH (Full Domain Hash).

### Components

1. **CryptoService** (`src/crypto/crypto.service.ts`)
    - Loads RSA private key from `BLIND_SIGNING_PRIVATE_KEY`
    - Signs blinded tokens using RSA-FDH
    - Exports public key in PEM format (SPKI)
    - Validates input token length (32-4096 bytes)

2. **CryptoController** (`src/crypto/crypto.controller.ts`)
    - `GET /api/auth/vpn-token/public-key`: Public endpoint to fetch the RSA public key.
    - `POST /api/auth/vpn-token`: Requires Firebase auth. Signs a blinded token. Throttled at 5 req/min.

### Security Features

- **Authentication**: Signing requires a valid Firebase token.

- **Rate Limiting**: Strict limits (5 req/min) to prevent abuse.
- **Safe Logging**: No sensitive data is logged.
- **Validation**: Strict input validation on token formats.

## Church & State Model - VPN Credentials

The "Church & State" model ensures that **no user ID is sent to VPN nodes**. VPN credentials are strictly token-based.

### Flow

1. **Client**: Generates random token.
2. **Client**: Blinds token and gets signature from `/api/auth/vpn-token`.
3. **Client**: Unblinds signature.
4. **Client**: Requests credentials via `POST /api/config/vpn/credentials` with `{ token, signature, serverId }`.
5. **Backend**: Verifies signature. Generates deterministic credentials:
    - **Username**: Derived from token prefix (e.g., `token_abc123...`).
    - **Password**: `SHA-256(token + signature)`.
6. **VPN Node**: Authenticates using these credentials. No user metadata is involved.

This ensures **Privacy** (backend cannot correlate payment/identity with VPN usage) and **Security** (credentials are ephemeral and token-derived).

---

# API Documentation

## Anonymous Session Endpoint

### `POST /api/connection/session/anonymous`

Allows clients to submit connection sessions using blind-signed tokens, decoupling the session from the user identity.

**Request Body:**

```json
{
  "token": "base64-encoded-original-token",
  "signature": "base64-encoded-blind-signed-signature",
  "session_start": "2024-01-01T00:00:00Z",
  "duration_seconds": 3600,
  "platform": "ios",
  "server_location": "United States"
}
```

**Behavior:**

- Verifies the blind-signed token.
- Records session with `isAnonymized: true`.
- Assigns to a system anonymous user ID (`00000000-0000-0000-0000-000000000000`).
- **Rate Limit**: 100 req/min.

---

# Client Integration Guide

## VPN Credentials Update (Required)

Clients **MUST** use the blind signature flow to fetch VPN credentials.

**Old Flow (Deprecated):**

- Fetch from `/config/vpn`.
- Uses static/shared credentials.

**New Flow (Required):**

1. Generate random token.
2. Blind & Sign via `/api/auth/vpn-token`.
3. Unblind signature.
4. Fetch credentials via `/api/config/vpn/credentials`.

## Connection Sessions (Privacy Enhanced)

Clients should prefer `recordAnonymousSession()` using the same blind-signed token to ensure full privacy.

---

# Roadmap & Status

## Missing Endpoints Analysis

| Endpoint | Status | Notes |
| :--- | :--- | :--- |
| `DELETE /auth/delete-account` | **Implemented** | Available at `/auth/delete-account`. |
| `POST /subscription/status-session` | **Implemented** | Available at `/subscription/status-session`. |
| `POST /subscription/cancel` | **Implemented** | Available at `/subscription/cancel`. |
| `POST /connection/session` | **Update** | Should support anonymous flow (see above). |
| `GET /connection/sessions/{email}` | **Missing** | User history. Low priority. |
| `GET /connection/stats/{email}` | **Missing** | User stats. Low priority. |
| `GET /config/vpn` | **Implemented** | Basic config implemented. Credential part superseded by `vpn/credentials`. |

---

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
