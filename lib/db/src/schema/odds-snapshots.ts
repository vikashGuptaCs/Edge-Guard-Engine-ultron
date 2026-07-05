import { pgTable, bigserial, bigint, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const oddsSnapshotsTable = pgTable("odds_snapshots", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  fixtureId: bigint("fixture_id", { mode: "number" }).notNull(),
  ts: bigint("ts", { mode: "number" }).notNull(),
  market: text("market").notNull(),
  selection: text("selection").notNull(),
  stablePrice: numeric("stable_price", { precision: 10, scale: 4 }).notNull(),
  spread: numeric("spread", { precision: 10, scale: 4 }).notNull(),
  volume: numeric("volume", { precision: 18, scale: 4 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOddsSnapshotSchema = createInsertSchema(oddsSnapshotsTable).omit({ id: true, createdAt: true });
export type InsertOddsSnapshot = z.infer<typeof insertOddsSnapshotSchema>;
export type OddsSnapshot = typeof oddsSnapshotsTable.$inferSelect;
