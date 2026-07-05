import { Router } from "express";
import { db } from "@workspace/db";
import { alertsTable, fixturesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/alerts", async (req, res) => {
  try {
    const { fixtureId, action, limit } = req.query;
    let query = db.select().from(alertsTable).$dynamic();
    if (fixtureId) {
      query = query.where(eq(alertsTable.fixtureId, parseInt(fixtureId as string)));
    }
    if (action) {
      query = query.where(eq(alertsTable.action, action as string));
    }
    const lim = limit ? parseInt(limit as string) : 50;
    const alerts = await query.orderBy(desc(alertsTable.ts)).limit(lim);

    const fixtureIds = [...new Set(alerts.map(a => a.fixtureId))];
    const fixtures = fixtureIds.length > 0
      ? await db.select().from(fixturesTable).where(eq(fixturesTable.fixtureId, fixtureIds[0]))
      : [];
    const fixtureMap = Object.fromEntries(fixtures.map(f => [f.fixtureId, f]));

    res.json(alerts.map(a => ({
      id: a.id,
      userId: a.userId,
      fixtureId: a.fixtureId,
      ts: a.ts,
      edgeScore: a.edgeScore,
      narration: a.narration,
      action: a.action,
      fired: a.fired,
      fixture: fixtureMap[a.fixtureId] ? {
        fixtureId: fixtureMap[a.fixtureId].fixtureId,
        homeTeam: fixtureMap[a.fixtureId].homeTeam,
        awayTeam: fixtureMap[a.fixtureId].awayTeam,
        competition: fixtureMap[a.fixtureId].competition,
        status: fixtureMap[a.fixtureId].status,
        kickoffTs: fixtureMap[a.fixtureId].kickoffTs,
      } : null,
    })));
  } catch (err) {
    req.log.error({ err }, "listAlerts error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/alerts/:alertId", async (req, res) => {
  try {
    const alertId = parseInt(req.params.alertId);
    const [alert] = await db.select().from(alertsTable).where(eq(alertsTable.id, alertId));
    if (!alert) {
      return res.status(404).json({ error: "Alert not found" });
    }
    const [fixture] = await db.select().from(fixturesTable).where(eq(fixturesTable.fixtureId, alert.fixtureId));
    res.json({
      id: alert.id,
      userId: alert.userId,
      fixtureId: alert.fixtureId,
      ts: alert.ts,
      edgeScore: alert.edgeScore,
      narration: alert.narration,
      action: alert.action,
      fired: alert.fired,
      fixture: fixture ? {
        fixtureId: fixture.fixtureId,
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        competition: fixture.competition,
        status: fixture.status,
        kickoffTs: fixture.kickoffTs,
      } : null,
    });
  } catch (err) {
    req.log.error({ err }, "getAlert error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
