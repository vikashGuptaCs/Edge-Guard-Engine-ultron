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

## Verification And Rollout

Use this sequence after Phases 1–9 or any lifecycle/feed-health changes so rollout proves the stack is wired correctly instead of only compiling.

### Required command order

Run these in order:

```bash
pnpm run typecheck
```

If `lib/api-spec/openapi.yaml` changed:

```bash
pnpm --filter @workspace/api-spec run codegen
```

If `lib/db/src/schema/` changed and the target environment has a valid `DATABASE_URL`:

```bash
pnpm --filter @workspace/db run push
```

Then run the full build:

```bash
pnpm run build
```

Guidance:

- Commit generated client changes whenever codegen updates `lib/api-client-react` or `lib/api-zod`.
- If schema push cannot run in the current environment, verify the schema compiles and note that DB push is still required before deployment.
- Stop rollout if typecheck, codegen, DB push, or build exposes a real mismatch.

### Backend smoke verification

The backend requires an explicit `PORT`. Use `8080` for the standard smoke test:

```bash
PORT=8080 pnpm --filter @workspace/api-server run dev
```

Verify:

- server boots without an immediate crash
- `/health` responds and includes poller runtime state
- `poller.active` is `true` when runtime config is valid
- `poller.active` is `false` with a visible reason when `TXLINE_API_TOKEN` is missing
- cycle timestamps update over time while the poller is running
- graceful shutdown stops the poller cleanly

Useful checks:

```bash
curl http://127.0.0.1:8080/health
curl http://127.0.0.1:8080/api/healthz
curl http://127.0.0.1:8080/api/fixtures?limit=5
curl http://127.0.0.1:8080/api/dashboard/summary
curl http://127.0.0.1:8080/api/alerts?limit=5
```

### Frontend smoke verification

The frontend defaults to Vite port `4173`. Use `18486` explicitly for the dashboard smoke test:

```bash
PORT=18486 pnpm --filter @workspace/edgeguard run dev
```

Verify these routes render:

- `/dashboard`
- `/dashboard/matches`
- `/dashboard/agents`
- `/dashboard/alerts`
- `/dashboard/receipts`
- `/dashboard/settings`

This repo depends on both `/dashboard` and `/dashboard/*` Wouter routes being present. Re-check both whenever dashboard routing changes.

### Lifecycle verification checklist

Confirm the lifecycle model and polling cadence behave correctly across these scenarios:

- fixture more than 6 hours before kickoff: `monitoringState=discovered` and no heavy live polling
- fixture within 6 hours of kickoff: `monitoringState=upcoming`
- fixture within 30 minutes of kickoff: `monitoringState=prematch_monitoring`
- live transition: `monitoringState=live`, `firstLiveAt` stamped once, updates-first polling path used
- live fixture with repeated empty updates: snapshot fallback activates and `feedHealth` shows degraded/fallback behavior
- halftime or paused fixture: reduced cadence continues and fixture stays visible
- finished fixture: `finishedAt` stamped once, limited finalization passes run, fixture remains visible as a recent result
- archived fixture after retention window: `monitoringState=archived` and no active heavy polling

### API contract checks

Verify fixture responses include lifecycle and freshness fields:

- `monitoringState`
- `feedHealth`
- `lastSuccessfulIngestAt`
- `countdownMs`
- `isLive`
- `isFinished`
- `dataFreshnessMs`

Verify dashboard and alert responses expose operating context:

- dashboard responses distinguish live vs non-live fixtures explicitly
- dashboard responses expose feed-health or freshness context where expected
- recent finished fixtures remain queryable where designed
- alert responses include lifecycle and feed-health context
- degraded or error feed states suppress or downgrade alerts appropriately

### Dashboard operating modes

Manually confirm `/dashboard` handles:

- live mode
- prematch mode
- idle mode
- degraded mode

Expected behavior:

- no blank screen when no fixtures are live
- quiet periods are distinct from feed degradation
- live widgets tolerate empty arrays safely
- recent finished fixtures can still be surfaced

### Rollout summary

Every verification handoff or PR summary should include:

- commands run
- whether codegen was run
- whether DB push was run
- backend smoke result
- frontend smoke result
- lifecycle scenarios checked
- remaining known gaps
- whether rollout is safe for the next phase

Suggested format:

```text
Verification completed:
- typecheck: pass/fail
- build: pass/fail
- codegen: run/not needed
- db push: run/not run
- backend smoke test: pass/fail
- frontend smoke test: pass/fail
- lifecycle scenarios checked: ...
- known gaps: ...
```

### Stop conditions

Do not claim rollout success if any of these fail:

- typecheck
- build
- backend boot
- frontend boot
- API contract consistency after codegen
- a clearly broken lifecycle scenario

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
