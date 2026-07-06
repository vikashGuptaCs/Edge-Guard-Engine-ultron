import { pgTable, bigint, text, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

export const txlineEventsTable = pgTable(
  "txline_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    fixtureId: bigint("fixture_id", { mode: "number" }).notNull(),
    ts: bigint("ts", { mode: "number" }).notNull(),
    category: text("category").notNull(),
    payload: jsonb("payload").notNull(),
  },
  (t) => [uniqueIndex("txline_events_fixture_ts_cat").on(t.fixtureId, t.ts, t.category)]
);

export type TxlineEvent = typeof txlineEventsTable.$inferSelect;
