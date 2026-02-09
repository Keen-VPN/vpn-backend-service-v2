# KeenVPN Backend Service V2

[![NestJS](https://img.shields.io/badge/NestJS-11.0-E0234E?logo=nestjs)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.1-2D3748?logo=prisma)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)

> A production-ready, privacy-focused VPN backend service built with NestJS, featuring blind signature cryptography, multi-provider authentication, and subscription management.

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Technology Stack](#-technology-stack)
- [Project Structure](#-project-structure)
- [Module Overview](#-module-overview)
- [Getting Started](#-getting-started)
- [Docker Deployment](#-docker-deployment)
- [Database Management](#-database-management)
- [API Documentation](#-api-documentation)
- [Testing](#-testing)
- [Architecture](#-architecture)
- [Development Guide](#-development-guide)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 Overview

**KeenVPN Backend Service V2** is a modern, scalable REST API backend for a privacy-focused VPN service. It implements advanced cryptographic techniques (blind signatures) to ensure user anonymity, supports multiple authentication providers (Firebase, Google, Apple), and manages subscriptions through Stripe and Apple In-App Purchases.

### Key Highlights

- **Privacy-First**: Implements "Church & State" model separating user identity from VPN usage
- **Blind Signature Cryptography**: RSA-FDH blind signatures for anonymous VPN credentials
- **Multi-Provider Auth**: Firebase, Google OAuth, Apple Sign-In
- **Payment Integration**: Stripe subscriptions and Apple IAP
- **Production-Ready**: Comprehensive error handling, structured logging, rate limiting, and security middleware
- **Well-Tested**: Unit tests and E2E tests with Jest
- **Docker Support**: Multi-stage Dockerfile for optimized production builds

---

## ✨ Features

### Authentication & Authorization

- ✅ Firebase Authentication integration
- ✅ Google Sign-In (OAuth 2.0)
- ✅ Apple Sign-In
- ✅ Session-based authentication with Firebase tokens
- ✅ JWT token verification for Apple App Store Server API

### Subscription Management

- ✅ Stripe subscription lifecycle (create, cancel, renew)
- ✅ Apple In-App Purchase verification and management
- ✅ Trial period management with device fingerprinting
- ✅ Automated webhook handling (Stripe, Apple)
- ✅ Subscription status checks via Firebase token

### VPN Services

- ✅ Blind signature-based VPN credential generation
- ✅ Anonymous connection session tracking
- ✅ VPN server configuration management
- ✅ Token-based authentication (no user ID sent to VPN nodes)
- ✅ Deterministic credential generation from signed tokens

### Privacy & Security

- ✅ RSA-FDH blind signature implementation
- ✅ Church & State model (identity/usage separation)
- ✅ PII redaction in logs
- ✅ Rate limiting on sensitive endpoints
- ✅ Helmet.js security headers
- ✅ CORS configuration
- ✅ Request ID tracing

### Developer Experience

- ✅ Comprehensive Swagger/OpenAPI documentation
- ✅ Structured JSON logging with log levels
- ✅ Standardized error responses
- ✅ TypeScript strict mode
- ✅ Prisma ORM with migrations
- ✅ ESLint + Prettier code formatting
- ✅ Husky pre-commit hooks

---

## 🛠 Technology Stack

### Backend Framework

- **NestJS 11.0** - Progressive Node.js framework
- **TypeScript 5.7** - Type-safe JavaScript
- **Express.js** - HTTP server (NestJS platform)

### Database & ORM

- **PostgreSQL 16** - Primary relational database
- **Prisma 6.1** - Modern ORM with type safety
- **Redis 7** - Caching and session storage

### Authentication & Security

- **Firebase Admin SDK** - User authentication
- **jsonwebtoken** - JWT verification (Apple tokens)
- **jwks-rsa** - Apple public key management
- **Helmet.js** - Security headers middleware

### Payment Processing

- **Stripe SDK** - Subscription billing
- **Apple App Store Server API** - IAP verification

### Cryptography

- **Node.js crypto** - RSA-FDH blind signatures
- **Native crypto module** - Secure random generation

### API Documentation

- **@nestjs/swagger** - OpenAPI 3.0 documentation
- **swagger-ui-express** - Interactive API explorer

### Testing

- **Jest 30** - Testing framework
- **Supertest** - HTTP assertions for E2E tests
- **jest-mock-extended** - Advanced mocking

### Development Tools

- **ESLint 9** - Code linting
- **Prettier 3** - Code formatting
- **Husky 9** - Git hooks
- **lint-staged** - Pre-commit linting

---

## 📁 Project Structure

```
vpn-backend-service-v2/
├── src/
│   ├── account/                # Account management (delete, profile)
│   ├── auth/                   # Authentication (Firebase, Google, Apple)
│   │   ├── guards/            # Auth guards (SessionAuthGuard)
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── auth.module.ts
│   ├── common/                 # Shared utilities and components
│   │   ├── decorators/        # Custom decorators (ApiStandardResponse)
│   │   ├── dto/               # Data Transfer Objects
│   │   │   ├── response/      # Response DTOs (error, success, etc.)
│   │   │   └── *.dto.ts       # Request DTOs
│   │   ├── filters/           # Exception filters (HttpExceptionFilter)
│   │   ├── interceptors/      # Request/response interceptors
│   │   ├── interfaces/        # TypeScript interfaces
│   │   └── utils/             # Utility functions (SafeLogger)
│   ├── config/                 # VPN configuration management
│   ├── connection/             # Connection session tracking
│   ├── crypto/                 # Blind signature cryptography
│   ├── notifications/          # Push notification management
│   ├── payment/                # Payment processing
│   │   ├── apple/             # Apple IAP
│   │   └── stripe/            # Stripe integration
│   ├── prisma/                 # Prisma service module
│   ├── subscription/           # Subscription and trial management
│   ├── utils/                  # General utilities
│   ├── app.module.ts           # Root application module
│   ├── app.controller.ts       # Root controller
│   └── main.ts                 # Application entry point
├── prisma/
│   ├── migrations/             # Database migrations
│   ├── schema.prisma           # Prisma schema definition
│   └── seed-vpn-config.ts      # Database seeding script
├── test/
│   ├── e2e/                    # End-to-end tests
│   ├── unit/                   # Unit tests
│   └── setup/                  # Test configuration
├── .env.example                # Environment variables template
├── Dockerfile                  # Multi-stage production build
├── docker-compose.yml          # PostgreSQL + Redis services
├── package.json                # Dependencies and scripts
├── prisma/schema.prisma        # Database schema
└── tsconfig.json               # TypeScript configuration
```

---

## 📦 Module Overview

### 🔐 Auth Module (`src/auth/`)

Handles user authentication and session management.

**Features:**

- Firebase token verification
- Google OAuth 2.0 integration
- Apple Sign-In with JWT verification
- Session creation and validation
- User registration and login

**Endpoints:**

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/google` - Google Sign-In
- `POST /api/auth/apple` - Apple Sign-In
- `POST /api/auth/verify-session` - Verify active session

---

### 👤 Account Module (`src/account/`)

User account management and profile operations.

**Features:**

- Account deletion with cleanup
- User profile retrieval
- Payment history access

**Endpoints:**

- `DELETE /api/account` - Delete user account
- `GET /api/account/profile` - Get user profile
- `GET /api/account/payments` - Get payment history

---

### 💳 Payment Module (`src/payment/`)

Payment processing for Stripe and Apple IAP.

**Stripe Features:**

- Subscription creation and cancellation
- Webhook handling for billing events
- Customer portal session creation
- Payment history tracking

**Apple IAP Features:**

- Receipt validation
- Server-to-server notification handling
- Transaction verification
- Subscription status updates

**Endpoints:**

- `POST /api/payment/stripe/create-checkout-session` - Create checkout
- `POST /api/payment/stripe/webhook` - Stripe webhook handler
- `POST /api/payment/apple/verify` - Verify IAP receipt
- `POST /api/payment/apple/webhook` - Apple webhook handler

---

### 📋 Subscription Module (`src/subscription/`)

Manages user subscriptions and trial periods.

**Features:**

- Subscription status checks
- Trial eligibility determination
- Trial activation with device fingerprinting
- Subscription cancellation
- Auto-renewal management

**Endpoints:**

- `POST /api/subscription/status-session` - Check subscription status
- `POST /api/subscription/cancel` - Cancel subscription
- `GET /api/subscription/trial/check` - Check trial eligibility
- `POST /api/subscription/trial/activate` - Activate trial

---

### 🔐 Crypto Module (`src/crypto/`)

Implements RSA-FDH blind signature cryptography for anonymous VPN tokens.

**Features:**

- RSA key pair management
- Blind token signing
- Public key export (SPKI format)
- Rate limiting (5 requests/minute)

**Endpoints:**

- `GET /api/auth/vpn-token/public-key` - Get RSA public key
- `POST /api/auth/vpn-token` - Sign blinded token (requires auth)

---

### ⚙️ Config Module (`src/config/`)

VPN configuration and credential management.

**Features:**

- VPN server list retrieval
- Token-based credential generation
- Blind signature verification
- Church & State model implementation

**Endpoints:**

- `GET /api/config/vpn` - Get VPN server list
- `POST /api/config/vpn/credentials` - Generate VPN credentials (token-based)

---

### 🔌 Connection Module (`src/connection/`)

Tracks user connection sessions.

**Features:**

- Anonymous session recording
- User session tracking
- Connection metadata storage
- Blind signature verification

**Endpoints:**

- `POST /api/connection/session` - Record user session
- `POST /api/connection/session/anonymous` - Record anonymous session

---

### 🔔 Notifications Module (`src/notifications/`)

Push notification management.

**Features:**

- FCM token registration
- Push token management
- User notification preferences

**Endpoints:**

- `POST /api/notifications/register-token` - Register push token

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 20.x
- **npm** >= 10.x
- **PostgreSQL** >= 16.x (or use Docker)
- **Redis** >= 7.x (or use Docker)
- **Firebase Project** (for authentication)
- **Stripe Account** (for payments)
- **Apple Developer Account** (optional, for Apple IAP)

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/Keen-VPN/vpn-backend-service-v2.git
cd vpn-backend-service-v2
```

1. **Install dependencies**

```bash
npm install
```

1. **Set up environment variables**

```bash
cp .env.example .env
```

Edit `.env` and configure all required variables (see [Environment Configuration](#environment-configuration) below).

1. **Generate blind signing RSA key pair**

```bash
openssl genrsa -out blind_signing_key.pem 2048
```

Copy the contents of `blind_signing_key.pem` into the `BLIND_SIGNING_PRIVATE_KEY` environment variable (replace newlines with `\n`).

1. **Start PostgreSQL and Redis** (if using Docker)

```bash
docker-compose up -d
```

1. **Run database migrations**

```bash
npx prisma migrate deploy
```

1. **Generate Prisma Client**

```bash
npx prisma generate
```

1. **Seed VPN configuration** (optional)

```bash
npm run seed:vpn-config
```

1. **Start the development server**

```bash
npm run dev
```

The API will be available at `http://localhost:3000`.

---

### Environment Configuration

Create a `.env` file from `.env.example` and configure the following:

#### Required Variables

**Database**

```env
DATABASE_URL=postgresql://keen_user:keen_password@localhost:5432/keen_db?schema=public
```

**Firebase** (Get from Firebase Console → Project Settings → Service Accounts)

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY_ID=your-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id
```

**Stripe** (Get from Stripe Dashboard)

```env
STRIPE_SECRET_KEY=sk_test_your_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
```

**Blind Signing**

```env
BLIND_SIGNING_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nYOUR_KEY\n-----END RSA PRIVATE KEY-----\n"
```

#### Optional Variables

**Apple IAP** (Required for Apple In-App Purchases)

```env
APPLE_SHARED_SECRET=your_shared_secret
APPLE_KEY_ID=your_key_id
APPLE_ISSUER_ID=your_issuer_id
APPLE_BUNDLE_ID=com.yourcompany.yourapp
```

**Redis**

```env
REDIS_URL=redis://localhost:6379
```

**JWT**

```env
JWT_SECRET=your_jwt_secret_min_32_characters_long
```

**CORS**

```env
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

See `.env.example` for the complete list with descriptions.

---

## 🐳 Docker Deployment

### Development with Docker Compose

The project includes a `docker-compose.yml` for local development with PostgreSQL and Redis:

```bash
# Start databases
docker-compose up -d

# View logs
docker-compose logs -f

# Stop databases
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

### Production Docker Build

Build and run the application in a production container:

```bash
# Build the Docker image
docker build -t keenvpn-backend:latest .

# Run the container
docker run -d \
  -p 3000:3000 \
  --env-file .env \
  --name keenvpn-backend \
  keenvpn-backend:latest
```

The `Dockerfile` uses a multi-stage build:

- **Stage 1 (builder)**: Installs dependencies, generates Prisma client, builds TypeScript
- **Stage 2 (production)**: Production-only dependencies, optimized image size

---

## 🗄 Database Management

### Prisma Migrations

**Create a new migration**

```bash
npx prisma migrate dev --name <migration_name>
```

**Apply migrations to production**

```bash
npx prisma migrate deploy
```

**Reset database** (⚠️ WARNING: Deletes all data)

```bash
npx prisma migrate reset
```

**View migration status**

```bash
npx prisma migrate status
```

### Prisma Studio

Launch the database GUI:

```bash
npx prisma studio
```

Access at `http://localhost:5555`

### Database Seeding

Seed VPN server configuration:

```bash
npm run seed:vpn-config
```

---

## 📚 API Documentation

### Swagger UI

Interactive API documentation is available via Swagger UI:

**Local Development:**

```
http://localhost:3000/api
```

**Production:**

```
https://your-domain.com/api
```

### Features

- ✅ Interactive API explorer
- ✅ Request/response schemas
- ✅ Authentication flows
- ✅ Example payloads
- ✅ Try it out functionality

### Authentication in Swagger

1. Obtain a Firebase authentication token
2. Click **Authorize** button in Swagger UI
3. Enter: `Bearer <your-firebase-token>`
4. Click **Authorize** to save

---

## 🧪 Testing

### Run All Tests

```bash
npm test
```

### Unit Tests

```bash
npm run test:unit
```

### E2E Tests

```bash
npm run test:e2e
```

### Test Coverage

```bash
npm run test:cov
```

Coverage reports are generated in `./coverage/`

### Watch Mode

```bash
npm run test:watch
```

### Debug Tests

```bash
npm run test:debug
```

Then attach a debugger to `http://localhost:9229`

---

## 🏗 Architecture

### Blind Signature Implementation

The backend implements **RSA-FDH (Full Domain Hash)** blind signatures for anonymous VPN credential generation.

#### Flow

1. **Client** generates a random token (32-4096 bytes)
2. **Client** blinds the token using the server's RSA public key
3. **Client** sends blinded token to `POST /api/auth/vpn-token` (requires authentication)
4. **Server** signs the blinded token with its RSA private key
5. **Client** unblinds the signature
6. **Client** requests VPN credentials via `POST /api/config/vpn/credentials` with `{ token, signature, serverId }`
7. **Server** verifies signature and generates:
   - **Username**: `token_<base64_prefix>` (e.g., `token_abc123...`)
   - **Password**: `SHA-256(token + signature)`
8. **VPN Node** authenticates using these credentials (no user metadata)

#### Security Features

- ✅ **Authentication Required**: Only authenticated users can get tokens signed
- ✅ **Rate Limiting**: 5 requests/minute on signing endpoint
- ✅ **Signature Verification**: Credentials endpoint verifies RSA signature
- ✅ **Deterministic Credentials**: Same token+signature always generates same credentials
- ✅ **No User Tracking**: VPN nodes only see token-derived credentials

---

### Church & State Model

The **Church & State** model ensures complete separation between:

- **Church**: User identity, payments, subscriptions (backend database)
- **State**: VPN connection logs, IP addresses (VPN nodes)

#### Privacy Guarantees

1. **No User ID in VPN Credentials**: Only token-derived usernames
2. **Backend Cannot Correlate**: Backend knows payment status but not VPN usage
3. **VPN Nodes Cannot Identify**: VPN nodes see credentials but not user identity
4. **Anonymous Sessions**: Connection sessions can be recorded without user linkage

#### Implementation

```typescript
// Generate credentials (src/config/vpn-config.service.ts)
const username = `token_${token.substring(0, 16)}`;
const password = createHash('sha256')
  .update(token + signature)
  .digest('hex');
```

This ensures:

- VPN credentials are ephemeral and token-bound
- No database lookups needed for authentication
- User privacy is preserved at the protocol level

---

### Error Handling & Logging

#### Standardized Error Responses

All API errors return a consistent JSON structure:

```json
{
  "success": false,
  "error": {
    "code": "Bad Request",
    "message": "Validation failed",
    "details": ["email must be a valid email"]
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "path": "/api/auth/register",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### Structured Logging

The `SafeLogger` utility provides:

- **JSON-formatted logs** for easy parsing
- **Log levels**: DEBUG, INFO, WARN, ERROR
- **Context tracking**: service, requestId, userId
- **PII redaction**: Automatically redacts sensitive fields
- **Environment-aware**: DEBUG logs disabled in production

**Example:**

```typescript
SafeLogger.info('User logged in successfully', {
  service: 'AuthService',
  requestId: 'abc-123',
  userId: 'user-456'
});
```

**Output:**

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "INFO",
  "message": "User logged in successfully",
  "context": {
    "service": "AuthService",
    "requestId": "abc-123",
    "userId": "user-456"
  }
}
```

---

## 💻 Development Guide

### Code Style

The project uses ESLint and Prettier for code quality:

```bash
# Lint code
npm run lint

# Format code
npm run format
```

Pre-commit hooks (Husky + lint-staged) automatically format and lint staged files.

### Adding a New Module

1. **Generate module scaffold**

```bash
nest generate module <module-name>
nest generate controller <module-name>
nest generate service <module-name>
```

1. **Create DTOs** in `src/common/dto/`
2. **Add Swagger decorators** using `@ApiStandardResponse`
3. **Implement business logic** in service
4. **Add tests** in `test/unit/<module-name>/`
5. **Update this README** with module documentation

### Database Schema Changes

1. **Edit** `prisma/schema.prisma`
2. **Create migration**: `npx prisma migrate dev --name <change_description>`
3. **Test migration**: Run tests to verify schema changes
4. **Commit migration**: Include migration files in git

### Environment Variables

Add new environment variables to:

1. `.env.example` with description
2. `src/config/configuration.ts` for validation (if using Joi)
3. This README's [Environment Configuration](#environment-configuration) section

---

## 🐛 Troubleshooting

### Common Issues

#### 1. Database Connection Errors

**Error:** `Can't reach database server at localhost:5432`

**Solution:**

```bash
# Ensure PostgreSQL is running
docker-compose up -d postgres

# Verify connection
docker-compose exec postgres psql -U keen_user -d keen_db
```

#### 2. Prisma Client Not Generated

**Error:** `Cannot find module '@prisma/client'`

**Solution:**

```bash
npx prisma generate
```

#### 3. Firebase Authentication Fails

**Error:** `Firebase service account credentials are invalid`

**Solution:**

- Verify `FIREBASE_PRIVATE_KEY` has proper newlines (`\n`)
- Check `FIREBASE_PROJECT_ID` matches your Firebase project
- Ensure service account has proper permissions

#### 4. Port Already in Use

**Error:** `EADDRINUSE: address already in use :::3000`

**Solution:**

```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or use a different port
PORT=3001 npm run dev
```

#### 5. Stripe Webhook Signature Verification Fails

**Error:** `Webhook signature verification failed`

**Solution:**

- Use Stripe CLI for local testing: `stripe listen --forward-to localhost:3000/api/payment/stripe/webhook`
- Verify `STRIPE_WEBHOOK_SECRET` matches the webhook endpoint secret
- Ensure raw body parsing is enabled (already configured in `main.ts`)

### Logging

Enable debug logs:

```bash
NODE_ENV=development npm run dev
```

View structured logs in JSON format for easy parsing with tools like `jq`:

```bash
npm run dev | jq
```

---

## 🤝 Contributing

### Development Workflow

1. Create a feature branch: `git checkout -b feature/KVPN-XXX-description`
2. Make changes and commit: `git commit -m "feat: description"`
3. Push to origin: `git push origin feature/KVPN-XXX-description`
4. Create a Pull Request to `staging` branch
5. Ensure all tests pass and code is reviewed
6. Merge after approval

### Commit Message Convention

Follow conventional commits:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Build process or auxiliary tool changes

---

## 📄 License

This project is proprietary software. All rights reserved.

---

## 📞 Support

For questions or support:

- 📧 Email: <support@keenvpn.com>
- 📝 Jira: [KVPN Project](https://keenvpn.atlassian.net/jira/software/projects/KVPN)
- 💬 Slack: #backend-team

---

## ⚠️ Known Limitations & Future Work

### Account Deletion

- **VPN Data Cleanup Webhook** ([account.service.ts:105](file:///Users/deimos/Workspace/keenvpn/vpn-backend-service-v2/src/account/account.service.ts#L105)): Currently, when a user deletes their account via the `/api/account` DELETE endpoint, VPN service data cleanup must be performed manually. A future implementation will trigger an automatic webhook to the VPN infrastructure for comprehensive data cleanup.

- **Stripe Customer Data Retention** ([account.service.ts:106](file:///Users/deimos/Workspace/keenvpn/vpn-backend-service-v2/src/account/account.service.ts#L106)): Stripe customer data is currently retained for billing history and compliance purposes. Consider implementing optional deletion for GDPR right-to-erasure requests.

### API Documentation

- **Invoice PDF Response** ([account.controller.ts:102](file:///Users/deimos/Workspace/keenvpn/vpn-backend-service-v2/src/account/account.controller.ts#L102)): The `/api/account/invoices/:invoiceNumber` endpoint returns binary PDF with custom `Content-Type: application/pdf` header. Standard API response decorator is not applicable for binary file responses.

### VPN Configuration

- **Token-Based VPN Authentication** ([vpn-config.service.ts:322](file:///Users/deimos/Workspace/keenvpn/vpn-backend-service-v2/src/config/vpn-config.service.ts#L322)): VPN servers currently use static credentials from the configuration. Token-based credential derivation code is prepared but commented out, pending VPN server infrastructure update to accept dynamically-generated credentials.

---

## 🗺 Roadmap

- [ ] GraphQL API support
- [ ] Multi-region VPN node support
- [ ] WebSocket connections for real-time updates
- [ ] Admin dashboard API
- [ ] Advanced analytics and reporting
- [ ] Kubernetes deployment manifests
- [ ] CI/CD pipeline configuration

---

**Built with ❤️ by the KeenVPN Team**
