# EdgeGuard v3.0

Institutional-style quantitative trading and monitoring dashboard focused on defending against market microstructure traps such as latency arbitrage, spoofing, and slippage. The platform combines real-time ingestion, risk agents, dashboard analytics, and an on-chain receipt trail.

## Architecture Overview

EdgeGuard is organized as a pnpm monorepo.

### Workspace layout

- `artifacts/*` — runnable applications
- `api-server` — Express 5 backend and live-feed ingestion
- `edgeguard` — React 18 + Vite frontend dashboard
- `mockup-sandbox` — experimentation / sandbox surface
- `lib/*` — shared libraries and generated packages
- `api-spec` — OpenAPI source of truth
- `api-client-react` — generated React Query client hooks
- `api-zod` — generated Zod validators
- `db` — Drizzle schema and database access
- `scripts` — repository automation and utility scripts

## Stack

### Backend

- Node.js 24
- TypeScript 5.9
- Express 5
- PostgreSQL
- Drizzle ORM
- Zod / drizzle-zod

### Frontend

- React 18
- Vite
- Wouter
- TanStack Query
- shadcn/ui
- Recharts
- Framer Motion
- next-themes

### Tooling

- pnpm workspaces
- Orval for OpenAPI-driven client generation
- esbuild for bundling

## Core System Concepts

### 1. OpenAPI-first contracts

The API contract lives in `lib/api-spec/openapi.yaml`. Generated React Query hooks and validators should be regenerated whenever the API spec changes.

### 2. Lifecycle-aware fixture ingestion

Fixtures move through operational states such as:

- `discovered`
- `upcoming`
- `prematch_monitoring`
- `live`
- `halftime`
- `finished`
- `archived`

The backend poller should use these states to determine how aggressively each fixture is monitored.

### 3. Current state + historical persistence

- `fixtures` stores the canonical current state for each fixture
- `odds_snapshots` stores append-only odds history
- `score_events` stores append-only score / timeline history

### 4. Dashboard operating modes

The UI is expected to support:

- live match view
- pre-match monitoring view
- no-live-match idle view
- degraded feed visibility

## Running the project

### Install

```bash
pnpm install
```

### Start backend

```bash
pnpm --filter @workspace/api-server run dev
```

Backend default port: `8080`

### Start frontend

```bash
pnpm --filter @workspace/edgeguard run dev
```

Frontend default port: `18486`

### Typecheck

```bash
pnpm run typecheck
```

### Build

```bash
pnpm run build
```

### Database workflow

After schema changes in `lib/db/src/schema/`, push the DB changes in development:

```bash
pnpm --filter @workspace/db run push
```

### API/client generation workflow

After changing `lib/api-spec/openapi.yaml`, regenerate clients and validators:

```bash
pnpm --filter @workspace/api-spec run codegen
```

## Environment

Required:

- `DATABASE_URL` — PostgreSQL connection string

## Important operational notes

### Wouter routing

Dashboard routing requires both `/dashboard` and `/dashboard/*` routes when nesting dashboard sub-routes.

### Background polling

The live ingestion poller starts from the backend process. For real always-on monitoring, deploy the backend in an environment that does not sleep when there are no active users.

### Wallet / execution model

Wallet execution, read-only mode, autopilot approval, and receipt lifecycle controls are planned hardening workstreams and should be treated as explicit control-plane features, not implicit UI behavior.

## Current hardening priorities

- lifecycle-aware fixture state model
- robust live-feed client normalization
- background ingestion durability
- no-live-match dashboard UX
- wallet/read-only/manual/autopilot approval controls

## Known limitations

- Wouter nested routing requires exact and wildcard dashboard routes.
- Schema changes must be pushed manually in development.
- OpenAPI code generation must be rerun after spec changes.
- A sleeping host will interrupt background ingestion even if the poller logic is correct.
