# Purple City Orchid

An 18+ campus-focused dating app, organized as a monorepo.

## Repository structure

```text
Purple-City-Orchid/
├── backend/              # TypeScript, Express, Prisma API
│   ├── prisma/            # Prisma schema and database migrations
│   ├── src/
│   ├── tests/
│   ├── .env.example
│   ├── package.json
│   └── package-lock.json
├── frontend/              # Frontend application (to be added)
├── .gitignore
└── README.md
```

The backend and frontend are maintained in one Git repository but can be developed and deployed independently.

## Backend

The backend is an API-only service built with TypeScript, Express, and Prisma, using PostgreSQL.

### Current capabilities

- `GET /health` provides an API liveness check; it does not verify database availability.
- `GET /api/v1` returns API version metadata.
- Prisma manages the PostgreSQL schema and versioned migrations.
- Environment variables are validated at startup.
- Request validation and centralized JSON error handling.
- Pino application and HTTP request logging.
- Helmet security headers, request-body size limits, API rate limiting, and a configurable CORS allowlist.
- Automated tests for health checks, request validation, and error handling.

Firebase Authentication, Cloudflare R2, Socket.IO, and Paystack are planned future integrations. They are not provisioned or connected in the current phase.

### Requirements

- Node.js 20 or newer
- PostgreSQL for database operations and migrations

### Local development

Run backend commands from the `backend/` directory:

```powershell
cd backend
npm ci
npm run dev
```

The development server listens on `0.0.0.0` using `PORT`, which defaults to `5000`.

### Environment configuration

Copy `backend/.env.example` to `backend/.env` and set the required values for your local environment.

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Runtime environment; defaults to development. |
| `PORT` | HTTP port; defaults to `5000`. |
| `DATABASE_URL` | PostgreSQL connection URL for Prisma. Required for database operations and production startup. |
| `FRONTEND_ORIGINS` | Comma-separated list of allowed frontend origins. |
| `LOG_LEVEL` | Pino logging level; defaults to `info`. |

Never commit `.env` files or expose credentials in frontend configuration.

The API can start without a database URL in development so the health endpoint remains usable. Database operations require a valid PostgreSQL connection.

### Database and migrations

Run the following commands from `backend/`:

```powershell
npm run db:validate
npm run db:generate
```

To create a development migration after changing `prisma/schema.prisma`:

```powershell
npm run db:migrate -- --name describe_your_change
```

To apply committed migrations in a deployment environment:

```powershell
npm run db:migrate:deploy
```

Do not run destructive development migration commands against production.

### Tests and build

From `backend/`:

```powershell
npm test
npm run build
npm start
```

The build generates the Prisma client and compiles TypeScript into `backend/dist/`.

## Deployment

### Backend on Render

Configure the Render service to use `backend/` as its **Root Directory**.

- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Required production environment: `NODE_ENV=production`, a valid `DATABASE_URL`, and the appropriate `FRONTEND_ORIGINS`.
- Run `npm run db:migrate:deploy` as a release or pre-deploy step before starting the new application version.

The service listens on `0.0.0.0` and honors the hosting platform's `PORT`.

### Frontend on Vercel

The `frontend/` directory is reserved for the frontend application. Once it is added, configure Vercel to use `frontend/` as its Root Directory and set its build settings according to the frontend framework.

The frontend framework and deployment settings have not yet been configured in this repository.

## Security

- Do not commit secrets, local environment files, or generated dependencies.
- Keep database credentials on the backend; never expose them to the browser.
- Restrict CORS to the frontend origins you intend to allow.
- Apply database migrations deliberately and review schema changes before deployment.
