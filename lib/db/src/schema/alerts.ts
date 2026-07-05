import { pgTable, bigserial, uuid, bigint, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const alertsTable = pgTable("alerts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id"),
  fixtureId: bigint("fixture_id", { mode: "number" }).notNull(),
  ts: bigint("ts", { mode: "number" }).notNull(),
  edgeScore: integer("edge_score").notNull(),
  narration: text("narration"),
  action: text("action").notNull(),
  fired: boolean("fired").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAlertSchema = createInsertSchema(alertsTable).omit({ id: true, createdAt: true });
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;
