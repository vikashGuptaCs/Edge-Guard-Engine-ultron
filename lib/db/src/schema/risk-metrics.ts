import { pgTable, bigserial, bigint, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const riskMetricsTable = pgTable("risk_metrics", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  fixtureId: bigint("fixture_id", { mode: "number" }).notNull(),
  ts: bigint("ts", { mode: "number" }).notNull(),
  latencyMs: integer("latency_ms").notNull(),
  bidAskSpread: numeric("bid_ask_spread", { precision: 10, scale: 4 }),
  liquidityDepth: numeric("liquidity_depth", { precision: 18, scale: 4 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRiskMetricSchema = createInsertSchema(riskMetricsTable).omit({ id: true, createdAt: true });
export type InsertRiskMetric = z.infer<typeof insertRiskMetricSchema>;
export type RiskMetric = typeof riskMetricsTable.$inferSelect;
