# KeenVPN Backend Service V2

[![NestJS](https://img.shields.io/badge/NestJS-11.0-E0234E?logo=nestjs)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.1-2D3748?logo=prisma)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)

> A production-ready, privacy-focused VPN backend service built with NestJS. Features include blind signature cryptography (for anonymous access), usage aggregation, active node synchronization, and automated subscription management.

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Technology Stack](#-technology-stack)
- [Module Overview](#-module-overview)
- [Architecture](#-architecture)
- [Getting Started](#-getting-started)
- [Deployment (Netlify)](#-deployment-netlify)
- [Database Management](#-database-management)
- [Testing](#-testing)

---

## 🎯 Overview

**KeenVPN Backend Service V2** serves as the central control plane for the KeenVPN ecosystem. It manages users, subscriptions (Stripe/Apple), VPN credentials via cryptographic blind signing, and realtime metric tracking through periodic synchronization with dedicated "Node Daemons" running on individual VPN servers.

This architecture ensures high privacy for end-users by decoupling usage tracking from identities, and it ensures high availability by continuously calculating a \`healthScore\` for active nodes.

---

## ✨ Features

- **Privacy-First (Church & State)**: Complete segregation between user payments ("Church") and VPN connection logging/IP assignment ("State") using **RSA-FDH Blind Signatures**.
- **Dynamic Node Loading & IP Allocation**: Node Daemons sync heartbeats every 60 seconds with this backend. The backend dynamically calculates node \`healthScore\` based on active clients and uptime. Clients receive IP assignments and VPN routing details mapped to the healthiest available nodes.
- **Aggregated Usage Metrics**: Client bandwidth is streamed to the backend periodically. Analytics are stored as \`SessionAggregate\` components that completely obscure individual traffic histories.
- **B2B Capabilities**: Provides contact management APIs for KeenVPN Business users (\`SalesContact\` module).
- **Billing**: Manages Stripe webhooks, Apple App Store Server integrations, trials, and user session token management natively.

---

## 🛠 Technology Stack

- **Framework**: NestJS 11.x
- **Language**: TypeScript (Strict Mode)
- **Database**: PostgreSQL
- **ORM**: Prisma (w/ Migrations)
- **Caching**: Redis
- **Security**: Helmet, `@nestjs/throttler` (Rate Limiting), custom Crypto utilities.
- **Serverless Runtime**: `@vendia/serverless-express` setup for zero-downtime execution in AWS Lambda / Netlify.
- **Tooling**: ESLint, Prettier, Husky, lint-staged, Jest, Supertest.

---

## 📦 Module Overview

The `src` directory is functionally grouped into highly cohesive domain modules:

- **🔐 `auth`**: Firebase admin integration, Token parsing, user registration, Google OAuth, and Apple Sign-In implementations.
- **👤 `account`**: Account deletion and profiling. Includes data scrub routines.
- **🎛 `config`**: The **VPN Config** endpoints (`/api/config/vpn`). Returns dynamically generated VPN connection sets using blind-signed tokens, allowing nodes to remain entirely untied from Firebase user IDs.
- **🖥 `nodes`**: The sync engine (`/api/nodes`). VPN Nodes submit heartbeats here, transferring usage bytes, and authenticating via a static `NODE_TOKEN`. Generates dynamic IP addresses (CIDRs) on the fly for connecting clients.
- **🔌 `connection`**: Manages connection lifecycles tracking session starts, ends, and termination reasons for debugging disconnects (fully disconnected from PII).
- **📋 `subscription`**: Handles checks for active subscriptions, trials (using device fingerprinting hashes), and returns available plans endpoints (`/api/subscription/plans`).
- **💳 `payment`**: Processes incoming Stripe webhooks and Apple App Store asynchronous server alerts.
- **🔐 `crypto`**: Generates and handles RSA-FDH cryptography to support anonymous WireGuard tokens.
- **💼 `sales-contact`**: Specialized B2B landing page endpoints.
- **⭐ `preferences` & 🔔 `notifications`**: Stores region preferences and FCM tokens.

---

## 🏗 Architecture

### 1. The "Church & State" Data Barrier

The API is uniquely partitioned:

1. **User Side**: A user buys a subscription and logs in with Firebase.
2. **Access Side**: The user requests a **Base64 VPN Token**. Before they connect, the backend mathematically blinds the token. The backend subsequently receives unblinded requests for VPN endpoint generation. Thus, the database cannot correlate Stripe payments with WireGuard public keys.
3. **Node Side**: The client takes the generated connection details directly to the VPN Node Daemon without ever providing an identity token.

### 2. Node Auto-scaling Architecture

Rather than maintaining a rigid database mapping for nodes, nodes call the `PUT /api/nodes/:publicKey/sync` endpoint regularly. The node transmits its stats (running connections, total bytes, `wireguard` state), and the backend acknowledges this heartbeat.

If a user tries to connect, the `VPNConfig` service identifies the node with the highest `healthScore` matching their region preference and returns an `allowedIps` block strictly scoped to them.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 18.x
- **PostgreSQL** >= 14
- **Redis** >= 7
- **Stripe / Firebase Account** (Keys required).

### Installation & Local Setup

1. **Clone & Install**:

   ```bash
   git clone .../vpn-backend-service-v2.git
   cd vpn-backend-service-v2
   npm install
   ```

2. **Environment Configuration**:

   ```bash
   cp .env.example .env
   ```

   *Note: Populate `DATABASE_URL`, `REDIS_URL`, `FIREBASE_*`, `STRIPE_*`, `NODE_TOKEN` and generate an RSA key inside `BLIND_SIGNING_PRIVATE_KEY`.*

3. **Database Initialization**:

   ```bash
   npx prisma generate
   npx prisma migrate deploy
   ```

4. **Launch Application**:

   ```bash
   npm run start:dev
   ```

*(See `.env.example` for comprehensive parameter listings).*

---

## ☁️ Deployment (Netlify)

This backend is structured as a single API endpoint handler deployed via Serverless architecture onto Netlify Functions, eliminating the need for cold Docker processes.

1. Netlify uses `netlify.toml` which rewrites all paths to `/.netlify/functions/server`.
2. The continuous deployment pipeline naturally connects to the GitHub repository. It runs:

   ```bash
   prisma generate && prisma migrate deploy && npm run build
   ```

3. Environmental variables exceeding standard length (like `FIREBASE_PRIVATE_KEY`) can be fetched at runtime through alternative secret managers or compressed directly in the Netlify dashboard.

---

## 🗄 Database Management

Leveraging Prisma, migration strategies are fully automated:

- **Create a New Migration**: `npx prisma migrate dev --name <migration_name>`
- **Wipe Database completely**: `npx prisma migrate reset`
- **View Migrations**: `npx prisma migrate status`
- **GUI Administration**: `npx prisma studio` (Available at localhost:5555)

---

## 🧪 Testing

The repository relies on standard NestJS testing paradigms heavily isolated through dependency injection.

- **Fast Unit Tests**: `npm run test:unit`
- **Coverage Check**: `npm run test:cov` (Outputs to `./coverage/`)
- **E2E Controller Tests**: `npm run test:e2e`

*Note: You may need a test container PostgreSQL database running to execute the full E2E suite gracefully.*
