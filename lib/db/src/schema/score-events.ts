import { pgTable, bigserial, bigint, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scoreEventsTable = pgTable("score_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  fixtureId: bigint("fixture_id", { mode: "number" }).notNull(),
  ts: bigint("ts", { mode: "number" }).notNull(),
  minute: integer("minute").notNull(),
  eventType: text("event_type").notNull(),
  participant: text("participant").notNull(),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertScoreEventSchema = createInsertSchema(scoreEventsTable).omit({ id: true, createdAt: true });
export type InsertScoreEvent = z.infer<typeof insertScoreEventSchema>;
export type ScoreEvent = typeof scoreEventsTable.$inferSelect;
