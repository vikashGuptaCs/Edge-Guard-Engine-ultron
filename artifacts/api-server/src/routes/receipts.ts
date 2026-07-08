import { Router } from "express";
import { db } from "@workspace/db";
import { receiptsTable, alertsTable, fixturesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { CreateReceiptBody, UpdateReceiptLifecycleBody } from "@workspace/api-zod";

const router = Router();

function inferProposalStatus(args: {
  status: string;
  proposalStatus?: string | null;
  executionMode?: string | null;
}) {
  if (args.proposalStatus) {
    return args.proposalStatus;
  }

  if (args.status === "proposed") {
    return "proposed";
  }

  if (args.status === "approved" || args.status === "submitted" || args.status === "confirmed" || args.status === "failed") {
    return args.executionMode ? "approved" : null;
  }

  if (args.status === "vetoed") {
    return "vetoed";
  }

  return null;
}

function assertReceiptSubmissionAllowed(args: {
  executionMode?: string | null;
  proposalStatus?: string | null;
}) {
  const { executionMode, proposalStatus } = args;

  if (executionMode === "autopilot" && proposalStatus !== "approved") {
    throw new Error("Autopilot submissions require approval before execution.");
  }
}

async function hydrateReceiptRelations(
  receipts: Array<(typeof receiptsTable.$inferSelect)>
) {
  const fixtureIds = [...new Set(receipts.map((receipt) => receipt.fixtureId))];
  const alertIds = [...new Set(receipts.map((receipt) => receipt.alertId).filter((value): value is number => value !== null))];

  const [fixtures, alerts] = await Promise.all([
    fixtureIds.length > 0
      ? Promise.all(fixtureIds.map((id) => db.select().from(fixturesTable).where(eq(fixturesTable.fixtureId, id)).then((rows) => rows[0])))
      : Promise.resolve([]),
    alertIds.length > 0
      ? Promise.all(alertIds.map((id) => db.select().from(alertsTable).where(eq(alertsTable.id, id)).then((rows) => rows[0])))
      : Promise.resolve([]),
  ]);

  return {
    fixtureMap: Object.fromEntries(fixtures.filter(Boolean).map((fixture) => [fixture!.fixtureId, fixture!])),
    alertMap: Object.fromEntries(alerts.filter(Boolean).map((alert) => [alert!.id, alert!])),
  };
}

function serializeReceipt(
  receipt: typeof receiptsTable.$inferSelect,
  relations?: {
    fixtureMap?: Record<number, typeof fixturesTable.$inferSelect>;
    alertMap?: Record<number, typeof alertsTable.$inferSelect>;
  }
) {
  const fixture = relations?.fixtureMap?.[receipt.fixtureId];
  const alert = receipt.alertId ? relations?.alertMap?.[receipt.alertId] : null;

  return {
    id: receipt.id,
    userId: receipt.userId,
    alertId: receipt.alertId,
    txSignature: receipt.txSignature,
    memoJson: receipt.memoJson,
    cluster: receipt.cluster,
    ts: receipt.ts,
    status: receipt.status,
    proposalStatus: receipt.proposalStatus,
    approvedBy: receipt.approvedBy,
    approvedAt: receipt.approvedAt,
    vetoedAt: receipt.vetoedAt,
    submittedAt: receipt.submittedAt,
    confirmedAt: receipt.confirmedAt,
    failedAt: receipt.failedAt,
    executionMode: receipt.executionMode,
    fixture: fixture
      ? {
          fixtureId: fixture.fixtureId,
          homeTeam: fixture.homeTeam,
          awayTeam: fixture.awayTeam,
          competition: fixture.competition,
          status: fixture.status,
          kickoffTs: fixture.kickoffTs,
        }
      : null,
    alert: alert
      ? {
          id: alert.id,
          userId: alert.userId,
          fixtureId: alert.fixtureId,
          ts: alert.ts,
          edgeScore: alert.edgeScore,
          narration: alert.narration,
          action: alert.action,
          fired: alert.fired,
          lifecycleState: alert.lifecycleState,
          feedHealth: alert.feedHealth,
          confidenceBand: alert.confidenceBand,
        }
      : null,
  };
}

router.get("/receipts", async (req, res) => {
  try {
    const { status, limit } = req.query;
    let query = db.select().from(receiptsTable).$dynamic();
    if (status) {
      query = query.where(eq(receiptsTable.status, status as string));
    }
    const lim = limit ? parseInt(limit as string) : 50;
    const receipts = await query.orderBy(desc(receiptsTable.ts)).limit(lim);
    const relations = await hydrateReceiptRelations(receipts);

    res.json(receipts.map((receipt) => serializeReceipt(receipt, relations)));
    return;
  } catch (err) {
    req.log.error({ err }, "listReceipts error");
    res.status(500).json({ error: "Internal server error" });
    return;
  }
});

router.post("/receipts", async (req, res) => {
  try {
    const parsed = CreateReceiptBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const body = parsed.data;
    const proposalStatus = inferProposalStatus({
      status: body.status,
      proposalStatus: body.proposalStatus,
      executionMode: body.executionMode,
    });
    const now = new Date();
    const [receipt] = await db.insert(receiptsTable).values({
      alertId: body.alertId ?? null,
      fixtureId: body.fixtureId,
      txSignature: body.txSignature ?? null,
      memoJson: body.memoJson,
      cluster: body.cluster,
      ts: Date.now(),
      status: body.status,
      proposalStatus,
      approvedBy: body.approvedBy ?? null,
      approvedAt: proposalStatus === "approved" ? now : null,
      vetoedAt: body.status === "vetoed" ? now : null,
      submittedAt: body.status === "submitted" || body.status === "confirmed" || body.status === "failed" ? now : null,
      confirmedAt: body.status === "confirmed" ? now : null,
      failedAt: body.status === "failed" ? now : null,
      executionMode: body.executionMode ?? null,
    }).returning();
    const relations = await hydrateReceiptRelations([receipt]);
    res.status(201).json(serializeReceipt(receipt, relations));
    return;
  } catch (err) {
    req.log.error({ err }, "createReceipt error");
    res.status(500).json({ error: "Internal server error" });
    return;
  }
});

router.post("/receipts/:receiptId/lifecycle", async (req, res) => {
  try {
    const receiptId = parseInt(req.params.receiptId, 10);
    const parsed = UpdateReceiptLifecycleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, receiptId));
    if (!receipt) {
      res.status(404).json({ error: "Receipt not found" });
      return;
    }

    const body = parsed.data;
    const now = new Date();
    let update: Partial<typeof receiptsTable.$inferInsert>;

    switch (body.action) {
      case "approve":
        update = {
          status: "approved",
          proposalStatus: "approved",
          approvedBy: body.approvedBy ?? receipt.approvedBy ?? null,
          approvedAt: now,
        };
        break;
      case "submit":
        assertReceiptSubmissionAllowed({
          executionMode: receipt.executionMode,
          proposalStatus: receipt.proposalStatus,
        });
        update = {
          status: "submitted",
          txSignature: body.txSignature ?? receipt.txSignature,
          proposalStatus: receipt.proposalStatus ?? inferProposalStatus({ status: "submitted", executionMode: receipt.executionMode }),
          approvedAt: receipt.approvedAt ?? now,
          submittedAt: now,
        };
        break;
      case "confirm":
        update = {
          status: "confirmed",
          submittedAt: receipt.submittedAt ?? now,
          confirmedAt: now,
        };
        break;
      case "fail":
        update = {
          status: "failed",
          submittedAt: receipt.submittedAt ?? now,
          failedAt: now,
        };
        break;
      case "veto":
        update = {
          status: "vetoed",
          proposalStatus: "vetoed",
          vetoedAt: now,
        };
        break;
      default:
        res.status(400).json({ error: "Unsupported lifecycle action" });
        return;
    }

    const [updated] = await db.update(receiptsTable).set(update).where(eq(receiptsTable.id, receiptId)).returning();
    const relations = await hydrateReceiptRelations([updated]);
    res.json(serializeReceipt(updated, relations));
    return;
  } catch (err) {
    req.log.error({ err }, "updateReceiptLifecycle error");
    res.status(500).json({ error: "Internal server error" });
    return;
  }
});

router.post("/receipts/:receiptId/retry", async (req, res) => {
  try {
    const receiptId = parseInt(req.params.receiptId, 10);
    const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, receiptId));
    if (!receipt) {
      res.status(404).json({ error: "Receipt not found" });
      return;
    }

    if (receipt.status !== "failed" && receipt.status !== "vetoed") {
      res.status(400).json({ error: "Only failed or vetoed receipts can be retried" });
      return;
    }

    assertReceiptSubmissionAllowed({
      executionMode: receipt.executionMode,
      proposalStatus: receipt.proposalStatus,
    });

    const [updated] = await db
      .update(receiptsTable)
      .set({
        status: "submitted",
        submittedAt: new Date(),
        failedAt: null,
        confirmedAt: null,
      })
      .where(eq(receiptsTable.id, receiptId))
      .returning();
    const relations = await hydrateReceiptRelations([updated]);
    res.json(serializeReceipt(updated, relations));
    return;
  } catch (err) {
    req.log.error({ err }, "retryReceipt error");
    res.status(500).json({ error: "Internal server error" });
    return;
  }
});

export default router;
