import {
  pgTable,
  bigserial,
  bigint,
  integer,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scoreEventsTable = pgTable(
  "score_events",
  {
    // score_events = append-only event timeline
    id: bigserial("id", { mode: "number" }).primaryKey(),
    fixtureId: bigint("fixture_id", { mode: "number" }).notNull(),
    ts: bigint("ts", { mode: "number" }).notNull(),
    minute: integer("minute").notNull(),
    eventType: text("event_type").notNull(),
    participant: text("participant").notNull(),
    meta: jsonb("meta"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("score_events_fixture_id_idx").on(t.fixtureId),
    index("score_events_fixture_ts_idx").on(t.fixtureId, t.ts),
  ]
);

export const insertScoreEventSchema = createInsertSchema(scoreEventsTable).omit({
  id: true,
  createdAt: true,
  syncedAt: true,
});
export type InsertScoreEvent = z.infer<typeof insertScoreEventSchema>;
export type ScoreEvent = typeof scoreEventsTable.$inferSelect;
