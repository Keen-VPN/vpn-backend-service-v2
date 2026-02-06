<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
  <h1 align="center">KeenVPN Backend Service V2</h1>
</p>

## 📋 Overview

The **KeenVPN Backend Service V2** is a privacy-first, scalable backend architecture designed to power the next generation of VPN applications. It implements the "Church & State" separation model using RSA Blind Signatures to ensure that user identity (payment/subscription) is cryptographically decoupled from VPN usage logs.

### Key Features

- **Privacy-First Architecture**: Zero-knowledge separation between identity and activity.
- **Blind Signatures**: RSA-FDH (Full Domain Hash) blind signatures for anonymous credential issuance.
- **Church & State Model**: Strict separation of concerns between Auth Service and VPN Config Service.
- **Scalable**: Built on NestJS, Redis, and PostgreSQL for high performance.

---

## 🛠 Tech Stack

- **Framework**: [NestJS](https://nestjs.com/) (v11) - Progressive Node.js framework.
- **Language**: TypeScript - Strongly typed for reliability.
- **Database**: PostgreSQL (via [Prisma ORM](https://www.prisma.io/)).
- **Caching & Queues**: Redis (via `ioredis`).
- **Authentication**: Firebase Admin SDK (Identity) + JWT.
- **Payments**: Stripe Integration.
- **Documentation**: Swagger / OpenAPI.
- **Testing**: Jest (Unit & E2E).

---

## 🏗 Architecture & Design

### The "Church & State" Model

We separate the system into two distinct logical domains:

1. **"Church" (Identity & Payment)**: Knows *who* the user is, their email, and their subscription status.
2. **"State" (VPN Usage)**: Knows *that* a user connected, but not *who* they are.

### How It Works (Blind Signatures)

1. **Token Generation**: The client generates a random, cryptographically secure token.
2. **Blinding**: The client "blinds" this token and sends it to the **Auth Service** (Church).
3. **Signing**: The Auth Service verifies the user has an active subscription. If valid, it signs the *blinded* token using a private RSA key and returns the signature. The Auth Service *cannot* see the actual token.
4. **Unblinding**: The client "unblinds" the signature to get a valid signature for the original token.
5. **Redemption**: The client sends the *original* token + the *unblinded* signature to the **VPN Config Service** (State).
6. **Verification**: The VPN Config Service verifies the signature against the public key. If valid, it issues ephemeral VPN credentials (username/password) derived from the token.
7. **Result**: The VPN Config Service grants access without ever knowing who the user is.

---

## 📂 Folder Structure

The project follows a modular NestJS structure in `src/`:

- **`/auth`**: User authentication, Apple/Google sign-in, and **Blind Signature** signing logic.
- **`/config`**: Configuration management and VPN Credential issuance (the "State" side).
- **`/connection`**: Session management, anonymous session tracking, and connection stats.
- **`/payment`**: Stripe payment processing and webhook handling.
- **`/subscription`**: Subscription lifecycle management (upgrades, cancellations, trial status).
- **`/redemption`**: Service for redeeming blind-signed tokens for VPN credentials.
- **`/common`**: Shared utilities (Logger, Guards, Interceptors, DTOs).
- **`/prisma`**: Database models and schema.
- **`/redis`**: Redis client module for rate limiting and temporary state.

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- Docker & Docker Compose
- Yarn or NPM

### 1. Installation

```bash
yarn install
```

### 2. Environment Setup

Copy the example environment file and fill in the required values:

```bash
cp .env.example .env
```

*See [Environment Variables](#-environment-variables) below for details.*

### 3. Run Locally (Docker)

Start the database and Redis services using Docker:

```bash
npm run docker:up
```

This spins up:

- Postgres (Port 5432)
- Redis (Port 6379)

Then start the application logic:

```bash
# Watch mode (Development)
$ yarn run start:dev
```

The server will start at `http://localhost:3000`.

### 4. Database Setup

Run migrations to set up the schema:

```bash
npx prisma migrate dev
npm run seed:vpn-config  # Optional: Seeds initial VPN servers
```

---

## 📚 API Documentation (Swagger)

Once the application is running, full interactive API documentation is available at:

👉 **<http://localhost:3000/api/docs>**

This includes schemas for all DTOs, auth requirements, and example responses.

---

## 🧪 Testing

We use **Jest** for testing.

### Unit Tests

Run isolated unit tests for services and controllers:

```bash
yarn run test:unit
```

### End-to-End (E2E) Tests

Run integration tests connecting to a test database/container:

```bash
yarn run test:e2e
```

### Test Coverage

View detailed coverage reports:

```bash
yarn run test:cov
```

---

## 🌍 Environment Variables

Key variables in `.env`:

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | Environment (`development`, `staging`, `production`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection URL |
| `BLIND_SIGNING_PRIVATE_KEY` | **Critical**. RSA Private Key (PEM) for signing blind tokens. Must match Public Key in clients. |
| `STRIPE_SECRET_KEY` | Stripe requirements for payments. |
| `FIREBASE_*` | Firebase Admin credentials for verifying user Identity Tokens. |
| `JWT_SECRET` | Secret for internal session tokens. |

*Refer to `.env.example` for the complete list.*

---

## ⚠️ "Gotchas" & Need-to-Know

1. **RSA Key Format**: The `BLIND_SIGNING_PRIVATE_KEY` must be a valid RSA PEM key (2048+ bits). Ensure newline characters (`\n`) are correctly escaped if providing it as a single-line string in CI/CD variables.
2. **Blind Signature Libs**: Clients must use a compatible implementation of **RSA-FDH** (Full Domain Hash).
3. **Database Migration**: Always verify migrations in `staging` before `production`. We use Prisma Migrate.
4. **Church & State**: When debugging, remember that `AuthService` logs will have User IDs, but `VPNConfigService` logs will ONLY have anonymous Token hashes. You cannot correlate them easily—**this is by design**.

---

## 📦 Deployment

The application is containerized using Docker.

### Build

```bash
npm run docker:build
```

### Production Run

In production, we typically run:

```bash
yarn run start:prod
```

Ensure `NODE_ENV=production` is set to enable optimizations and disable verbose logging.

---

## 🤝 Contributing

1. Create a feature branch (`git checkout -b feature/amazing-feature`).
2. Commit your changes following [Conventional Commits](https://www.conventionalcommits.org/).
3. Ensure tests pass (`yarn run test`).
4. Push to the branch and open a Pull Request.

---

<p align="center">
  Generated by Antigravity for KeenVPN.
</p>
