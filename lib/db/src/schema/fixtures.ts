import { bigint, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fixturesTable = pgTable("fixtures", {
  // fixtures = canonical current state + ingestion control plane
  fixtureId: bigint("fixture_id", { mode: "number" }).primaryKey(),
  competition: text("competition").notNull(),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  kickoffTs: bigint("kickoff_ts", { mode: "number" }).notNull(),
  status: text("status").notNull().default("pre"),
  monitoringState: text("monitoring_state").notNull().default("discovered"),
  feedHealth: text("feed_health").notNull().default("unknown"),
  feedEmptyCount: integer("feed_empty_count").notNull().default(0),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  minutePlayed: integer("minute_played"),
  currentEdgeScore: integer("current_edge_score"),
  feedLatencyMs: integer("feed_latency_ms"),
  lastFixtureSyncAt: timestamp("last_fixture_sync_at", { withTimezone: true }),
  lastOddsSyncAt: timestamp("last_odds_sync_at", { withTimezone: true }),
  lastScoresSyncAt: timestamp("last_scores_sync_at", { withTimezone: true }),
  lastOddsCursor: text("last_odds_cursor"),
  lastScoresCursor: text("last_scores_cursor"),
  preMatchNotifiedAt: timestamp("pre_match_notified_at", { withTimezone: true }),
  firstLiveAt: timestamp("first_live_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  lastSuccessfulIngestAt: timestamp("last_successful_ingest_at", { withTimezone: true }),
  lastIngestError: text("last_ingest_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertFixtureSchema = createInsertSchema(fixturesTable).omit({ createdAt: true });
export type InsertFixture = z.infer<typeof insertFixtureSchema>;
export type Fixture = typeof fixturesTable.$inferSelect;
