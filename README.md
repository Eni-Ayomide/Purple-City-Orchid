# Purple Hearts API

Phase 0 is a backend foundation for the 18+ campus-focused Purple Hearts app. It is an API-only service; the frontend is developed separately.

## Current scope

- TypeScript and Express REST API, with public API routes grouped under `/api/v1`.
- `GET /health` for an API liveness check. It does not claim to verify database availability.
- Prisma configured for PostgreSQL, with a minimal `users` table and an initial migration.
- Validated environment configuration, request-body validation middleware, centralized JSON errors, and Pino request/application logging.
- Helmet security headers, a 100 KB JSON body limit, API rate limiting, and an explicit frontend-origin CORS allowlist.
- Tests for health, invalid requests, unknown routes, malformed JSON, and unexpected errors.

Firebase Authentication, Cloudflare R2, Socket.IO, and Paystack are future architecture only. No external service is provisioned or connected in this phase.

## Project structure

```text
prisma/
  migrations/           # Versioned PostgreSQL migrations
  schema.prisma
src/
  config/               # Environment validation and logging
  controllers/          # HTTP request handlers
  db/                   # Prisma client
  errors/               # Typed API errors
  middleware/           # Error handling and 404 responses
  routes/               # Health and versioned API routes
  services/             # Reusable application logic
  validation/           # Request validation middleware
tests/                  # API and middleware tests
```

## Requirements and installation

- Node.js 20 or newer
- A PostgreSQL database for database operations and migrations

Install dependencies:

```sh
npm ci
```

Copy `.env.example` to `.env` and replace the placeholder database URL with a PostgreSQL connection string:

```sh
cp .env.example .env
```

The app can start in development without a database URL so `/health` remains usable. Database operations require a real PostgreSQL connection. Production startup requires `DATABASE_URL`; the service does not fall back to a mock database.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `NODE_ENV` | No | `development`, `test`, or `production`; defaults to `development`. |
| `PORT` | No | HTTP port; defaults to `5000`. The hosting platform's `PORT` is honored. |
| `DATABASE_URL` | Production | PostgreSQL connection URL used by Prisma. Supply it in development before running migrations or database operations. |
| `FRONTEND_ORIGINS` | No | Comma-separated exact frontend origins allowed by CORS, for example `https://app.example.com`. |
| `LOG_LEVEL` | No | Pino level: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, or `silent`; defaults to `info`. |

Invalid values cause startup to fail with a configuration error. Do not commit `.env` or put secrets in frontend configuration.

## Local development

```sh
npm run dev
```

The API binds to `0.0.0.0` and uses `PORT` (default `5000`).

Available endpoints:

- `GET /health` — liveness response; does not expose secrets or database credentials.
- `GET /api/v1` — API version metadata.

## Database and migrations

Prisma uses the PostgreSQL URL from `DATABASE_URL`. The committed initial migration creates only the minimal `users` table; it does not implement dating, authentication, or profile features.

For local development, apply pending migrations and create new ones with:

```sh
npm run db:migrate -- --name init
```

After changing `prisma/schema.prisma`, create a migration with a descriptive name and commit both the schema and generated migration. To check the schema and regenerate the Prisma client:

```sh
npm run db:validate
npm run db:generate
```

For production, apply committed migrations with:

```sh
npm run db:migrate:deploy
```

Run production migrations as a deployment/release step before starting the new application version. Do not use `prisma migrate dev`, `prisma migrate reset`, or other destructive development commands against production.

## Build and tests

```sh
npm test
npm run build
```

Tests do not connect to PostgreSQL. The build generates the Prisma client and compiles TypeScript to `dist/`.

## Render deployment

Create a Render web service using:

- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Environment: `NODE_ENV=production`, a real `DATABASE_URL`, and the production `FRONTEND_ORIGINS` allowlist.
- Release/pre-deploy step: `npm run db:migrate:deploy`

The server listens on `0.0.0.0` and uses the `PORT` provided by Render. No paid services are created by this project setup.
