# EdgeGuard v3.0

Institutional quant trading dashboard that defends against market microstructure traps (latency arbitrage, spoofing, slippage) using 5 real-time risk agents and an on-chain Solana audit trail.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/edgeguard run dev` — run the frontend (port 18486)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 18 + Vite, Wouter routing, TanStack Query, shadcn/ui, Recharts, Framer Motion, next-themes
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — Source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle schema files (fixtures, odds-snapshots, score-events, risk-metrics, agent-signals, alerts, receipts)
- `artifacts/api-server/src/routes/` — Express route handlers (fixtures, agents, alerts, receipts, dashboard, txline, narrate)
- `artifacts/edgeguard/src/` — React frontend
  - `pages/` — LandingPage, AuthPage, dashboard/* pages
  - `components/layout/` — TopBar, Sidebar, StatsBar, DashboardLayout
  - `components/dashboard/` — AgentCard, LiveTicker, RiskGrid, OddsLadder, TimelineReplaySlider, KillSwitch, ReceiptTable
  - `hooks/` — use-wallet, use-autopilot, use-theme

## Architecture decisions

- **OpenAPI-first**: All API contracts defined in `lib/api-spec/openapi.yaml` and codegen'd into React Query hooks + Zod validators
- **Wallet is client-side only**: WalletContext simulates Phantom/manual key in-browser; no server-side wallet secrets
- **TxLINE tokens in sessionStorage**: API tokens minted per-session via wallet signature, never persisted server-side
- **Narration uses templates by default**: Gemini AI is stubbed with pre-cached template narrations (rate-limited fallback approach)
- **Dashboard routing**: wouter requires explicit `/dashboard` AND `/dashboard/*` routes when nesting to handle both the exact path and sub-paths

## Product

- Landing page with terminal aesthetic and Connect Wallet CTA
- Auth page with Phantom/manual key wallet connector
- Dashboard overview: live ticker + active risk grid with 5-second polling
- Match detail: timeline replay slider + Recharts odds ladder
- Agents page: 5 glassmorphism agent heartbeat cards (Sentinel, Overreaction, Volatility, Pattern, Orchestrator)
- Alerts history with AI-narrated explanations and EXECUTE/VETO action badges
- Receipts audit trail: on-chain Memo tx records with Explorer links and Retry button
- Settings: autopilot threshold, slippage tolerance, network toggle

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- **Wouter nested routing**: Always add both `/dashboard` AND `/dashboard/*` routes in the parent Switch when nesting dashboard sub-routes — the `/*` wildcard alone does NOT match the exact parent path
- **Orval TS2308**: Endpoints with BOTH path params AND query params generate colliding `*Params` type names. Solution: remove query params from path-param endpoints; move to separate query-only endpoints
- **DB schema push**: Run `pnpm --filter @workspace/db run push` after any schema changes in `lib/db/src/schema/`
- Always run codegen after spec changes: `pnpm --filter @workspace/api-spec run codegen`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
