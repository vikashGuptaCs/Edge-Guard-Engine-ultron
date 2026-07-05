import { pgTable, bigserial, uuid, bigint, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const receiptsTable = pgTable("receipts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id"),
  alertId: bigint("alert_id", { mode: "number" }),
  fixtureId: bigint("fixture_id", { mode: "number" }).notNull(),
  txSignature: text("tx_signature"),
  memoJson: jsonb("memo_json"),
  cluster: text("cluster").notNull().default("devnet"),
  ts: bigint("ts", { mode: "number" }).notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertReceiptSchema = createInsertSchema(receiptsTable).omit({ id: true, createdAt: true });
export type InsertReceipt = z.infer<typeof insertReceiptSchema>;
export type Receipt = typeof receiptsTable.$inferSelect;
