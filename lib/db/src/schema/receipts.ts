import { pgTable, bigserial, uuid, bigint, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const receiptStatusValues = ["proposed", "approved", "submitted", "confirmed", "failed", "vetoed"] as const;
export const receiptProposalStatusValues = ["proposed", "approved", "vetoed"] as const;
export const receiptExecutionModeValues = ["manual", "autopilot"] as const;

export const receiptStatusSchema = z.enum(receiptStatusValues);
export const receiptProposalStatusSchema = z.enum(receiptProposalStatusValues);
export const receiptExecutionModeSchema = z.enum(receiptExecutionModeValues);

export const receiptsTable = pgTable("receipts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id"),
  alertId: bigint("alert_id", { mode: "number" }),
  fixtureId: bigint("fixture_id", { mode: "number" }).notNull(),
  txSignature: text("tx_signature"),
  memoJson: jsonb("memo_json"),
  cluster: text("cluster").notNull().default("devnet"),
  ts: bigint("ts", { mode: "number" }).notNull(),
  status: text("status").notNull().default("proposed"),
  proposalStatus: text("proposal_status"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  vetoedAt: timestamp("vetoed_at", { withTimezone: true }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  executionMode: text("execution_mode"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertReceiptSchema = createInsertSchema(receiptsTable).omit({ id: true, createdAt: true });
export type InsertReceipt = z.infer<typeof insertReceiptSchema>;
export type Receipt = typeof receiptsTable.$inferSelect;
