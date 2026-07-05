import { pgTable, bigserial, bigint, text, numeric, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentSignalsTable = pgTable("agent_signals", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  fixtureId: bigint("fixture_id", { mode: "number" }).notNull(),
  ts: bigint("ts", { mode: "number" }).notNull(),
  agentName: text("agent_name").notNull(),
  signalType: text("signal_type").notNull(),
  confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAgentSignalSchema = createInsertSchema(agentSignalsTable).omit({ id: true, createdAt: true });
export type InsertAgentSignal = z.infer<typeof insertAgentSignalSchema>;
export type AgentSignal = typeof agentSignalsTable.$inferSelect;
