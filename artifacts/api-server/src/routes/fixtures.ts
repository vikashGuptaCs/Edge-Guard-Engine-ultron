import { Router } from "express";
import { db } from "@workspace/db";
import { fixturesTable, oddsSnapshotsTable, agentSignalsTable, alertsTable, scoreEventsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";

const router = Router();

function computeCountdownMs(kickoffTs?: number | null) {
  if (!kickoffTs) return null;
  return Math.max(0, kickoffTs - Date.now());
}

function computeDataFreshnessMs(lastSuccessfulIngestAt?: string | Date | null) {
  if (!lastSuccessfulIngestAt) return null;
  return Math.max(0, Date.now() - new Date(lastSuccessfulIngestAt).getTime());
}

function isLiveMonitoringState(status?: string | null, monitoringState?: string | null) {
  const normalizedStatus = status?.toLowerCase();
  return monitoringState === "live" || monitoringState === "halftime" || normalizedStatus === "live" || normalizedStatus === "halftime";
}

function isFinishedMonitoringState(status?: string | null, monitoringState?: string | null) {
  const normalizedStatus = status?.toLowerCase();
  return monitoringState === "finished" || monitoringState === "archived" || normalizedStatus === "finished";
}

function mapFixtureResponse(fixture: typeof fixturesTable.$inferSelect) {
  const isLive = isLiveMonitoringState(fixture.status, fixture.monitoringState);
  const isFinished = isFinishedMonitoringState(fixture.status, fixture.monitoringState);

  return {
    fixtureId: fixture.fixtureId,
    competition: fixture.competition,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    kickoffTs: fixture.kickoffTs,
    status: fixture.status,
    homeScore: fixture.homeScore,
    awayScore: fixture.awayScore,
    minutePlayed: fixture.minutePlayed,
    currentEdgeScore: fixture.currentEdgeScore,
    feedLatencyMs: fixture.feedLatencyMs,
    monitoringState: fixture.monitoringState ?? null,
    feedHealth: fixture.feedHealth ?? null,
    lastSuccessfulIngestAt: fixture.lastSuccessfulIngestAt?.toISOString() ?? null,
    countdownMs: isLive || isFinished ? null : computeCountdownMs(Number(fixture.kickoffTs)),
    isLive,
    isFinished,
    dataFreshnessMs: computeDataFreshnessMs(fixture.lastSuccessfulIngestAt),
    finishedAt: fixture.finishedAt?.toISOString() ?? null,
    archivedAt: fixture.archivedAt?.toISOString() ?? null,
    lastIngestError: fixture.lastIngestError,
  };
}

router.get("/fixtures", async (req, res) => {
  try {
    if (!db) {
      req.log.warn("listFixtures called but database not initialized");
      res.json([]);
      return;
    }
    const { status, limit } = req.query;
    let query = db.select().from(fixturesTable).$dynamic();
    if (status) {
      query = query.where(eq(fixturesTable.status, status as string));
    }
    const lim = limit ? parseInt(limit as string) : 50;
    const fixtures = await query.orderBy(desc(fixturesTable.kickoffTs)).limit(lim);
    res.json(fixtures.map(mapFixtureResponse));
    return;
  } catch (err) {
    req.log.error({ err }, "listFixtures error");
    res.json([]);
    return;
  }
});

router.get("/fixtures/:fixtureId", async (req, res) => {
  try {
    const fixtureId = parseInt(req.params.fixtureId, 10);
    const [fixture] = await db.select().from(fixturesTable).where(eq(fixturesTable.fixtureId, fixtureId));
    if (!fixture) {
      res.status(404).json({ error: "Fixture not found" });
      return;
    }
    res.json(mapFixtureResponse(fixture));
    return;
  } catch (err) {
    req.log.error({ err }, "getFixture error");
    res.status(500).json({ error: "Internal server error" });
    return;
  }
});

router.get("/fixtures/:fixtureId/odds", async (req, res) => {
  try {
    const fixtureId = parseInt(req.params.fixtureId);
    const snapshots = await db
      .select()
      .from(oddsSnapshotsTable)
      .where(eq(oddsSnapshotsTable.fixtureId, fixtureId))
      .orderBy(desc(oddsSnapshotsTable.ts))
      .limit(200);
    res.json(snapshots.map(s => ({
      id: s.id,
      fixtureId: s.fixtureId,
      ts: s.ts,
      market: s.market,
      selection: s.selection,
      stablePrice: parseFloat(s.stablePrice),
      spread: parseFloat(s.spread),
      volume: parseFloat(s.volume),
    })));
  } catch (err) {
    req.log.error({ err }, "getFixtureOdds error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/fixtures/:fixtureId/agents", async (req, res) => {
  try {
    const fixtureId = parseInt(req.params.fixtureId);
    const signals = await db
      .select()
      .from(agentSignalsTable)
      .where(eq(agentSignalsTable.fixtureId, fixtureId))
      .orderBy(desc(agentSignalsTable.ts))
      .limit(100);
    res.json(signals.map(s => ({
      id: s.id,
      fixtureId: s.fixtureId,
      ts: s.ts,
      agentName: s.agentName,
      signalType: s.signalType,
      confidence: parseFloat(s.confidence),
      payload: s.payload,
    })));
  } catch (err) {
    req.log.error({ err }, "getFixtureAgentSignals error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/fixtures/:fixtureId/timeline", async (req, res) => {
  try {
    const fixtureId = parseInt(req.params.fixtureId);
    const [odds, signals, alerts, scoreEvents] = await Promise.all([
      db.select().from(oddsSnapshotsTable).where(eq(oddsSnapshotsTable.fixtureId, fixtureId)).orderBy(oddsSnapshotsTable.ts).limit(500),
      db.select().from(agentSignalsTable).where(eq(agentSignalsTable.fixtureId, fixtureId)).orderBy(agentSignalsTable.ts).limit(500),
      db.select().from(alertsTable).where(eq(alertsTable.fixtureId, fixtureId)).orderBy(alertsTable.ts),
      db.select().from(scoreEventsTable).where(eq(scoreEventsTable.fixtureId, fixtureId)).orderBy(scoreEventsTable.minute),
    ]);
    res.json({
      fixtureId,
      odds: odds.map(s => ({
        id: s.id,
        fixtureId: s.fixtureId,
        ts: s.ts,
        market: s.market,
        selection: s.selection,
        stablePrice: parseFloat(s.stablePrice),
        spread: parseFloat(s.spread),
        volume: parseFloat(s.volume),
      })),
      signals: signals.map(s => ({
        id: s.id,
        fixtureId: s.fixtureId,
        ts: s.ts,
        agentName: s.agentName,
        signalType: s.signalType,
        confidence: parseFloat(s.confidence),
        payload: s.payload,
      })),
      alerts: alerts.map(a => ({
        id: a.id,
        userId: a.userId,
        fixtureId: a.fixtureId,
        ts: a.ts,
        edgeScore: a.edgeScore,
        narration: a.narration,
        action: a.action,
        fired: a.fired,
      })),
      scoreEvents: scoreEvents.map(e => ({
        id: e.id,
        fixtureId: e.fixtureId,
        ts: e.ts,
        minute: e.minute,
        eventType: e.eventType,
        participant: e.participant,
        meta: e.meta,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "getFixtureTimeline error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
