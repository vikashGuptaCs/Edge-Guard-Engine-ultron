import { pgTable, bigint, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fixturesTable = pgTable("fixtures", {
  fixtureId: bigint("fixture_id", { mode: "number" }).primaryKey(),
  competition: text("competition").notNull(),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  kickoffTs: bigint("kickoff_ts", { mode: "number" }).notNull(),
  status: text("status").notNull().default("pre"),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  minutePlayed: integer("minute_played"),
  currentEdgeScore: integer("current_edge_score"),
  feedLatencyMs: integer("feed_latency_ms"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFixtureSchema = createInsertSchema(fixturesTable).omit({ createdAt: true });
export type InsertFixture = z.infer<typeof insertFixtureSchema>;
export type Fixture = typeof fixturesTable.$inferSelect;
