import { Router } from "express";
import { db } from "@workspace/db";
import { receiptsTable, alertsTable, fixturesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { CreateReceiptBody } from "@workspace/api-zod";

const router = Router();

router.get("/receipts", async (req, res) => {
  try {
    const { status, limit } = req.query;
    let query = db.select().from(receiptsTable).$dynamic();
    if (status) {
      query = query.where(eq(receiptsTable.status, status as string));
    }
    const lim = limit ? parseInt(limit as string) : 50;
    const receipts = await query.orderBy(desc(receiptsTable.ts)).limit(lim);

    const fixtureIds = [...new Set(receipts.map(r => r.fixtureId))];
    const fixtures = fixtureIds.length > 0
      ? await Promise.all(fixtureIds.map(id => db.select().from(fixturesTable).where(eq(fixturesTable.fixtureId, id)).then(r => r[0])))
      : [];
    const fixtureMap = Object.fromEntries(fixtures.filter(Boolean).map(f => [f!.fixtureId, f!]));

    res.json(receipts.map(r => ({
      id: r.id,
      userId: r.userId,
      alertId: r.alertId,
      txSignature: r.txSignature,
      memoJson: r.memoJson,
      cluster: r.cluster,
      ts: r.ts,
      status: r.status,
      fixture: fixtureMap[r.fixtureId] ? {
        fixtureId: fixtureMap[r.fixtureId].fixtureId,
        homeTeam: fixtureMap[r.fixtureId].homeTeam,
        awayTeam: fixtureMap[r.fixtureId].awayTeam,
        competition: fixtureMap[r.fixtureId].competition,
        status: fixtureMap[r.fixtureId].status,
        kickoffTs: fixtureMap[r.fixtureId].kickoffTs,
      } : null,
    })));
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
    const [receipt] = await db.insert(receiptsTable).values({
      alertId: body.alertId ?? null,
      fixtureId: body.fixtureId,
      txSignature: body.txSignature,
      memoJson: body.memoJson,
      cluster: body.cluster,
      ts: Date.now(),
      status: body.status,
    }).returning();
    res.status(201).json({
      id: receipt.id,
      userId: receipt.userId,
      alertId: receipt.alertId,
      txSignature: receipt.txSignature,
      memoJson: receipt.memoJson,
      cluster: receipt.cluster,
      ts: receipt.ts,
      status: receipt.status,
    });
    return;
  } catch (err) {
    req.log.error({ err }, "createReceipt error");
    res.status(500).json({ error: "Internal server error" });
    return;
  }
});

router.post("/receipts/:receiptId/retry", async (req, res) => {
  try {
    const receiptId = parseInt(req.params.receiptId);
    const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, receiptId));
    if (!receipt) {
      res.status(404).json({ error: "Receipt not found" });
      return;
    }
    const [updated] = await db
      .update(receiptsTable)
      .set({ status: "pending" })
      .where(eq(receiptsTable.id, receiptId))
      .returning();
    res.json({
      id: updated.id,
      userId: updated.userId,
      alertId: updated.alertId,
      txSignature: updated.txSignature,
      memoJson: updated.memoJson,
      cluster: updated.cluster,
      ts: updated.ts,
      status: updated.status,
    });
    return;
  } catch (err) {
    req.log.error({ err }, "retryReceipt error");
    res.status(500).json({ error: "Internal server error" });
    return;
  }
});

export default router;
